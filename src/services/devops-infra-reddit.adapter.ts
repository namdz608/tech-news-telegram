import axios from 'axios';
import {
  DEVOPS_INFRA_SUBREDDITS,
  devopsInfraRedditQueries,
} from '../config/devops-infra-sources';
import { env } from '../config/env';
import type { DevopsInfraAnswer, DevopsInfraSourceItem } from '../types/devops-infra';
import { compactText } from '../utils/text';
import type {
  DevopsInfraSourceAdapter,
  DevopsInfraSourceAdapterResult,
} from './devops-infra-source.adapter';

const REDDIT_ORIGIN = 'https://www.reddit.com';
const SEARCH_URL = `${REDDIT_ORIGIN}/search.json`;
const MAX_BODY_BYTES = 512 * 1024;
const QUERY_CONCURRENCY = 2;
const QUERY_LIMIT = 10;
const MAX_COMMENT_FETCHES = 15;

interface HttpResponse {
  data: unknown;
  headers?: Readonly<Record<string, string | undefined>>;
}

interface HttpClientLike {
  get(
    url: string,
    config: {
      headers: Record<string, string>;
      params?: Record<string, string | number>;
    },
  ): Promise<HttpResponse>;
}

interface SourceRequest {
  key: string;
  url: string;
  params: Record<string, string | number>;
}

interface MappedPost {
  item: DevopsInfraSourceItem;
  permalink: string;
  author?: string;
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

export class DevopsInfraRedditAdapter implements DevopsInfraSourceAdapter {
  readonly key = 'reddit';

  constructor(
    private readonly http: HttpClientLike = createDefaultHttpClient(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  isEnabled(): boolean {
    return true;
  }

  async collect(): Promise<DevopsInfraSourceAdapterResult> {
    const requests = buildSourceRequests();
    const settled = await mapLimited(requests, QUERY_CONCURRENCY, (request) =>
      this.collectSource(request),
    );
    const failedSources: string[] = [];
    const uniquePosts = new Map<string, MappedPost>();
    let successfulSourceCount = 0;

    for (const result of settled) {
      if (!result.ok) {
        failedSources.push(result.key);
        continue;
      }
      successfulSourceCount += 1;
      for (const post of result.posts) {
        if (!uniquePosts.has(post.permalink)) {
          uniquePosts.set(post.permalink, post);
        }
      }
    }

    const posts = [...uniquePosts.values()];
    await Promise.all(
      posts.slice(0, MAX_COMMENT_FETCHES).map(async (post) => {
        try {
          post.item.answers = await this.collectComments(post.permalink, post.author);
        } catch {
          post.item.answers = [];
          post.item.sourceTextStatus = 'incomplete';
        }
      }),
    );
    for (const post of posts.slice(MAX_COMMENT_FETCHES)) {
      post.item.answers = [];
      post.item.sourceTextStatus = 'incomplete';
    }

    return {
      items: posts.map((post) => post.item),
      successfulSourceCount,
      failedSources,
    };
  }

  private async collectSource(
    request: SourceRequest,
  ): Promise<
    { ok: true; posts: MappedPost[] } | { ok: false; key: string }
  > {
    try {
      const response = await this.http.get(request.url, requestConfig(request.params));
      assertJsonContentType(response.headers);
      const discoveredAt = this.now().toISOString();
      return {
        ok: true,
        posts: parseListingChildren(readJsonBody(response.data)).flatMap((child) => {
          const post = mapRedditPost(child, discoveredAt);
          return post ? [post] : [];
        }),
      };
    } catch {
      return { ok: false, key: request.key };
    }
  }

  private async collectComments(
    permalink: string,
    originalAuthor?: string,
  ): Promise<DevopsInfraAnswer[]> {
    const response = await this.http.get(`${permalink}.json`, requestConfig({ limit: 50 }));
    assertJsonContentType(response.headers);
    const payload = readJsonBody(response.data);
    if (!Array.isArray(payload) || payload.length < 2) {
      throw new Error('reddit-comments');
    }
    return parseCommentTree(payload[1], originalAuthor);
  }
}

function buildSourceRequests(): SourceRequest[] {
  return [
    ...DEVOPS_INFRA_SUBREDDITS.map((subreddit) => ({
      key: `reddit:r/${subreddit}`,
      url: `${REDDIT_ORIGIN}/r/${subreddit}/new.json`,
      params: { limit: QUERY_LIMIT },
    })),
    ...devopsInfraRedditQueries.map((query) => ({
      key: `reddit:${query.key}`,
      url: SEARCH_URL,
      params: {
        q: query.text,
        sort: 'new',
        t: 'week',
        limit: QUERY_LIMIT,
      },
    })),
  ];
}

function requestConfig(params: Record<string, string | number>) {
  return {
    headers: {
      Accept: 'application/json',
      'User-Agent': env.USER_AGENT,
    },
    params,
  };
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

function mapRedditPost(child: unknown, discoveredAt: string): MappedPost | undefined {
  const post = readChildData(child);
  if (!post || isRemovedPost(post)) {
    return undefined;
  }
  const title = readText(post.title);
  const body = readableBody(post.selftext);
  const permalink = canonicalRedditPermalink(post.permalink);
  const publishedAt = parseCreatedUtc(post.created_utc);
  const subreddit = parseSubreddit(post.subreddit);
  if (!title || !permalink || !publishedAt || !subreddit) {
    return undefined;
  }

  const communityKey = `reddit:r/${subreddit.toLowerCase()}`;
  const author = parseAuthor(post.author);
  const score = finiteNumber(post.score);
  const comments = finiteNumber(post.num_comments);
  const engagement =
    score === undefined && comments === undefined
      ? undefined
      : {
          ...(score === undefined ? {} : { score }),
          ...(comments === undefined ? {} : { comments }),
        };

  return {
    permalink,
    author,
    item: {
      id: permalink,
      sourceId: 'reddit',
      sourceName: `r/${subreddit}`,
      title,
      url: permalink,
      summary: body,
      body,
      author,
      publishedAt,
      collectedAt: discoveredAt,
      discoveredAt,
      discoveryChannel: 'reddit',
      communityKey,
      sourceQuotaKey: communityKey,
      sourceTextStatus: body ? 'full' : 'incomplete',
      answers: [],
      engagement,
    },
  };
}

function parseCommentTree(payload: unknown, originalAuthor?: string): DevopsInfraAnswer[] {
  const answers: DevopsInfraAnswer[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }
    const record = value as Record<string, unknown>;
    const data = record.kind === 't1' ? asRecord(record.data) : undefined;
    if (data) {
      const body = readableBody(data.body);
      if (body) {
        const author = parseAuthor(data.author);
        const score = finiteNumber(data.score);
        answers.push({
          body,
          ...(score === undefined ? {} : { score }),
          authorConfirmed:
            Boolean(
              originalAuthor &&
                author &&
                author.toLowerCase() === originalAuthor.toLowerCase(),
            ) && /\bthis worked\b/i.test(body),
        });
      }
      visit(data.replies);
      return;
    }
    const children = asRecord(record.data)?.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        visit(child);
      }
    }
  };
  visit(payload);
  return answers;
}

function readChildData(child: unknown): Record<string, unknown> | undefined {
  const record = asRecord(child);
  return record ? asRecord(record.data) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function parseListingChildren(payload: unknown): unknown[] {
  const children = asRecord(asRecord(payload)?.data)?.children;
  if (!Array.isArray(children)) {
    throw new Error('reddit-listing');
  }
  return children;
}

function isRemovedPost(post: Record<string, unknown>): boolean {
  if (typeof post.removed_by_category === 'string' && post.removed_by_category.trim()) {
    return true;
  }
  const title = readText(post.title).toLowerCase();
  const body = readText(post.selftext).toLowerCase();
  return (
    title === '[removed]' ||
    title === '[deleted]' ||
    body === '[removed]' ||
    body === '[deleted]'
  );
}

function readableBody(value: unknown): string {
  const body = readText(value);
  return body === '[removed]' || body === '[deleted]' ? '' : body;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? compactText(value) : '';
}

function parseAuthor(value: unknown): string | undefined {
  const author = readText(value);
  return /^[A-Za-z0-9_-]{1,20}$/.test(author) ? author : undefined;
}

function parseSubreddit(value: unknown): string | undefined {
  const subreddit = readText(value);
  return /^[A-Za-z0-9_]{1,50}$/.test(subreddit) ? subreddit : undefined;
}

function parseCreatedUtc(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function canonicalRedditPermalink(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const raw = value.trim();
  const absolute = raw.startsWith('/') ? `${REDDIT_ORIGIN}${raw}` : raw;
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
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function readJsonBody(data: unknown): unknown {
  if (typeof data !== 'string') {
    return data;
  }
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new Error('reddit-json');
  }
}

function assertJsonContentType(
  headers?: Readonly<Record<string, string | undefined>>,
): void {
  if (!headers) {
    throw new Error('reddit-content-type');
  }
  const record = headers as Record<string, unknown>;
  const direct = record['content-type'] ?? record['Content-Type'];
  const getter = (headers as { get?: (name: string) => unknown }).get;
  const value =
    typeof direct === 'string'
      ? direct
      : typeof getter === 'function'
        ? getter.call(headers, 'content-type')
        : undefined;
  if (
    typeof value !== 'string' ||
    value.split(';', 1)[0].trim().toLowerCase() !== 'application/json'
  ) {
    throw new Error('reddit-content-type');
  }
}
