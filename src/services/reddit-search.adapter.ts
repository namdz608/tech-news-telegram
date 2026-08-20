import axios from 'axios';
import { env } from '../config/env';
import { politicsSearchQueries } from '../config/gold-politics-sources';
import type { PoliticsSearchQuery, PoliticsSourceItem } from '../types/gold-politics';
import { compactText } from '../utils/text';
import type { PoliticsSourceAdapter, PoliticsSourceAdapterResult } from './politics-source.adapter';

const SEARCH_URL = 'https://www.reddit.com/search.json';
const MAX_BODY_BYTES = 512 * 1024;
const QUERY_CONCURRENCY = 2;
const QUERY_LIMIT = 10;
const REDDIT_QUERIES = politicsSearchQueries.filter((query) => !query.discoveryHint).slice(0, 5);

interface HttpClientLike {
  get(
    url: string,
    config: { headers: Record<string, string>; params: Record<string, string | number> },
  ): Promise<{
    data: unknown;
    headers?: Readonly<Record<string, string | undefined>>;
  }>;
}

function createDefaultHttpClient(): HttpClientLike {
  return axios.create({
    timeout: env.REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    maxContentLength: MAX_BODY_BYTES,
    maxBodyLength: MAX_BODY_BYTES,
    headers: { 'User-Agent': env.USER_AGENT },
  }) as HttpClientLike;
}

export class RedditSearchAdapter implements PoliticsSourceAdapter {
  readonly key = 'reddit-search';

  constructor(
    private readonly http: HttpClientLike = createDefaultHttpClient(),
    private readonly searchUrl = SEARCH_URL,
    private readonly now: () => Date = () => new Date(),
  ) {}

  isEnabled(): boolean {
    return true;
  }

  async collect(): Promise<PoliticsSourceAdapterResult> {
    const settled = await mapLimited(REDDIT_QUERIES, QUERY_CONCURRENCY, (query) => this.collectQuery(query));
    const items: PoliticsSourceItem[] = [];
    const failedSources: string[] = [];
    let successfulSourceCount = 0;

    for (const result of settled) {
      if (result.ok) {
        successfulSourceCount += 1;
        items.push(...result.items);
      } else {
        failedSources.push(result.leafKey);
      }
    }

    return { items, successfulSourceCount, failedSources };
  }

  private async collectQuery(
    query: PoliticsSearchQuery,
  ): Promise<{ ok: true; items: PoliticsSourceItem[] } | { ok: false; leafKey: string }> {
    const leafKey = `reddit:${query.key}`;
    try {
      const response = await this.http.get(this.searchUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': env.USER_AGENT,
        },
        params: {
          q: query.text,
          sort: 'new',
          t: 'week',
          limit: QUERY_LIMIT,
        },
      });
      assertJsonContentType(response.headers);
      const children = parseListingChildren(readJsonBody(response.data));
      const discoveredAt = this.now().toISOString();
      return {
        ok: true,
        items: children.flatMap((child) => {
          const item = mapRedditPost(child, discoveredAt);
          return item ? [item] : [];
        }),
      };
    } catch {
      return { ok: false, leafKey };
    }
  }
}

async function mapLimited<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    const batch = items.slice(index, index + concurrency);
    results.push(...(await Promise.all(batch.map((item) => worker(item)))));
  }
  return results;
}

function headerValue(
  headers: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const record = headers as Record<string, unknown>;
  const direct = record[name] ?? record[name.toLowerCase()];
  if (typeof direct === 'string') {
    return direct;
  }
  const getter = (headers as { get?: (headerName: string) => unknown }).get;
  if (typeof getter === 'function') {
    const value = getter.call(headers, name);
    if (typeof value === 'string') {
      return value;
    }
  }
  return '';
}

function assertJsonContentType(headers?: Readonly<Record<string, string | undefined>>): void {
  if (!headers) {
    throw new Error('reddit-search');
  }
  const mime = headerValue(headers, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (mime !== 'application/json') {
    throw new Error('reddit-search');
  }
}

function readJsonBody(data: unknown): unknown {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as unknown;
    } catch {
      throw new Error('reddit-search');
    }
  }
  return data;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('reddit-search');
  }
  return value as Record<string, unknown>;
}

function parseListingChildren(payload: unknown): unknown[] {
  const children = asRecord(asRecord(payload).data).children;
  if (!Array.isArray(children)) {
    throw new Error('reddit-search');
  }
  return children;
}

function mapRedditPost(child: unknown, discoveredAt: string): PoliticsSourceItem | undefined {
  const post = asPostRecord(child);
  if (!post) {
    return undefined;
  }
  if (isRemovedPost(post)) {
    return undefined;
  }

  const title = compactText(typeof post.title === 'string' ? post.title : '');
  const selftext = readableSelfText(post.selftext);
  if (!title && !selftext) {
    return undefined;
  }

  const permalink = canonicalRedditPermalink(post.permalink);
  if (!permalink) {
    return undefined;
  }

  const publishedAt = parseCreatedUtc(post.created_utc);
  if (!publishedAt) {
    return undefined;
  }

  const author = parseAuthor(post.author);
  const subreddit = parseSubreddit(post.subreddit);
  const identityKey = author
    ? `reddit:${author.toLowerCase()}`
    : subreddit
      ? `reddit:r/${subreddit.toLowerCase()}`
      : 'reddit.com';
  const outbound = parsePublicHttpUrl(typeof post.url === 'string' ? post.url : '');
  const quotedOriginUrl = outbound && outbound !== permalink ? outbound : undefined;

  return {
    id: permalink,
    sourceId: 'reddit-search',
    sourceName: subreddit ? `r/${subreddit}` : 'Reddit',
    title: title || truncateText(selftext, 160),
    url: permalink,
    summary: selftext || undefined,
    author,
    publishedAt,
    collectedAt: discoveredAt,
    topics: [],
    engagement: mapEngagement(post.score, post.num_comments),
    discoveryChannel: 'reddit',
    discoveredAt,
    originalAuthor: author,
    originalAccount: author,
    originalUrl: permalink,
    quotedOriginUrl,
    sourceQuotaKey: identityKey,
    sourceTextStatus: selftext ? 'full' : 'incomplete',
    evidenceKind: author ? 'social-claim' : 'anonymous-rumor',
    evidentiaryEffect: 'records-claim',
    evidenceOriginKey: identityKey,
    originAttribution: {
      url: permalink,
      account: author,
      publishedAt,
      discoveredAt,
    },
  };
}

function asPostRecord(child: unknown): Record<string, unknown> | undefined {
  try {
    const record = asRecord(child);
    return asRecord(record.data);
  } catch {
    return undefined;
  }
}

function isRemovedPost(post: Record<string, unknown>): boolean {
  if (typeof post.removed_by_category === 'string' && post.removed_by_category.trim()) {
    return true;
  }
  const title = typeof post.title === 'string' ? compactText(post.title).toLowerCase() : '';
  const selftext = typeof post.selftext === 'string' ? compactText(post.selftext).toLowerCase() : '';
  return (title === '[deleted]' || title === '[removed]') && (selftext === '[deleted]' || selftext === '[removed]' || !selftext);
}

function readableSelfText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const text = compactText(value);
  const normalized = text.toLowerCase();
  if (!text || normalized === '[deleted]' || normalized === '[removed]') {
    return '';
  }
  return text;
}

function parseAuthor(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const author = value.trim();
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(author)) {
    return undefined;
  }
  return author;
}

function parseSubreddit(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const subreddit = value.trim();
  if (!/^[A-Za-z0-9_]{1,50}$/.test(subreddit)) {
    return undefined;
  }
  return subreddit;
}

function parseCreatedUtc(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function canonicalRedditPermalink(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const raw = value.trim();
  const absolute = raw.startsWith('/') ? `https://www.reddit.com${raw}` : raw;
  const parsed = parsePublicHttpUrl(absolute);
  if (!parsed) {
    return undefined;
  }
  const hostname = new URL(parsed).hostname.toLowerCase();
  if (hostname !== 'reddit.com' && !hostname.endsWith('.reddit.com')) {
    return undefined;
  }
  return parsed;
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

function mapEngagement(score: unknown, comments: unknown): PoliticsSourceItem['engagement'] | undefined {
  const likes = typeof score === 'number' && Number.isFinite(score) ? score : undefined;
  const commentCount = typeof comments === 'number' && Number.isFinite(comments) ? comments : undefined;
  if (likes === undefined && commentCount === undefined) {
    return undefined;
  }
  return {
    ...(likes !== undefined ? { likes } : {}),
    ...(commentCount !== undefined ? { comments: commentCount } : {}),
  };
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}
