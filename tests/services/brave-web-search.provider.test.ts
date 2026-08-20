import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';
import { BraveWebSearchProvider } from '../../src/services/brave-web-search.provider';
import type { PoliticsSearchQuery } from '../../src/types/gold-politics';

const SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const QUERY: PoliticsSearchQuery = {
  key: 'vietnam-politics',
  text: 'chính trị Việt Nam lãnh đạo',
};
const FAKE_TOKEN = 'test-subscription-token';
const NOW = '2026-08-20T05:00:00.000Z';

function webResponse(results: unknown[], extras: Record<string, unknown> = {}) {
  return {
    web: {
      results,
      ...extras,
    },
  };
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Vietnam <b>politics</b> update',
    url: 'https://example.com/story',
    description: 'A <strong>snippet</strong> about leaders',
    page_age: '2026-08-18T10:00:00Z',
    profile: {
      name: 'Example News',
      url: 'https://example.com',
      long_name: 'example.com',
      img: 'https://example.com/favicon.ico',
    },
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

describe('BraveWebSearchProvider', () => {
  it('is disabled and skips HTTP when the API key is empty', async () => {
    const http = {
      get: vi.fn(),
    };
    const provider = new BraveWebSearchProvider('', http);

    expect(provider.key).toBe('brave-search');
    expect(provider.isEnabled()).toBe(false);
    await expect(provider.search(QUERY)).resolves.toEqual([]);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('searches Brave with a subscription header and no key in params', async () => {
    const http = {
      get: vi.fn().mockResolvedValue({
        data: webResponse([result()]),
        headers: { 'content-type': 'application/json' },
      }),
    };
    const provider = new BraveWebSearchProvider(FAKE_TOKEN, http);

    expect(provider.isEnabled()).toBe(true);
    const results = await provider.search(QUERY);

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith(SEARCH_URL, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': FAKE_TOKEN,
        'User-Agent': env.USER_AGENT,
      },
      params: {
        q: QUERY.text,
        count: 10,
      },
    });
    const [, config] = http.get.mock.calls[0];
    expect(config.params).not.toHaveProperty('key');
    expect(config.params).not.toHaveProperty('api_key');
    expect(results).toEqual([
      {
        title: 'Vietnam politics update',
        url: 'https://example.com/story',
        snippet: 'A snippet about leaders',
        publishedAt: '2026-08-18T10:00:00.000Z',
        sourceName: 'Example News',
      },
    ]);
    expect(JSON.stringify(results)).not.toMatch(/<[^>]+>/);
  });

  it('keeps only HTTP(S) results with title, snippet, and a strictly parseable date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const http = {
      get: vi.fn().mockResolvedValue({
        data: webResponse([
          result({ url: 'ftp://example.com/file' }),
          result({ url: 'https://user:pass@example.com/story' }),
          result({ title: '   ', description: 'snippet' }),
          result({ title: 'Title only', description: '  ' }),
          result({ page_age: undefined, age: '2 days ago' }),
          result({ page_age: 'August 18, 2026' }),
          result({
            title: 'Kept story',
            url: 'http://example.com/kept',
            description: 'Kept snippet',
            page_age: '2026-08-18T10:00:00Z',
          }),
        ]),
        headers: { 'content-type': 'application/json' },
      }),
    };

    try {
      const results = await new BraveWebSearchProvider(FAKE_TOKEN, http).search(QUERY);
      expect(results).toEqual([
        expect.objectContaining({
          title: 'Kept story',
          url: 'http://example.com/kept',
          snippet: 'Kept snippet',
          publishedAt: '2026-08-18T10:00:00.000Z',
        }),
      ]);
      expect(results[0].publishedAt).not.toBe(NOW);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects response and profile schema changes with a stable provider error', async () => {
    const logs: unknown[][] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      logs.push(args);
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args);
    });

    try {
      const missingWeb = {
        get: vi.fn().mockResolvedValue({
          data: { query: { original: QUERY.text } },
          headers: { 'content-type': 'application/json' },
        }),
      };
      await expect(new BraveWebSearchProvider(FAKE_TOKEN, missingWeb).search(QUERY)).rejects.toEqual(
        expect.objectContaining({ message: 'brave-search' }),
      );

      const badProfile = {
        get: vi.fn().mockResolvedValue({
          data: webResponse([result({ profile: 'Example News' })]),
          headers: { 'content-type': 'application/json' },
        }),
      };
      await expect(new BraveWebSearchProvider(FAKE_TOKEN, badProfile).search(QUERY)).rejects.toEqual(
        expect.objectContaining({ message: 'brave-search' }),
      );

      const rateLimited = Object.assign(new Error('Request failed with status code 429'), {
        response: {
          status: 429,
          headers: { 'X-Subscription-Token': FAKE_TOKEN },
          data: 'quota-body-secret',
        },
        config: { headers: { 'X-Subscription-Token': FAKE_TOKEN }, params: { q: QUERY.text } },
      });
      const tooMany = {
        get: vi.fn().mockRejectedValue(rateLimited),
      };
      await expect(new BraveWebSearchProvider(FAKE_TOKEN, tooMany).search(QUERY)).rejects.toEqual(
        expect.objectContaining({ message: 'brave-search' }),
      );

      const serverError = {
        get: vi.fn().mockRejectedValue(Object.assign(new Error('Request failed with status code 503'), {
          response: { status: 503, data: QUERY.text },
        })),
      };
      await expect(new BraveWebSearchProvider(FAKE_TOKEN, serverError).search(QUERY)).rejects.toEqual(
        expect.objectContaining({ message: 'brave-search' }),
      );

      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain(FAKE_TOKEN);
      expect(serialized).not.toContain(QUERY.text);
      expect(serialized).not.toContain('quota-body-secret');
    } finally {
      errorSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('rejects wrong MIME, oversize bodies, and 3xx without following or leaking the subscription header', async () => {
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
      const html = {
        get: vi.fn().mockResolvedValue({
          data: webResponse([result()]),
          headers: { 'content-type': 'text/html' },
        }),
      };
      await expect(new BraveWebSearchProvider(FAKE_TOKEN, html).search(QUERY)).rejects.toEqual(
        expect.objectContaining({ message: 'brave-search' }),
      );

      await withServer(
        (req, res) => {
          const path = (req.url ?? '/').split('?', 1)[0];
          if (path === '/search') {
            res.writeHead(302, {
              Location: '/secret-target',
              'set-cookie': 'session=redirect-secret',
            });
            res.end('redirect-body-secret');
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(webResponse([result()])));
        },
        async ({ origin, requests }) => {
          const provider = new BraveWebSearchProvider(FAKE_TOKEN, undefined, `${origin}/search`);
          await expect(provider.search(QUERY)).rejects.toEqual(
            expect.objectContaining({ message: 'brave-search' }),
          );
          expect(requests).toHaveLength(1);
          expect((requests[0].url ?? '').split('?', 1)[0]).toBe('/search');
          expect(requests[0].headers['x-subscription-token']).toBe(FAKE_TOKEN);
          expect(requests.map((req) => req.url ?? '').join('\n')).not.toContain('secret-target');
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
          const provider = new BraveWebSearchProvider(FAKE_TOKEN, undefined, `${origin}/search`);
          await expect(provider.search(QUERY)).rejects.toEqual(
            expect.objectContaining({ message: 'brave-search' }),
          );
        },
      );

      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain(FAKE_TOKEN);
      expect(serialized).not.toContain(QUERY.text);
      expect(serialized).not.toContain('redirect-body-secret');
      expect(serialized).not.toContain('secret-target');
    } finally {
      errorSpy.mockRestore();
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
