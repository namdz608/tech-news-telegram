import http from 'node:http';
import https from 'node:https';
import type { AddressInfo, LookupFunction } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SafeWebRetrievalService,
  createSafeWebRetrievalDependencies,
  type ResolvedAddress,
  type SafePinnedRequest,
  type SafeRawResponse,
  type SafeWebRetrievalDependencies,
} from '../../src/services/safe-web-retrieval.service';

const PUBLIC_IPV4: ResolvedAddress = { address: '93.184.216.34', family: 4 };
const PUBLIC_IPV6: ResolvedAddress = { address: '2001:4860:4860::8888', family: 6 };
const USER_AGENT = 'TechNewsTelegramBot/1.0';
const TEXTUAL_ACCEPT = 'text/html, application/xhtml+xml, text/plain, application/json';

type StableCode =
  | 'unsafe-url'
  | 'unsafe-address'
  | 'redirect-limit'
  | 'response-too-large'
  | 'unsupported-content-type'
  | 'unsupported-content-encoding'
  | 'unsupported-charset'
  | 'unexpected-status'
  | 'request-timeout';

afterEach(() => {
  vi.restoreAllMocks();
});

function encoder(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function createRawResponse(options: {
  statusCode?: number;
  headers?: Record<string, string | undefined>;
  body?: string | readonly Uint8Array[];
}): SafeRawResponse & { destroyed: boolean } {
  const chunks = typeof options.body === 'string' || options.body === undefined
    ? [encoder(options.body ?? '<html>ok</html>')]
    : options.body;
  const response: SafeRawResponse & { destroyed: boolean } = {
    statusCode: options.statusCode ?? 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...options.headers,
    },
    body: {
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) {
          if (response.destroyed) return;
          yield chunk;
        }
      },
    },
    destroyed: false,
    destroy() {
      response.destroyed = true;
    },
  };
  return response;
}

function createDependencies(
  overrides: Partial<SafeWebRetrievalDependencies> & {
    records?: Record<string, ResolvedAddress[]>;
    hops?: Array<(input: SafePinnedRequest) => SafeRawResponse | Promise<SafeRawResponse>>;
  } = {},
): SafeWebRetrievalDependencies & {
  requests: SafePinnedRequest[];
  timerCalls: number[];
} {
  const requests: SafePinnedRequest[] = [];
  const timerCalls: number[] = [];
  let hopIndex = 0;

  return {
    requests,
    timerCalls,
    async lookup(hostname) {
      const records = overrides.records ?? { 'example.com': [PUBLIC_IPV4] };
      const addresses = records[hostname];
      if (!addresses) {
        throw new Error(`ENOTFOUND ${hostname}`);
      }
      return addresses;
    },
    isAddressAllowed(address) {
      return address.address === PUBLIC_IPV4.address || address.address === PUBLIC_IPV6.address;
    },
    async request(input) {
      requests.push(input);
      const hops = overrides.hops;
      if (!hops || hopIndex >= hops.length) {
        return createRawResponse({});
      }
      const hop = hops[hopIndex];
      hopIndex += 1;
      return hop(input);
    },
    setTimer(callback, timeoutMs) {
      timerCalls.push(timeoutMs);
      return setTimeout(callback, timeoutMs);
    },
    clearTimer(timer) {
      clearTimeout(timer);
    },
    ...overrides,
    request: async (input) => {
      requests.push(input);
      if (overrides.request) {
        return overrides.request(input);
      }
      const hops = overrides.hops;
      if (!hops || hopIndex >= hops.length) {
        return createRawResponse({});
      }
      const hop = hops[hopIndex];
      hopIndex += 1;
      return hop(input);
    },
    setTimer: (callback, timeoutMs) => {
      timerCalls.push(timeoutMs);
      if (overrides.setTimer) {
        return overrides.setTimer(callback, timeoutMs);
      }
      return setTimeout(callback, timeoutMs);
    },
    clearTimer: (timer) => {
      if (overrides.clearTimer) {
        overrides.clearTimer(timer);
        return;
      }
      clearTimeout(timer);
    },
  };
}

function createService(
  overrides: Parameters<typeof createDependencies>[0] = {},
  options?: ConstructorParameters<typeof SafeWebRetrievalService>[1],
) {
  const dependencies = createDependencies(overrides);
  const service = new SafeWebRetrievalService(
    dependencies,
    options ?? {
      timeoutMs: 8000,
      maxBytes: 256 * 1024,
      maxRedirects: 3,
      userAgent: USER_AGENT,
    },
  );
  return { service, dependencies };
}

async function expectCode(run: () => Promise<unknown>, code: StableCode): Promise<Error> {
  let caught: unknown;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  const error = caught as Error;
  expect(error.message).toBe(code);
  expect(error.message).not.toMatch(/\d{1,3}(?:\.\d{1,3}){3}/);
  expect(error.message).not.toMatch(/secret|hunter2|password|Bearer /i);
  expect(error.message).not.toContain('<html>');
  expect(error.message).not.toContain('super-secret');
  return error;
}

describe('SafeWebRetrievalService URL and address policy', () => {
  it.each([
    ['', 'empty URL'],
    ['ftp://example.com/', 'non-http scheme'],
    ['file:///etc/passwd', 'file scheme'],
    ['data:text/plain,hello', 'data scheme'],
    ['javascript:alert(1)', 'javascript scheme'],
    ['https://user:hunter2@example.com/', 'URL credentials'],
    ['https://secret@example.com/', 'URL username'],
    ['http://./', 'malformed hostname'],
    ['http://-example.com/', 'hostname label starting with hyphen'],
    ['http://[fe80::1%25eth0]/', 'IPv6 zone identifier'],
    ['http://localhost/', 'localhost'],
    ['http://localhost./', 'trailing-dot localhost'],
    ['http://evil.localhost/', 'localhost subdomain'],
  ])('rejects %s (%s) as unsafe-url', async (input) => {
    const { service, dependencies } = createService();
    await expectCode(() => service.retrieve(input), 'unsafe-url');
    expect(dependencies.requests).toHaveLength(0);
  });

  it.each([
    ['http://127.0.0.1/', 'loopback'],
    ['http://2130706433/', 'decimal IPv4'],
    ['http://0177.0.0.1/', 'octal IPv4'],
    ['http://0x7f.0.0.1/', 'hex IPv4'],
    ['http://127.1/', 'short IPv4'],
    ['http://0.0.0.0/', '0.0.0.0/8'],
    ['http://10.1.2.3/', 'RFC1918 10/8'],
    ['http://172.16.9.1/', 'RFC1918 172.16/12'],
    ['http://192.168.1.4/', 'RFC1918 192.168/16'],
    ['http://100.64.1.2/', 'carrier-grade NAT'],
    ['http://169.254.12.3/', 'link-local'],
    ['http://192.0.2.1/', 'documentation TEST-NET-1'],
    ['http://198.51.100.2/', 'documentation TEST-NET-2'],
    ['http://203.0.113.4/', 'documentation TEST-NET-3'],
    ['http://198.18.0.9/', 'benchmark'],
    ['http://224.0.0.1/', 'multicast'],
    ['http://240.0.0.1/', 'reserved'],
    ['http://255.255.255.255/', 'broadcast'],
    ['http://[::1]/', 'IPv6 loopback'],
    ['http://[::]/', 'IPv6 unspecified'],
    ['http://[fc00::1]/', 'unique-local'],
    ['http://[fd12:3456:789a::1]/', 'unique-local fd'],
    ['http://[fe80::1]/', 'IPv6 link-local'],
    ['http://[2001:db8::1]/', 'IPv6 documentation'],
    ['http://[ff02::1]/', 'IPv6 multicast'],
    ['http://[::ffff:127.0.0.1]/', 'IPv4-mapped loopback'],
    ['http://[::ffff:10.0.0.1]/', 'IPv4-mapped RFC1918'],
    ['http://[::ffff:192.168.0.1]/', 'IPv4-mapped private'],
    ['http://[64:ff9b::a00:1]/', 'NAT64 well-known prefix embedding RFC1918'],
    ['http://[2002:0a00:0001::]/', '6to4 prefix encoding RFC1918'],
    ['http://[::127.0.0.1]/', 'deprecated IPv4-compatible loopback'],
  ])('rejects %s (%s) as unsafe-address', async (input) => {
    const defaults = createSafeWebRetrievalDependencies();
    const request = vi.fn();
    const service = new SafeWebRetrievalService(
      {
        ...defaults,
        lookup: async () => {
          throw new Error('dns must not run for blocked literals');
        },
        request,
      },
      {
        timeoutMs: 8000,
        maxBytes: 256 * 1024,
        maxRedirects: 3,
        userAgent: USER_AGENT,
      },
    );
    await expectCode(() => service.retrieve(input), 'unsafe-address');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a hostname whose DNS answer list contains any non-public address', async () => {
    const { service, dependencies } = createService({
      records: {
        'mixed.example': [PUBLIC_IPV4, { address: '10.0.0.8', family: 4 }],
      },
    });
    await expectCode(() => service.retrieve('https://mixed.example/'), 'unsafe-address');
    expect(dependencies.requests).toHaveLength(0);
  });

  it('rejects a subdomain that resolves to loopback before transport', async () => {
    const { service, dependencies } = createService({
      records: {
        'app.internal.test': [{ address: '127.0.0.1', family: 4 }],
      },
      isAddressAllowed: createSafeWebRetrievalDependencies().isAddressAllowed,
    });
    await expectCode(() => service.retrieve('https://app.internal.test/'), 'unsafe-address');
    expect(dependencies.requests).toHaveLength(0);
  });

  it('rejects an empty DNS response and a thrown DNS error without leaking details', async () => {
    const empty = createService({ records: { 'empty.example': [] } });
    await expectCode(() => empty.service.retrieve('https://empty.example/'), 'unsafe-address');
    expect(empty.dependencies.requests).toHaveLength(0);

    const failing = createService({
      lookup: async () => {
        throw new Error('ENOTFOUND secret-resolver-token');
      },
    });
    const error = await expectCode(
      () => failing.service.retrieve('https://missing.example/'),
      'unsafe-address',
    );
    expect(error.message).not.toContain('secret-resolver-token');
    expect(failing.dependencies.requests).toHaveLength(0);
  });

  it('accepts a public IPv4 literal and pins that address before transport', async () => {
    const { service, dependencies } = createService({
      isAddressAllowed: createSafeWebRetrievalDependencies().isAddressAllowed,
    });

    const result = await service.retrieve('http://1.1.1.1/page#section');

    expect(result.finalUrl).toBe('http://1.1.1.1/page');
    expect(dependencies.requests).toHaveLength(1);
    expect(dependencies.requests[0]?.address).toEqual({ address: '1.1.1.1', family: 4 });
    expect(dependencies.requests[0]?.url.hostname).toBe('1.1.1.1');
  });

  it('accepts a public IPv6 literal and pins that address before transport', async () => {
    const { service, dependencies } = createService({
      isAddressAllowed: createSafeWebRetrievalDependencies().isAddressAllowed,
    });

    await service.retrieve('http://[2001:4860:4860::8888]/');

    expect(dependencies.requests).toHaveLength(1);
    expect(dependencies.requests[0]?.address).toEqual({
      address: '2001:4860:4860::8888',
      family: 6,
    });
  });

  it('resolves DNS before transport and supplies the validated address to the request', async () => {
    const order: string[] = [];
    const { service, dependencies } = createService({
      records: { 'example.com': [PUBLIC_IPV4] },
      lookup: async (hostname) => {
        order.push(`lookup:${hostname}`);
        return [PUBLIC_IPV4];
      },
      request: async (input) => {
        order.push(`request:${input.address.address}`);
        return createRawResponse({});
      },
    });

    await service.retrieve('https://example.com/article');

    expect(order).toEqual(['lookup:example.com', 'request:93.184.216.34']);
    expect(dependencies.requests[0]?.address).toEqual(PUBLIC_IPV4);
    expect(dependencies.requests[0]?.url.hostname).toBe('example.com');
  });
});

describe('createSafeWebRetrievalDependencies address policy', () => {
  const { isAddressAllowed } = createSafeWebRetrievalDependencies();

  it.each([
    [{ address: '1.1.1.1', family: 4 as const }, true],
    [{ address: '8.8.8.8', family: 4 as const }, true],
    [{ address: '2001:4860:4860::8888', family: 6 as const }, true],
    [{ address: '::ffff:8.8.8.8', family: 6 as const }, true],
    [{ address: '0.1.2.3', family: 4 as const }, false],
    [{ address: '10.0.0.1', family: 4 as const }, false],
    [{ address: '100.64.0.1', family: 4 as const }, false],
    [{ address: '127.0.0.1', family: 4 as const }, false],
    [{ address: '169.254.169.254', family: 4 as const }, false],
    [{ address: '172.20.0.1', family: 4 as const }, false],
    [{ address: '192.168.0.1', family: 4 as const }, false],
    [{ address: '192.0.2.1', family: 4 as const }, false],
    [{ address: '198.51.100.1', family: 4 as const }, false],
    [{ address: '203.0.113.1', family: 4 as const }, false],
    [{ address: '198.18.0.1', family: 4 as const }, false],
    [{ address: '224.0.0.1', family: 4 as const }, false],
    [{ address: '240.0.0.1', family: 4 as const }, false],
    [{ address: '255.255.255.255', family: 4 as const }, false],
    [{ address: '::', family: 6 as const }, false],
    [{ address: '::1', family: 6 as const }, false],
    [{ address: 'fc00::1', family: 6 as const }, false],
    [{ address: 'fe80::1', family: 6 as const }, false],
    [{ address: '2001:db8::1', family: 6 as const }, false],
    [{ address: 'ff00::1', family: 6 as const }, false],
    [{ address: '::ffff:127.0.0.1', family: 6 as const }, false],
    [{ address: '::ffff:10.1.2.3', family: 6 as const }, false],
    [{ address: '::ffff:c0a8:1', family: 6 as const }, false],
    [{ address: '64:ff9b::a00:1', family: 6 as const }, false],
    [{ address: '64:ff9b::10.0.0.1', family: 6 as const }, false],
    [{ address: '64:ff9b::7f00:1', family: 6 as const }, false],
    [{ address: '2002:0a00:0001::', family: 6 as const }, false],
    [{ address: '2002:c0a8:1::', family: 6 as const }, false],
    [{ address: '::127.0.0.1', family: 6 as const }, false],
    [{ address: '::10.0.0.1', family: 6 as const }, false],
    [{ address: '::7f00:1', family: 6 as const }, false],
    [{ address: '::a00:1', family: 6 as const }, false],
    [{ address: '64:ff9b::808:808', family: 6 as const }, true],
    [{ address: '2002:808:808::', family: 6 as const }, true],
    [{ address: '::8.8.8.8', family: 6 as const }, true],
  ])('isAddressAllowed(%j) === %s', (address, allowed) => {
    expect(isAddressAllowed(address)).toBe(allowed);
  });
});

describe('SafeWebRetrievalService redirects and response limits', () => {
  it('reparses and re-resolves each redirect target', async () => {
    const lookups: string[] = [];
    const { service, dependencies } = createService({
      lookup: async (hostname) => {
        lookups.push(hostname);
        return [PUBLIC_IPV4];
      },
      hops: [
        () => createRawResponse({
          statusCode: 302,
          headers: { location: 'https://news.example/story' },
        }),
        () => createRawResponse({
          statusCode: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
          body: '<p>story</p>',
        }),
      ],
    });

    const result = await service.retrieve('https://example.com/start');

    expect(lookups).toEqual(['example.com', 'news.example']);
    expect(dependencies.requests).toHaveLength(2);
    expect(dependencies.requests[0]?.url.href).toBe('https://example.com/start');
    expect(dependencies.requests[1]?.url.href).toBe('https://news.example/story');
    expect(dependencies.requests[0]?.destroyed ?? false).toBe(false);
    expect(result.finalUrl).toBe('https://news.example/story');
    expect(result.text).toBe('<p>story</p>');
  });

  it('rejects a public-to-private redirect before the second request', async () => {
    const { service, dependencies } = createService({
      records: {
        'example.com': [PUBLIC_IPV4],
        'intranet.test': [{ address: '192.168.10.5', family: 4 }],
      },
      isAddressAllowed: createSafeWebRetrievalDependencies().isAddressAllowed,
      hops: [
        () => createRawResponse({
          statusCode: 301,
          headers: { location: 'https://intranet.test/admin' },
        }),
      ],
    });

    await expectCode(
      () => service.retrieve('https://example.com/public'),
      'unsafe-address',
    );
    expect(dependencies.requests).toHaveLength(1);
  });

  it('rejects redirect URLs that contain credentials without echoing them', async () => {
    const { service, dependencies } = createService({
      hops: [
        () => createRawResponse({
          statusCode: 302,
          headers: { location: 'https://user:hunter2@example.com/next' },
        }),
      ],
    });

    await expectCode(() => service.retrieve('https://example.com/start'), 'unsafe-url');
    expect(dependencies.requests).toHaveLength(1);
    expect(dependencies.requests[0]).toBeDefined();
  });

  it('resolves relative redirect targets against the current URL', async () => {
    const { service, dependencies } = createService({
      hops: [
        () => createRawResponse({
          statusCode: 302,
          headers: { location: '/next?x=1' },
        }),
        () => createRawResponse({
          statusCode: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
          body: 'relative-ok',
        }),
      ],
    });

    const result = await service.retrieve('https://example.com/old/path');
    expect(dependencies.requests[1]?.url.href).toBe('https://example.com/next?x=1');
    expect(result.text).toBe('relative-ok');
    expect(result.contentType).toBe('text/plain');
    expect(result.finalUrl).toBe('https://example.com/next?x=1');
  });

  it('fails after more than three redirects', async () => {
    const { service, dependencies } = createService({
      hops: [
        () => createRawResponse({ statusCode: 302, headers: { location: '/a' } }),
        () => createRawResponse({ statusCode: 302, headers: { location: '/b' } }),
        () => createRawResponse({ statusCode: 302, headers: { location: '/c' } }),
        () => createRawResponse({ statusCode: 302, headers: { location: '/d' } }),
      ],
    });

    await expectCode(() => service.retrieve('https://example.com/start'), 'redirect-limit');
    expect(dependencies.requests).toHaveLength(4);
  });

  it.each([
    [undefined, 'missing Location'],
    ['', 'empty Location'],
    ['::::', 'invalid Location'],
  ])('fails when Location is %s (%s)', async (location) => {
    const { service, dependencies } = createService({
      hops: [
        () => createRawResponse({
          statusCode: 302,
          headers: { location },
        }),
      ],
    });
    await expectCode(() => service.retrieve('https://example.com/start'), 'unsafe-url');
    expect(dependencies.requests).toHaveLength(1);
  });

  it.each([
    ['text/html', true],
    ['text/html; charset=utf-8', true],
    ['application/xhtml+xml; charset=UTF-8', true],
    ['text/plain; charset=us-ascii', true],
    ['application/json; charset="utf-8"', true],
    ['image/png', false],
    ['text/css', false],
    ['application/xml', false],
    ['application/javascript', false],
  ])('content type %s accepted=%s', async (contentType, accepted) => {
    const destroyed: boolean[] = [];
    const { service } = createService({
      hops: [
        () => {
          const response = createRawResponse({
            headers: { 'content-type': contentType },
            body: accepted ? 'ok' : 'nope',
          });
          const originalDestroy = response.destroy.bind(response);
          response.destroy = () => {
            destroyed.push(true);
            originalDestroy();
          };
          return response;
        },
      ],
    });

    if (accepted) {
      const result = await service.retrieve('https://example.com/');
      expect(result.text).toBe('ok');
      expect(destroyed).toHaveLength(0);
    } else {
      await expectCode(() => service.retrieve('https://example.com/'), 'unsupported-content-type');
      expect(destroyed).toEqual([true]);
    }
  });

  it('rejects a declared body over 256 KiB and destroys the request', async () => {
    const { service, dependencies } = createService({
      hops: [
        () => createRawResponse({
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'content-length': String(256 * 1024 + 1),
          },
          body: 'tiny',
        }),
      ],
    });

    await expectCode(() => service.retrieve('https://example.com/'), 'response-too-large');
    expect((dependencies.requests[0] as unknown as { destroyed?: boolean })).toBeDefined();
  });

  it('rejects a streamed body over 256 KiB and destroys the response', async () => {
    const oversize = new Uint8Array(256 * 1024 + 1).fill(65);
    let destroyed = false;
    const { service } = createService({
      hops: [
        () => {
          const response = createRawResponse({
            headers: { 'content-type': 'text/plain; charset=utf-8' },
            body: [oversize],
          });
          const originalDestroy = response.destroy.bind(response);
          response.destroy = () => {
            destroyed = true;
            originalDestroy();
          };
          return response;
        },
      ],
    });

    await expectCode(() => service.retrieve('https://example.com/'), 'response-too-large');
    expect(destroyed).toBe(true);
  });

  it('starts one 8s deadline that covers lookups, redirects, and body reads', async () => {
    const { service, dependencies } = createService({
      hops: [
        () => createRawResponse({ statusCode: 302, headers: { location: '/two' } }),
        () => createRawResponse({
          headers: { 'content-type': 'text/plain; charset=utf-8' },
          body: 'done',
        }),
      ],
    });

    await service.retrieve('https://example.com/one');
    expect(dependencies.timerCalls).toEqual([8000]);
  });

  it('aborts a DNS lookup that never settles at the shared deadline without invoking transport', async () => {
    let timeoutCallback: (() => void) | undefined;
    const { service, dependencies } = createService({
      lookup: () => new Promise(() => {}),
      setTimer: (callback) => {
        timeoutCallback = callback;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: () => {},
    });

    const pending = service.retrieve('https://example.com/hang');
    await Promise.resolve();
    expect(dependencies.requests).toHaveLength(0);
    expect(timeoutCallback).toBeTypeOf('function');
    timeoutCallback?.();
    await expectCode(() => pending, 'request-timeout');
    expect(dependencies.requests).toHaveLength(0);
  });

  it('decodes UTF-8 bodies and returns finalUrl with a normalized content type', async () => {
    const { service } = createService({
      hops: [
        () => createRawResponse({
          headers: { 'content-type': 'text/html; charset=UTF-8' },
          body: 'Giá vàng hôm nay',
        }),
      ],
    });

    const result = await service.retrieve('https://example.com/news#top');
    expect(result).toEqual({
      finalUrl: 'https://example.com/news',
      contentType: 'text/html',
      text: 'Giá vàng hôm nay',
    });
  });

  it('returns only 2xx responses and destroys redirect or rejected responses', async () => {
    const statuses: number[] = [];
    const { service } = createService({
      hops: [
        () => {
          const response = createRawResponse({
            statusCode: 302,
            headers: { location: '/ok' },
          });
          const originalDestroy = response.destroy.bind(response);
          response.destroy = () => {
            statuses.push(302);
            originalDestroy();
          };
          return response;
        },
        () => createRawResponse({
          statusCode: 200,
          headers: { 'content-type': 'text/plain; charset=ascii' },
          body: 'ok',
        }),
      ],
    });
    await expect(service.retrieve('https://example.com/go')).resolves.toMatchObject({ text: 'ok' });
    expect(statuses).toEqual([302]);

    let destroyed404 = false;
    const notFound = createService({
      hops: [
        () => {
          const response = createRawResponse({ statusCode: 404, body: 'super-secret' });
          const originalDestroy = response.destroy.bind(response);
          response.destroy = () => {
            destroyed404 = true;
            originalDestroy();
          };
          return response;
        },
      ],
    });
    await expectCode(() => notFound.service.retrieve('https://example.com/missing'), 'unexpected-status');
    expect(destroyed404).toBe(true);
  });

  it('rejects an unsupported declared charset instead of decoding as UTF-8', async () => {
    let destroyed = false;
    const { service } = createService({
      hops: [
        () => {
          const response = createRawResponse({
            headers: { 'content-type': 'text/html; charset=utf-16' },
            body: 'not-utf8',
          });
          const originalDestroy = response.destroy.bind(response);
          response.destroy = () => {
            destroyed = true;
            originalDestroy();
          };
          return response;
        },
      ],
    });

    await expectCode(() => service.retrieve('https://example.com/'), 'unsupported-charset');
    expect(destroyed).toBe(true);
  });

  it('sends only the configured User-Agent and textual Accept headers', async () => {
    const { service, dependencies } = createService();
    await service.retrieve('https://example.com/');
    const headers = dependencies.requests[0]?.headers ?? {};
    expect(headers['User-Agent']).toBe(USER_AGENT);
    expect(headers.Accept).toBe(TEXTUAL_ACCEPT);
    expect(Object.keys(headers)).toEqual(['User-Agent', 'Accept']);
    expect(headers).not.toHaveProperty('Authorization');
    expect(headers).not.toHaveProperty('Cookie');
  });

  it('rejects non-identity Content-Encoding so compressed bodies cannot bypass the byte cap', async () => {
    let destroyed = false;
    const { service } = createService({
      hops: [
        () => {
          const response = createRawResponse({
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'content-encoding': 'gzip',
            },
            body: 'compressed',
          });
          const originalDestroy = response.destroy.bind(response);
          response.destroy = () => {
            destroyed = true;
            originalDestroy();
          };
          return response;
        },
      ],
    });

    await expectCode(
      () => service.retrieve('https://example.com/'),
      'unsupported-content-encoding',
    );
    expect(destroyed).toBe(true);
  });
});

describe('createSafeWebRetrievalDependencies transport pinning', () => {
  it('rejects a pinned lookup for any hostname other than the validated hostname', async () => {
    const original = http.request;
    let capturedLookup: LookupFunction | undefined;
    http.request = ((...args: Parameters<typeof http.request>) => {
      const options = typeof args[0] === 'string' || args[0] instanceof URL
        ? (args[1] as http.RequestOptions | undefined)
        : (args[0] as http.RequestOptions);
      capturedLookup = options?.lookup as LookupFunction | undefined;
      throw new Error('stop-after-capturing-lookup');
    }) as typeof http.request;

    try {
      const deps = createSafeWebRetrievalDependencies();
      await expect(deps.request({
        url: new URL('http://validated.test/path'),
        address: PUBLIC_IPV4,
        headers: { 'User-Agent': USER_AGENT, Accept: TEXTUAL_ACCEPT },
        signal: new AbortController().signal,
      })).rejects.toThrow('stop-after-capturing-lookup');

      expect(capturedLookup).toBeTypeOf('function');
      await new Promise<void>((resolve, reject) => {
        capturedLookup?.('other.test', {}, (error) => {
          try {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe('unsafe-address');
            resolve();
          } catch (assertion) {
            reject(assertion);
          }
        });
      });
      await new Promise<void>((resolve, reject) => {
        capturedLookup?.('validated.test', {}, (error, address, family) => {
          try {
            expect(error).toBeNull();
            expect(address).toBe(PUBLIC_IPV4.address);
            expect(family).toBe(4);
            resolve();
          } catch (assertion) {
            reject(assertion);
          }
        });
      });
    } finally {
      http.request = original;
    }
  });

  it('keeps HTTPS SNI and certificate verification bound to the original hostname', async () => {
    const original = https.request;
    let captured: https.RequestOptions | undefined;
    https.request = ((...args: Parameters<typeof https.request>) => {
      captured = typeof args[0] === 'string' || args[0] instanceof URL
        ? (args[1] as https.RequestOptions | undefined)
        : (args[0] as https.RequestOptions);
      throw new Error('stop-after-capturing-https');
    }) as typeof https.request;

    try {
      const deps = createSafeWebRetrievalDependencies();
      await expect(deps.request({
        url: new URL('https://news.example/path'),
        address: PUBLIC_IPV4,
        headers: { 'User-Agent': USER_AGENT, Accept: TEXTUAL_ACCEPT },
        signal: new AbortController().signal,
      })).rejects.toThrow('stop-after-capturing-https');

      expect(captured?.servername).toBe('news.example');
      expect(captured?.rejectUnauthorized).not.toBe(false);
      expect(captured?.hostname ?? new URL('https://news.example/path').hostname).toBe('news.example');
    } finally {
      https.request = original;
    }
  });

  it('default transport invokes the pinned lookup for the validated hostname', async () => {
    const seen: string[] = [];
    const server = http.createServer((req, res) => {
      seen.push(`${req.method} ${req.headers.host} ${req.url}`);
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('pinned-ok');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server.address() as AddressInfo;

    try {
      const defaults = createSafeWebRetrievalDependencies();
      expect(defaults.isAddressAllowed({ address: '127.0.0.1', family: 4 })).toBe(false);

      const service = new SafeWebRetrievalService({
        ...defaults,
        async lookup(hostname) {
          expect(hostname).toBe('retrieval.test');
          return [{ address: '127.0.0.1', family: 4 }];
        },
        isAddressAllowed(address) {
          return address.address === '127.0.0.1' && address.family === 4;
        },
      });

      const result = await service.retrieve(`http://retrieval.test:${port}/safe`);
      expect(result.text).toBe('pinned-ok');
      expect(result.finalUrl).toBe(`http://retrieval.test:${port}/safe`);
      expect(result.contentType).toBe('text/plain');
      expect(seen.some((line) => line.includes('retrieval.test'))).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
