import * as cheerio from 'cheerio';
import { env } from '../config/env';
import { buildPoliticsSearchQueries } from '../config/gold-politics-sources';
import type {
  DiscoveryChannel,
  PoliticsSearchQuery,
  PoliticsSourceItem,
  SourceTextStatus,
} from '../types/gold-politics';
import { registrablePublisherKey } from '../utils/publisher-key';
import { compactText } from '../utils/text';
import type { PoliticsSourceAdapter, PoliticsSourceAdapterResult } from './politics-source.adapter';
import type { SafeWebContent, SafeWebRetrievalService } from './safe-web-retrieval.service';
import type { WebSearchProvider, WebSearchResult } from './web-search.provider';

const SEARCH_CONCURRENCY = 3;
const RETRIEVAL_CONCURRENCY = 3;
const MAX_SEARCHES = 8;
const RETRIEVAL_BUDGET = 15;
const MIN_SOURCE_CHARS = 80;
const MAX_SOURCE_CHARS = 2000;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const ALLEGATION_OR_PROCEEDING =
  /cáo buộc|truy tố|khởi tố|allegation|alleged|indictment|proceeding|prosecution|lawsuit/i;
const FACEBOOK_RESERVED = new Set([
  'share',
  'sharer',
  'watch',
  'reel',
  'groups',
  'events',
  'login',
  'plugins',
  'marketplace',
  'photo',
  'profile.php',
]);
const TELEGRAM_RESERVED = new Set(['s', 'share', 'joinchat', 'addstickers', 'proxy']);

export class PoliticsWebSearchAdapter implements PoliticsSourceAdapter {
  readonly key = 'web-search';

  constructor(
    private readonly provider: WebSearchProvider,
    private readonly retrieval: Pick<SafeWebRetrievalService, 'retrieve'>,
    private readonly now: () => Date = () => new Date(),
    private readonly maxQueries: number = env.GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES,
  ) {}

  isEnabled(): boolean {
    return this.provider.isEnabled() && this.maxQueries > 0;
  }

  async collect(): Promise<PoliticsSourceAdapterResult> {
    const queries = buildPoliticsSearchQueries(Math.min(MAX_SEARCHES, this.maxQueries));
    const settled = await mapPool(queries, SEARCH_CONCURRENCY, (query) => this.searchQuery(query));

    const failedSources: string[] = [];
    const discovered: WebSearchResult[] = [];
    let successfulSourceCount = 0;

    for (const entry of settled) {
      if (entry.ok) {
        successfulSourceCount += 1;
        discovered.push(...entry.results);
      } else {
        failedSources.push(entry.leafKey);
      }
    }

    const retrievalTargets = firstUniqueCanonicalUrls(discovered, RETRIEVAL_BUDGET);
    const retrievedByUrl = new Map<string, SafeWebContent>();
    await mapPool(retrievalTargets, RETRIEVAL_CONCURRENCY, async (url) => {
      try {
        retrievedByUrl.set(url, await this.retrieval.retrieve(url));
      } catch {
        // Retrieval is optional; snippet fallback is applied while mapping.
      }
    });

    const discoveredAt = this.now().toISOString();
    const items = discovered.flatMap((result) => {
      const canonicalUrl = parsePublicHttpUrl(result.url);
      const retrieved = canonicalUrl ? retrievedByUrl.get(canonicalUrl) : undefined;
      const item = mapWebResult(result, discoveredAt, retrieved);
      return item ? [item] : [];
    });

    return { items, successfulSourceCount, failedSources };
  }

  private async searchQuery(
    query: PoliticsSearchQuery,
  ): Promise<{ ok: true; results: WebSearchResult[] } | { ok: false; leafKey: string }> {
    try {
      return { ok: true, results: await this.provider.search(query) };
    } catch {
      return { ok: false, leafKey: query.key };
    }
  }
}

function firstUniqueCanonicalUrls(results: readonly WebSearchResult[], limit: number): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const result of results) {
    const url = parsePublicHttpUrl(result.url);
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    urls.push(url);
    if (urls.length >= limit) {
      break;
    }
  }
  return urls;
}

function mapWebResult(
  result: WebSearchResult,
  discoveredAt: string,
  retrieved: SafeWebContent | undefined,
): PoliticsSourceItem | undefined {
  const url = parsePublicHttpUrl(result.url);
  if (!url) {
    return undefined;
  }
  const publishedAt = parseIsoTimestamp(result.publishedAt);
  if (!publishedAt) {
    return undefined;
  }
  const title = compactText(result.title);
  if (!title) {
    return undefined;
  }

  const channel = inferDiscoveryChannel(url);
  const identity = identityFor(url, channel);
  if (!identity) {
    return undefined;
  }

  const enriched = retrieved ? extractSourceText(retrieved) : '';
  const snippet = compactText(result.snippet);
  let summary: string;
  let sourceTextStatus: SourceTextStatus;
  if (enriched.length >= MIN_SOURCE_CHARS) {
    summary = enriched.slice(0, MAX_SOURCE_CHARS);
    sourceTextStatus = 'full';
  } else if (snippet.length >= MIN_SOURCE_CHARS) {
    summary = snippet.slice(0, MAX_SOURCE_CHARS);
    sourceTextStatus = 'search-excerpt';
  } else {
    return undefined;
  }

  const searchable = `${title} ${summary}`;
  return {
    id: url,
    sourceId: 'web-search',
    sourceName: compactText(result.sourceName ?? '') || identity.key,
    title,
    url,
    summary,
    publishedAt,
    collectedAt: discoveredAt,
    topics: [],
    discoveryChannel: channel,
    discoveredAt,
    originalAccount: identity.account,
    originalUrl: url,
    sourceQuotaKey: identity.key,
    sourceTextStatus,
    evidenceKind: 'identified-report',
    evidentiaryEffect: ALLEGATION_OR_PROCEEDING.test(searchable) ? 'records-claim' : 'mentions',
    evidenceOriginKey: identity.key,
    originAttribution: {
      url,
      ...(identity.account ? { account: identity.account } : {}),
      publishedAt,
      discoveredAt,
    },
  };
}

function inferDiscoveryChannel(url: string): DiscoveryChannel {
  const hostname = normalizeHostname(new URL(url).hostname);
  if (hostname === 'facebook.com' || hostname.endsWith('.facebook.com')) {
    return 'facebook';
  }
  if (hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')) {
    return 'tiktok';
  }
  if (hostname === 't.me' || hostname === 'telegram.me' || hostname.endsWith('.telegram.me')) {
    return 'telegram';
  }
  return 'web';
}

function identityFor(
  url: string,
  channel: DiscoveryChannel,
): { key: string; account?: string } | undefined {
  const parsed = new URL(url);
  if (channel === 'facebook') {
    const account = parseFacebookAccount(parsed);
    return { key: account ? `facebook:${account.toLowerCase()}` : 'facebook.com', account };
  }
  if (channel === 'tiktok') {
    const account = parseTikTokAccount(parsed);
    return { key: account ? `tiktok:${account.toLowerCase()}` : 'tiktok.com', account };
  }
  if (channel === 'telegram') {
    const account = parseTelegramAccount(parsed);
    return { key: account ? `telegram:${account.toLowerCase()}` : 't.me', account };
  }
  const key = registrablePublisherKey(url);
  return key ? { key } : undefined;
}

function parseFacebookAccount(url: URL): string | undefined {
  const segment = firstPathSegment(url);
  if (!segment || FACEBOOK_RESERVED.has(segment.toLowerCase())) {
    return undefined;
  }
  return /^[A-Za-z0-9._-]+$/.test(segment) ? segment : undefined;
}

function parseTikTokAccount(url: URL): string | undefined {
  const segment = firstPathSegment(url);
  if (!segment || !/^@[A-Za-z0-9._]+$/.test(segment)) {
    return undefined;
  }
  return segment;
}

function parseTelegramAccount(url: URL): string | undefined {
  const segment = firstPathSegment(url);
  if (!segment || TELEGRAM_RESERVED.has(segment.toLowerCase())) {
    return undefined;
  }
  return /^[A-Za-z0-9_]{5,32}$/.test(segment) ? segment : undefined;
}

function firstPathSegment(url: URL): string | undefined {
  const raw = url.pathname.split('/').find((part) => part.length > 0);
  if (!raw) {
    return undefined;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

function extractSourceText(retrieved: SafeWebContent): string {
  const mediaType = retrieved.contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (mediaType === 'text/plain') {
    return compactText(retrieved.text);
  }

  const $ = cheerio.load(retrieved.text);
  $('script, style, noscript, nav, footer, form, template, svg').remove();
  $('[aria-hidden="true"], [hidden]').remove();
  $('[style]').each((_, element) => {
    const style = ($(element).attr('style') ?? '').toLowerCase().replace(/\s+/g, '');
    if (style.includes('display:none') || style.includes('visibility:hidden')) {
      $(element).remove();
    }
  });

  const article = compactText($('article').text());
  if (article) {
    return article.slice(0, MAX_SOURCE_CHARS);
  }
  const main = compactText($('main').text());
  if (main) {
    return main.slice(0, MAX_SOURCE_CHARS);
  }
  return compactText(
    $('meta[property="og:description"]').attr('content')
      ?? $('meta[name="description"]').attr('content')
      ?? '',
  ).slice(0, MAX_SOURCE_CHARS);
}

function parsePublicHttpUrl(value: string): string | undefined {
  if (!value.trim()) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      return undefined;
    }
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function parseIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value.trim())) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').replace(/\.+$/g, '').toLowerCase();
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results: R[] = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}
