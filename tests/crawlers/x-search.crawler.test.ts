import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';
import { XSearchCrawler } from '../../src/crawlers/x-search.crawler';
import type { XSearchSourceConfig } from '../../src/types/source';

function createSource(overrides: Partial<XSearchSourceConfig> = {}): XSearchSourceConfig {
  return {
    id: 'x-search',
    name: 'X Search',
    kind: 'x-search',
    enabled: true,
    homepageUrl: 'https://x.com',
    bearerToken: 'token',
    query: '(AI OR Kubernetes) lang:en -is:retweet -is:reply',
    maxResults: 20,
    ...overrides,
  };
}

async function withServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  run: (ctx: { origin: string; requests: string[] }) => Promise<void>,
): Promise<void> {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    requests.push(`${req.method ?? 'GET'} ${req.url ?? '/'}`);
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

describe('XSearchCrawler', () => {
  it('maps recent X posts into matching articles', async () => {
    const source: XSearchSourceConfig = {
      id: 'x-search',
      name: 'X Search',
      kind: 'x-search',
      enabled: true,
      homepageUrl: 'https://x.com',
      bearerToken: 'token',
      query: '(AI OR Kubernetes) lang:en -is:retweet -is:reply',
      maxResults: 20,
    };
    const http = {
      get: vi.fn().mockResolvedValue({
        data: {
          data: [
            {
              id: '123',
              text: 'OpenAI ships a Kubernetes security update for platform teams',
              author_id: '42',
              created_at: '2026-06-09T00:00:00.000Z',
              public_metrics: {
                retweet_count: 10,
                like_count: 99,
              },
            },
            {
              id: '456',
              text: 'A cooking post without a matching topic',
              author_id: '43',
              created_at: '2026-06-09T00:00:00.000Z',
            },
          ],
          includes: {
            users: [
              {
                id: '42',
                name: 'Tech Writer',
                username: 'techwriter',
              },
            ],
          },
        },
      }),
    };

    const articles = await new XSearchCrawler(http).crawl(source);

    expect(http.get).toHaveBeenCalledWith('https://api.x.com/2/tweets/search/recent', {
      headers: {
        Authorization: 'Bearer token',
      },
      params: {
        query: '(AI OR Kubernetes) lang:en -is:retweet -is:reply',
        max_results: 20,
        expansions: 'author_id',
        'tweet.fields': 'author_id,created_at,public_metrics,lang',
        'user.fields': 'name,username',
      },
    });
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      id: 'https://x.com/i/web/status/123',
      sourceId: 'x-search',
      sourceName: 'X Search',
      title: 'OpenAI ships a Kubernetes security update for platform teams',
      url: 'https://x.com/i/web/status/123',
      summary: '@techwriter: OpenAI ships a Kubernetes security update for platform teams | Likes: 99 | Reposts: 10',
      author: '@techwriter',
      publishedAt: '2026-06-09T00:00:00.000Z',
      topics: expect.arrayContaining(['ai', 'k8s', 'security']),
    });
  });

  it('returns no articles when bearer token is not configured', async () => {
    const source: XSearchSourceConfig = {
      id: 'x-search',
      name: 'X Search',
      kind: 'x-search',
      enabled: true,
      homepageUrl: 'https://x.com',
      bearerToken: '',
      query: 'AI lang:en',
      maxResults: 20,
    };
    const http = {
      get: vi.fn(),
    };

    const articles = await new XSearchCrawler(http).crawl(source);

    expect(articles).toEqual([]);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('keeps unmatched posts only when the X source opts in', async () => {
    const source = createSource({
      query: 'politics lang:en -is:retweet',
    });
    const http = {
      get: vi.fn().mockResolvedValue({
        data: {
          data: [
            {
              id: '123',
              text: 'A cooking post without a matching topic',
              author_id: '43',
              created_at: '2026-06-09T00:00:00.000Z',
              public_metrics: {
                like_count: 7,
                retweet_count: 3,
              },
            },
          ],
        },
      }),
    };
    const crawler = new XSearchCrawler(http);

    await expect(crawler.crawl({ ...source, includeUnmatched: undefined })).resolves.toEqual([]);
    await expect(crawler.crawl({ ...source, includeUnmatched: true })).resolves.toEqual([
      expect.objectContaining({
        url: 'https://x.com/i/web/status/123',
        topics: [],
        engagement: { likes: 7, shares: 3 },
      }),
    ]);
  });

  it('caps the default Axios client and never follows a 3xx Location', async () => {
    const crawler = new XSearchCrawler();
    const defaults = (
      crawler as unknown as {
        http: {
          defaults: {
            timeout?: number;
            maxRedirects?: number;
            maxContentLength?: number;
            maxBodyLength?: number;
            headers?: Record<string, string>;
          };
        };
      }
    ).http.defaults;

    expect(defaults.timeout).toBe(env.REQUEST_TIMEOUT_MS);
    expect(defaults.maxRedirects).toBe(0);
    expect(defaults.maxContentLength).toBe(512 * 1024);
    expect(defaults.maxBodyLength).toBe(512 * 1024);
    expect(defaults.headers?.['User-Agent'] ?? defaults.headers?.['user-agent']).toBe(env.USER_AGENT);

    await withServer(
      (req, res) => {
        const path = (req.url ?? '/').split('?', 1)[0];
        if (path === '/search') {
          res.writeHead(302, { Location: '/secret-target' });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [] }));
      },
      async ({ origin, requests }) => {
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
          const redirecting = new XSearchCrawler(undefined, `${origin}/search`);
          await expect(redirecting.crawl(createSource())).rejects.toEqual(
            expect.objectContaining({ message: 'x-search' }),
          );
          expect(requests).toHaveLength(1);
          expect(requests[0]).toMatch(/^GET \/search\?/);
          expect(requests.join('\n')).not.toContain('secret-target');
          expect(JSON.stringify(logs)).not.toContain('secret-target');
          expect(JSON.stringify(logs)).not.toContain('Bearer token');
        } finally {
          errorSpy.mockRestore();
          logSpy.mockRestore();
          warnSpy.mockRestore();
        }
      },
    );
  });

  it('rejects invalid JSON schema without logging raw Axios details', async () => {
    const http = {
      get: vi.fn().mockResolvedValue({
        data: { data: 'not-an-array' },
        headers: { 'content-type': 'application/json' },
      }),
    };
    const logs: unknown[][] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      logs.push(args);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args);
    });

    try {
      await expect(new XSearchCrawler(http).crawl(createSource())).rejects.toEqual(
        expect.objectContaining({ message: 'x-search' }),
      );
      expect(errorSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(JSON.stringify(logs)).not.toContain('not-an-array');
    } finally {
      errorSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
