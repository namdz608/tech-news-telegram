import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';
import { politicsSearchQueries } from '../../src/config/gold-politics-sources';
import { RedditSearchAdapter } from '../../src/services/reddit-search.adapter';

const SEARCH_URL = 'https://www.reddit.com/search.json';
const NOW = new Date('2026-08-20T05:00:00.000Z');
const CREATED_UTC = 1_717_200_000;
const PUBLISHED_AT = new Date(CREATED_UTC * 1000).toISOString();

const redditQueryGroups = politicsSearchQueries.filter((query) => !query.discoveryHint).slice(0, 5);
const emptyListing = { data: { children: [] } };

function listing(posts: unknown[]) {
  return {
    data: {
      children: posts.map((data) => ({ kind: 't3', data })),
    },
  };
}

function validPost(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Leader controversy in Vietnam',
    selftext: 'Details of the allegation from the thread.',
    author: 'NewsAccount',
    subreddit: 'worldnews',
    permalink: '/r/worldnews/comments/abc123/leader_controversy/',
    url: 'https://vnexpress.net/outbound-article',
    created_utc: CREATED_UTC,
    score: 42,
    num_comments: 8,
    is_self: false,
    removed_by_category: null,
    ...overrides,
  };
}

async function withServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  run: (ctx: { origin: string; requests: http.IncomingMessage[] }) => Promise<void>,
): Promise<void> {
  const requests: http.IncomingMessage[] = [];
  const server = http.createServer((req, res) => {
    requests.push(req);
    handler(req, res);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  try {
    await run({ origin: `http://127.0.0.1:${port}`, requests });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function createHttp(
  impl: (params: Record<string, string | number>) => Promise<{
    data: unknown;
    headers?: Record<string, string>;
  }>,
) {
  return {
    get: vi.fn(async (url: string, config: { headers: Record<string, string>; params: Record<string, string | number> }) => {
      expect(url).toBe(SEARCH_URL);
      return impl(config.params);
    }),
  };
}

describe('RedditSearchAdapter', () => {
  it('is always enabled and searches the first five non-domain query groups', async () => {
    const http = createHttp(async () => ({
      data: emptyListing,
      headers: { 'content-type': 'application/json' },
    }));
    const adapter = new RedditSearchAdapter(http, undefined, () => NOW);

    expect(adapter.key).toBe('reddit-search');
    expect(adapter.isEnabled()).toBe(true);
    expect(redditQueryGroups).toHaveLength(5);
    expect(redditQueryGroups.map((query) => query.key)).toEqual([
      'vietnam-politics',
      'international-politics',
      'vietnam-leader-controversies',
      'international-leader-controversies',
      'gold-market-drivers',
    ]);

    const result = await adapter.collect();

    expect(http.get).toHaveBeenCalledTimes(5);
    expect(http.get.mock.calls.map(([, config]) => config.params.q)).toEqual(
      redditQueryGroups.map((query) => query.text),
    );
    for (const [, config] of http.get.mock.calls) {
      expect(config.params).toEqual({
        q: config.params.q,
        sort: 'new',
        t: 'week',
        limit: 10,
      });
      expect(config.headers['User-Agent']).toBe(env.USER_AGENT);
    }
    expect(result).toEqual({
      items: [],
      successfulSourceCount: 5,
      failedSources: [],
    });
  });

  it('keeps at most two Reddit requests in flight', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const http = createHttp(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => {
        setTimeout(resolve, 25);
      });
      inFlight -= 1;
      return { data: emptyListing, headers: { 'content-type': 'application/json' } };
    });

    await new RedditSearchAdapter(http, undefined, () => NOW).collect();

    expect(http.get).toHaveBeenCalledTimes(5);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('maps a titled self/outbound post onto conservative social evidence', async () => {
    const http = createHttp(async (params) => ({
      data:
        params.q === redditQueryGroups[0].text
          ? listing([validPost()])
          : emptyListing,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await new RedditSearchAdapter(http, undefined, () => NOW).collect();
    expect(result.successfulSourceCount).toBe(5);
    expect(result.failedSources).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'https://www.reddit.com/r/worldnews/comments/abc123/leader_controversy',
        url: 'https://www.reddit.com/r/worldnews/comments/abc123/leader_controversy',
        title: 'Leader controversy in Vietnam',
        summary: 'Details of the allegation from the thread.',
        author: 'NewsAccount',
        publishedAt: PUBLISHED_AT,
        collectedAt: NOW.toISOString(),
        topics: [],
        engagement: { likes: 42, comments: 8 },
        discoveryChannel: 'reddit',
        discoveredAt: NOW.toISOString(),
        originalAuthor: 'NewsAccount',
        originalAccount: 'NewsAccount',
        originalUrl: 'https://www.reddit.com/r/worldnews/comments/abc123/leader_controversy',
        quotedOriginUrl: 'https://vnexpress.net/outbound-article',
        sourceQuotaKey: 'reddit:newsaccount',
        evidenceOriginKey: 'reddit:newsaccount',
        sourceTextStatus: 'full',
        evidenceKind: 'social-claim',
        evidentiaryEffect: 'records-claim',
        originAttribution: {
          url: 'https://www.reddit.com/r/worldnews/comments/abc123/leader_controversy',
          account: 'NewsAccount',
          publishedAt: PUBLISHED_AT,
          discoveredAt: NOW.toISOString(),
        },
      }),
    );
    expect(result.items[0]).not.toHaveProperty('corroborationNote');
  });

  it('falls back to subreddit identity without inventing an account', async () => {
    const http = createHttp(async (params) => ({
      data:
        params.q === redditQueryGroups[0].text
          ? listing([validPost({ author: '[deleted]', selftext: '' })])
          : emptyListing,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await new RedditSearchAdapter(http, undefined, () => NOW).collect();
    expect(result.items).toEqual([
      expect.objectContaining({
        originalAccount: undefined,
        sourceQuotaKey: 'reddit:r/worldnews',
        evidenceOriginKey: 'reddit:r/worldnews',
        evidenceKind: 'anonymous-rumor',
        evidentiaryEffect: 'records-claim',
        originAttribution: expect.objectContaining({
          url: 'https://www.reddit.com/r/worldnews/comments/abc123/leader_controversy',
          account: undefined,
        }),
      }),
    ]);
  });

  it('falls back to reddit.com when author and subreddit are unusable', async () => {
    const http = createHttp(async (params) => ({
      data:
        params.q === redditQueryGroups[0].text
          ? listing([validPost({ author: '', subreddit: '', selftext: 'body only' })])
          : emptyListing,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await new RedditSearchAdapter(http, undefined, () => NOW).collect();
    expect(result.items).toEqual([
      expect.objectContaining({
        originalAccount: undefined,
        sourceQuotaKey: 'reddit.com',
        evidenceOriginKey: 'reddit.com',
        evidenceKind: 'anonymous-rumor',
      }),
    ]);
  });

  it('drops deleted posts, malformed URLs, missing timestamps, and empty title+text', async () => {
    const http = createHttp(async (params) => ({
      data:
        params.q === redditQueryGroups[0].text
          ? listing([
              validPost({ removed_by_category: 'moderator' }),
              validPost({ author: '[removed]', title: '[removed]', selftext: '[removed]' }),
              validPost({ permalink: 'javascript:alert(1)', url: 'javascript:alert(1)' }),
              validPost({ permalink: 'https://user:pass@example.com/secret', url: 'https://example.com' }),
              validPost({ created_utc: undefined }),
              validPost({ title: '   ', selftext: '' }),
              validPost({ title: 'Kept post', selftext: '', url: 'https://www.reddit.com/r/worldnews/comments/abc123/leader_controversy/' }),
            ])
          : emptyListing,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await new RedditSearchAdapter(http, undefined, () => NOW).collect();
    expect(result.items.map((item) => item.title)).toEqual(['Kept post']);
    expect(result.items[0].quotedOriginUrl).toBeUndefined();
  });

  it('records per-query HTTP failures as reddit:<query-key> leaves and keeps other queries', async () => {
    const logs: unknown[][] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      logs.push(args);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args);
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      logs.push(args);
    });

    try {
      const rateLimit = Object.assign(new Error('Request failed with status code 429'), {
        response: {
          status: 429,
          headers: { 'x-ratelimit-remaining': '0', authorization: 'should-not-leak' },
          data: 'rate-limit-body-secret',
        },
        config: { headers: { 'User-Agent': env.USER_AGENT } },
      });
      const http = createHttp(async (params) => {
        if (params.q === redditQueryGroups[0].text) {
          throw rateLimit;
        }
        if (params.q === redditQueryGroups[1].text) {
          return { data: { unexpected: true }, headers: { 'content-type': 'application/json' } };
        }
        return { data: emptyListing, headers: { 'content-type': 'application/json' } };
      });

      const result = await new RedditSearchAdapter(http, undefined, () => NOW).collect();
      expect(result.successfulSourceCount).toBe(3);
      expect(result.failedSources).toEqual([
        'reddit:vietnam-politics',
        'reddit:international-politics',
      ]);
      expect(result.items).toEqual([]);
      const serialized = JSON.stringify({ result, logs });
      expect(serialized).not.toContain('rate-limit-body-secret');
      expect(serialized).not.toContain('should-not-leak');
      expect(serialized).not.toContain('x-ratelimit-remaining');
    } finally {
      errorSpy.mockRestore();
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('returns zero successes when every query fails rather than marking Reddit healthy', async () => {
    const http = createHttp(async () => {
      throw new Error('getaddrinfo ENOTFOUND www.reddit.com');
    });

    const result = await new RedditSearchAdapter(http, undefined, () => NOW).collect();
    expect(result).toEqual({
      items: [],
      successfulSourceCount: 0,
      failedSources: redditQueryGroups.map((query) => `reddit:${query.key}`),
    });
  });

  it('rejects wrong MIME, oversize bodies, and 3xx without following or leaking Axios details', async () => {
    const logs: unknown[][] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      logs.push(args);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args);
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      logs.push(args);
    });

    try {
      const htmlHttp = createHttp(async () => ({
        data: '<html>secret-body</html>',
        headers: { 'content-type': 'text/html' },
      }));
      const htmlResult = await new RedditSearchAdapter(htmlHttp, undefined, () => NOW).collect();
      expect(htmlResult.successfulSourceCount).toBe(0);
      expect(htmlResult.failedSources).toHaveLength(5);

      await withServer(
        (req, res) => {
          const path = (req.url ?? '/').split('?', 1)[0];
          if (path === '/search') {
            res.writeHead(302, { Location: '/secret-target' });
            res.end('redirect-body-secret');
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(emptyListing));
        },
        async ({ origin, requests }) => {
          const adapter = new RedditSearchAdapter(undefined, `${origin}/search`, () => NOW);
          const result = await adapter.collect();
          expect(result.successfulSourceCount).toBe(0);
          expect(result.failedSources).toEqual(redditQueryGroups.map((query) => `reddit:${query.key}`));
          expect(requests).toHaveLength(5);
          expect(requests.every((req) => (req.url ?? '').split('?', 1)[0] === '/search')).toBe(true);
          expect(requests.map((req) => req.url ?? '').join('\n')).not.toContain('secret-target');
          expect(requests.every((req) => req.headers['user-agent'] === env.USER_AGENT)).toBe(true);
        },
      );

      await withServer(
        (_req, res) => {
          const body = Buffer.alloc(512 * 1024 + 1, 97);
          res.writeHead(200, {
            'content-type': 'application/json',
            'content-length': String(body.length),
          });
          res.end(body);
        },
        async ({ origin }) => {
          const adapter = new RedditSearchAdapter(undefined, `${origin}/search`, () => NOW);
          const result = await adapter.collect();
          expect(result.successfulSourceCount).toBe(0);
          expect(result.failedSources).toHaveLength(5);
        },
      );

      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain('secret-body');
      expect(serialized).not.toContain('redirect-body-secret');
      expect(serialized).not.toContain('secret-target');
    } finally {
      errorSpy.mockRestore();
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
