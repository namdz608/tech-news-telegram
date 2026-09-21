import axios from "axios";
import { env } from "../config/env";
import type { DevopsInfraSourceItem } from "../types/devops-infra";
import { parseFacebookPageAllowlist } from "../utils/devops-infra-allowlist";
import { compactText } from "../utils/text";
import type {
  DevopsInfraSourceAdapter,
  DevopsInfraSourceAdapterResult,
} from "./devops-infra-source.adapter";

const GRAPH_ORIGIN = "https://graph.facebook.com/v21.0";
const GRAPH_FIELDS = "message,created_time,permalink_url";
const MAX_BODY_BYTES = 512 * 1024;

interface HttpResponse {
  data: unknown;
}

interface HttpClientLike {
  get(
    url: string,
    config: {
      headers: Record<string, string>;
      params: Record<string, string>;
    },
  ): Promise<HttpResponse>;
}

function createDefaultHttpClient(): HttpClientLike {
  return axios.create({
    timeout: env.REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    maxContentLength: MAX_BODY_BYTES,
    maxBodyLength: MAX_BODY_BYTES,
  }) as HttpClientLike;
}

export class DevopsInfraFacebookAdapter implements DevopsInfraSourceAdapter {
  readonly key = "facebook";

  constructor(
    private readonly http: HttpClientLike = createDefaultHttpClient(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  isEnabled(): boolean {
    return (
      env.FACEBOOK_ACCESS_TOKEN.trim() !== "" &&
      parseFacebookPageAllowlist(env.FACEBOOK_PAGE_ALLOWLIST).length > 0
    );
  }

  async collect(): Promise<DevopsInfraSourceAdapterResult> {
    const token = env.FACEBOOK_ACCESS_TOKEN.trim();
    const pageIds = parseFacebookPageAllowlist(env.FACEBOOK_PAGE_ALLOWLIST);
    if (!token || pageIds.length === 0) {
      return { items: [], successfulSourceCount: 0, failedSources: [] };
    }

    const discoveredAt = this.now().toISOString();
    const settled = await Promise.all(
      pageIds.map(async (pageId) => {
        const sourceKey = `facebook:${pageId}`;
        try {
          const response = await this.http.get(`${GRAPH_ORIGIN}/${pageId}/feed`, {
            headers: { Accept: "application/json" },
            params: {
              fields: GRAPH_FIELDS,
              access_token: token,
            },
          });
          return {
            ok: true as const,
            items: parsePosts(response.data).flatMap((post) => {
              const item = mapPost(post, pageId, discoveredAt);
              return item ? [item] : [];
            }),
          };
        } catch {
          return { ok: false as const, sourceKey };
        }
      }),
    );

    const items: DevopsInfraSourceItem[] = [];
    const failedSources: string[] = [];
    let successfulSourceCount = 0;
    for (const result of settled) {
      if (result.ok) {
        successfulSourceCount += 1;
        items.push(...result.items);
      } else {
        failedSources.push(result.sourceKey);
      }
    }
    return { items, successfulSourceCount, failedSources };
  }
}

function mapPost(
  value: unknown,
  pageId: string,
  discoveredAt: string,
): DevopsInfraSourceItem | undefined {
  const post = asRecord(value);
  const id = readText(post?.id);
  const body = readText(post?.message);
  const url = readPublicHttpUrl(post?.permalink_url);
  const publishedAt = readTimestamp(post?.created_time);
  if (!post || !id || !body || !url || !publishedAt) {
    return undefined;
  }

  const communityKey = `facebook:${pageId}`;
  return {
    id,
    sourceId: "facebook",
    sourceName: `Facebook Page ${pageId}`,
    title: body,
    url,
    summary: body,
    body,
    publishedAt,
    collectedAt: discoveredAt,
    discoveredAt,
    discoveryChannel: "facebook",
    communityKey,
    sourceQuotaKey: communityKey,
    sourceTextStatus: "full",
    answers: [],
  };
}

function parsePosts(payload: unknown): unknown[] {
  const data = asRecord(readJsonBody(payload))?.data;
  if (!Array.isArray(data)) {
    throw new Error("facebook-posts");
  }
  return data;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readText(value: unknown): string {
  return typeof value === "string" ? compactText(value) : "";
}

function readTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function readPublicHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function readJsonBody(data: unknown): unknown {
  if (typeof data !== "string") {
    return data;
  }
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new Error("facebook-json");
  }
}
