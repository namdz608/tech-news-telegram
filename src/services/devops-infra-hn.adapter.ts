import axios from "axios";
import { devopsInfraHnQueries } from "../config/devops-infra-sources";
import { env } from "../config/env";
import type { DevopsInfraSourceItem } from "../types/devops-infra";
import { htmlToCompactText } from "../utils/html-text";
import { devopsInfraFailureParts } from "../utils/devops-infra-http-error";
import { createDohFallbackHttpsAgent } from "../utils/doh-dns";
import { compactText } from "../utils/text";
import type {
  DevopsInfraSourceAdapter,
  DevopsInfraSourceAdapterResult,
} from "./devops-infra-source.adapter";

const SEARCH_URL = "https://hn.algolia.com/api/v1/search";
const ITEM_URL = "https://hn.algolia.com/api/v1/items";
const MAX_BODY_BYTES = 512 * 1024;
const HITS_PER_PAGE = 10;
const MAX_COMMENTS = 8;
const MAX_COMMENT_FETCHES = 15;
const MAX_COMMENT_DEPTH = 3;

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
    httpsAgent: createDohFallbackHttpsAgent("hn.algolia.com"),
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
              tags: "story",
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
        } catch (error) {
          const failure = devopsInfraFailureParts(error);
          console.warn(
            "devops-infra hn failed",
            `hn:${query.key}`,
            failure.statusOrCode,
            failure.name,
          );
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

    const uniqueList = [...uniqueItems.values()];
    const withComments = await mapLimited(
      uniqueList.slice(0, MAX_COMMENT_FETCHES),
      3,
      async (item) => {
        try {
          const comments = await this.collectComments(item.id);
          if (comments.length === 0) return item;
          return {
            ...item,
            answers: comments,
            sourceTextStatus: "full" as const,
          };
        } catch {
          return item;
        }
      },
    );

    return {
      items: [...withComments, ...uniqueList.slice(MAX_COMMENT_FETCHES)],
      successfulSourceCount,
      failedSources,
    };
  }

  private async collectComments(objectID: string): Promise<DevopsInfraSourceItem["answers"]> {
    const response = await this.http.get(`${ITEM_URL}/${encodeURIComponent(objectID)}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": env.USER_AGENT,
      },
      params: { hitsPerPage: MAX_COMMENTS },
    });
    assertJsonContentType(response.headers);
    return mapItemComments(readJsonBody(response.data));
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

  // Algolia returns comment/story text as an HTML fragment.
  const body = readHtmlText(hit.comment_text) || readHtmlText(hit.story_text);
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

function mapItemComments(value: unknown): DevopsInfraSourceItem["answers"] {
  const answers: DevopsInfraSourceItem["answers"][number][] = [];
  const visit = (node: unknown, depth: number): void => {
    if (answers.length >= MAX_COMMENTS || depth > MAX_COMMENT_DEPTH) return;
    const record = asRecord(node);
    if (!record) return;
    const body = readHtmlText(record.text);
    if (body) {
      const score = finiteNumber(record.points);
      answers.push({
        body,
        ...(score === undefined ? {} : { score }),
      });
    }
    const children = record.children;
    if (!Array.isArray(children)) return;
    for (const child of children) {
      visit(child, depth + 1);
    }
  };
  const root = asRecord(value);
  const children = root?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      visit(child, 0);
    }
  }
  return answers;
}

async function mapLimited<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < values.length; index += concurrency) {
    const batch = values.slice(index, index + concurrency);
    results.push(...(await Promise.all(batch.map(worker))));
  }
  return results;
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

function readHtmlText(value: unknown): string {
  return typeof value === "string" ? htmlToCompactText(value) : "";
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
