import { isIP } from "node:net";
import * as cheerio from "cheerio";
import { buildDevopsInfraWebSearchQueries } from "../config/devops-infra-sources";
import { env } from "../config/env";
import type {
  DevopsDiscoveryChannel,
  DevopsInfraSourceItem,
  SourceTextStatus,
} from "../types/devops-infra";
import { registrablePublisherKey } from "../utils/publisher-key";
import { compactText } from "../utils/text";
import { BraveWebSearchProvider } from "./brave-web-search.provider";
import type {
  DevopsInfraSourceAdapter,
  DevopsInfraSourceAdapterResult,
} from "./devops-infra-source.adapter";
import {
  SafeWebRetrievalService,
  type SafeWebContent,
} from "./safe-web-retrieval.service";
import type { WebSearchProvider, WebSearchResult } from "./web-search.provider";

const SEARCH_CONCURRENCY = 3;
const RETRIEVAL_CONCURRENCY = 3;
const RETRIEVAL_BUDGET = 15;
const MIN_SOURCE_CHARS = 80;
const MAX_SOURCE_CHARS = 2000;
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export class DevopsInfraWebSearchAdapter implements DevopsInfraSourceAdapter {
  readonly key = "web-search";

  constructor(
    private readonly provider: WebSearchProvider = new BraveWebSearchProvider(
      env.BRAVE_SEARCH_API_KEY,
    ),
    private readonly retrieval: Pick<
      SafeWebRetrievalService,
      "retrieve"
    > = new SafeWebRetrievalService(),
    private readonly now: () => Date = () => new Date(),
    private readonly maxQueries: number = env.DEVOPS_INFRA_WEB_SEARCH_MAX_QUERIES,
  ) {}

  isEnabled(): boolean {
    return this.provider.isEnabled() && this.maxQueries > 0;
  }

  async collect(): Promise<DevopsInfraSourceAdapterResult> {
    if (!this.isEnabled()) {
      return { items: [], successfulSourceCount: 0, failedSources: [] };
    }

    const queries = buildDevopsInfraWebSearchQueries(this.maxQueries);
    const settled = await mapPool(
      queries,
      SEARCH_CONCURRENCY,
      async (query) => {
        try {
          return {
            ok: true as const,
            results: await this.provider.search(query),
          };
        } catch {
          return { ok: false as const, sourceKey: `web:${query.key}` };
        }
      },
    );

    const discovered: WebSearchResult[] = [];
    const failedSources: string[] = [];
    let successfulSourceCount = 0;
    for (const result of settled) {
      if (result.ok) {
        successfulSourceCount += 1;
        discovered.push(...result.results);
      } else {
        failedSources.push(result.sourceKey);
      }
    }

    const retrievalTargets = firstUniqueSafeUrls(discovered, RETRIEVAL_BUDGET);
    const retrievedByUrl = new Map<string, SafeWebContent>();
    await mapPool(retrievalTargets, RETRIEVAL_CONCURRENCY, async (url) => {
      try {
        retrievedByUrl.set(url, await this.retrieval.retrieve(url));
      } catch {
        // Search excerpts remain usable when enrichment is unavailable.
      }
    });

    const discoveredAt = this.now();
    const items = discovered.flatMap((searchResult) => {
      const url = parsePublicHttpUrl(searchResult.url);
      const item = url
        ? mapWebResult(searchResult, url, discoveredAt, retrievedByUrl.get(url))
        : undefined;
      return item ? [item] : [];
    });

    return { items, successfulSourceCount, failedSources };
  }
}

function mapWebResult(
  result: WebSearchResult,
  url: string,
  discoveredAt: Date,
  retrieved: SafeWebContent | undefined,
): DevopsInfraSourceItem | undefined {
  const publishedAt = parseRecentTimestamp(result.publishedAt, discoveredAt);
  const title = compactText(result.title);
  const snippet = compactText(result.snippet).slice(0, MAX_SOURCE_CHARS);
  if (!publishedAt || !title || snippet.length < MIN_SOURCE_CHARS) {
    return undefined;
  }

  const retrievedText = retrieved ? extractSourceText(retrieved) : "";
  const hasFullText = retrievedText.length >= MIN_SOURCE_CHARS;
  const body = hasFullText ? retrievedText : snippet;
  const sourceTextStatus: SourceTextStatus = hasFullText
    ? "full"
    : "search-excerpt";
  const discoveryChannel = inferDiscoveryChannel(url);
  const sourceQuotaKey = registrablePublisherKey(url) ?? discoveryChannel;

  return {
    id: url,
    sourceId: "web-search",
    sourceName: compactText(result.sourceName ?? "") || sourceQuotaKey,
    title,
    url,
    summary: snippet,
    body,
    publishedAt,
    collectedAt: discoveredAt.toISOString(),
    discoveredAt: discoveredAt.toISOString(),
    discoveryChannel,
    communityKey: sourceQuotaKey,
    sourceQuotaKey,
    sourceTextStatus,
    answers: [],
  };
}

function firstUniqueSafeUrls(
  results: readonly WebSearchResult[],
  limit: number,
): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const result of results) {
    const url = parsePublicHttpUrl(result.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= limit) break;
  }
  return urls;
}

function extractSourceText(retrieved: SafeWebContent): string {
  const mediaType = retrieved.contentType
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType === "text/plain" || mediaType === "application/json") {
    return compactText(retrieved.text).slice(0, MAX_SOURCE_CHARS);
  }

  const $ = cheerio.load(retrieved.text);
  $("script, style, noscript, nav, footer, form, template, svg").remove();
  $("[aria-hidden='true'], [hidden]").remove();
  const text =
    compactText($("article").text()) ||
    compactText($("main").text()) ||
    compactText($("body").text()) ||
    compactText(
      $("meta[property='og:description']").attr("content") ??
        $("meta[name='description']").attr("content") ??
        "",
    );
  return text.slice(0, MAX_SOURCE_CHARS);
}

function inferDiscoveryChannel(url: string): DevopsDiscoveryChannel {
  const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  if (hostname === "facebook.com" || hostname.endsWith(".facebook.com")) {
    return "facebook";
  }
  if (
    hostname === "t.me" ||
    hostname === "telegram.me" ||
    hostname.endsWith(".telegram.me")
  ) {
    return "telegram";
  }
  if (
    hostname === "discord.com" ||
    hostname.endsWith(".discord.com") ||
    hostname === "discord.gg"
  ) {
    return "discord";
  }
  return "web";
}

function parsePublicHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      isUnsafeHostname(url.hostname)
    ) {
      return undefined;
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function isUnsafeHostname(rawHostname: string): boolean {
  const hostname = rawHostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost")
  ) {
    return true;
  }
  if (isIP(hostname) === 6) {
    return true;
  }
  if (isIP(hostname) !== 4) {
    return false;
  }
  const first = Number(hostname.split(".")[0]);
  const second = Number(hostname.split(".")[1]);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function parseRecentTimestamp(value: unknown, now: Date): string | undefined {
  if (typeof value !== "string" || !ISO_INSTANT.test(value.trim())) {
    return undefined;
  }
  const date = new Date(value);
  const ageMs = now.getTime() - date.getTime();
  if (
    Number.isNaN(date.getTime()) ||
    ageMs < 0 ||
    ageMs > env.DEVOPS_INFRA_MAX_AGE_HOURS * 60 * 60 * 1000
  ) {
    return undefined;
  }
  return date.toISOString();
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}
