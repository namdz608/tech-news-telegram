import axios from "axios";
import { devopsInfraHnQueries } from "../config/devops-infra-sources";
import { env } from "../config/env";
import type { DevopsInfraSourceItem } from "../types/devops-infra";
import { compactText } from "../utils/text";
import type {
  DevopsInfraSourceAdapter,
  DevopsInfraSourceAdapterResult,
} from "./devops-infra-source.adapter";

const SEARCH_URL = "https://hn.algolia.com/api/v1/search";
const MAX_BODY_BYTES = 512 * 1024;
const HITS_PER_PAGE = 10;

interface HttpResponse {
  data: unknown;
  headers?: Readonly<Record<string, string | undefined>>;
}

interface HttpClientLike {
  get(
    url: string,
    config: {
      headers: Record<string, string>;
      params: Record<string, string | number>;
    },
  ): Promise<HttpResponse>;
}

function createDefaultHttpClient(): HttpClientLike {
  return axios.create({
    timeout: env.REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    maxContentLength: MAX_BODY_BYTES,
    maxBodyLength: MAX_BODY_BYTES,
    headers: { "User-Agent": env.USER_AGENT },
  }) as HttpClientLike;
}

export class DevopsInfraHnAdapter implements DevopsInfraSourceAdapter {
  readonly key = "hn-search";

  constructor(
    private readonly http: HttpClientLike = createDefaultHttpClient(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  isEnabled(): boolean {
    return true;
  }

  async collect(): Promise<DevopsInfraSourceAdapterResult> {
    const collectedAt = this.now();
    const fromUnix =
      Math.floor(collectedAt.getTime() / 1000) -
      env.DEVOPS_INFRA_MAX_AGE_HOURS * 3600;
    const settled = await Promise.all(
      devopsInfraHnQueries.map(async (query) => {
        try {
          const response = await this.http.get(SEARCH_URL, {
            headers: {
              Accept: "application/json",
              "User-Agent": env.USER_AGENT,
            },
            params: {
              query: query.text,
              numericFilters: `created_at_i>${fromUnix}`,
              hitsPerPage: HITS_PER_PAGE,
            },
          });
          assertJsonContentType(response.headers);
          const items = parseHits(readJsonBody(response.data)).flatMap(
            (hit) => {
              const item = mapHit(hit, collectedAt.toISOString(), fromUnix);
              return item ? [item] : [];
            },
          );
          return { ok: true as const, items };
        } catch {
          return { ok: false as const, sourceKey: `hn:${query.key}` };
        }
      }),
    );

    const uniqueItems = new Map<string, DevopsInfraSourceItem>();
    const failedSources: string[] = [];
    let successfulSourceCount = 0;
    for (const result of settled) {
      if (!result.ok) {
        failedSources.push(result.sourceKey);
        continue;
      }
      successfulSourceCount += 1;
      for (const item of result.items) {
        if (!uniqueItems.has(item.id)) {
          uniqueItems.set(item.id, item);
        }
      }
    }

    return {
      items: [...uniqueItems.values()],
      successfulSourceCount,
      failedSources,
    };
  }
}

function mapHit(
  value: unknown,
  discoveredAt: string,
  fromUnix: number,
): DevopsInfraSourceItem | undefined {
  const hit = asRecord(value);
  if (!hit) {
    return undefined;
  }

  const objectID = readText(hit.objectID);
  const title = readText(hit.title) || readText(hit.story_title);
  const publishedUnix = finiteNumber(hit.created_at_i);
  if (
    !objectID ||
    !title ||
    publishedUnix === undefined ||
    publishedUnix <= fromUnix
  ) {
    return undefined;
  }

  const rawStoryUrl = readText(hit.story_url);
  const url = readPublicHttpUrl(
    rawStoryUrl ||
      `https://news.ycombinator.com/item?id=${encodeURIComponent(objectID)}`,
  );
  if (!url) {
    return undefined;
  }

  const body = readText(hit.comment_text) || readText(hit.story_text);
  const author = readText(hit.author);
  const score = finiteNumber(hit.points);
  const comments = finiteNumber(hit.num_comments);
  const engagement =
    score === undefined && comments === undefined
      ? undefined
      : {
          ...(score === undefined ? {} : { score }),
          ...(comments === undefined ? {} : { comments }),
        };

  return {
    id: objectID,
    sourceId: "hn",
    sourceName: "Hacker News",
    title,
    url,
    summary: body,
    body,
    ...(author ? { author } : {}),
    publishedAt: new Date(publishedUnix * 1000).toISOString(),
    collectedAt: discoveredAt,
    discoveredAt,
    discoveryChannel: "hn",
    communityKey: "hn",
    sourceQuotaKey: "hn",
    sourceTextStatus: body ? "full" : "incomplete",
    answers: [],
    ...(engagement ? { engagement } : {}),
  };
}

function parseHits(payload: unknown): unknown[] {
  const hits = asRecord(payload)?.hits;
  if (!Array.isArray(hits)) {
    throw new Error("hn-hits");
  }
  return hits;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readText(value: unknown): string {
  return typeof value === "string" ? compactText(value) : "";
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readPublicHttpUrl(value: string): string | undefined {
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
    throw new Error("hn-json");
  }
}

function assertJsonContentType(
  headers?: Readonly<Record<string, string | undefined>>,
): void {
  if (!headers) {
    throw new Error("hn-content-type");
  }
  const record = headers as Record<string, unknown>;
  const direct = record["content-type"] ?? record["Content-Type"];
  const getter = (headers as { get?: (name: string) => unknown }).get;
  const value =
    typeof direct === "string"
      ? direct
      : typeof getter === "function"
        ? getter.call(headers, "content-type")
        : undefined;
  if (
    typeof value !== "string" ||
    value.split(";", 1)[0].trim().toLowerCase() !== "application/json"
  ) {
    throw new Error("hn-content-type");
  }
}
