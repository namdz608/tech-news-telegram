import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { env } from '../../../src/config/env';
import {
  XauUsdGoldPriceAdapter,
  parseXauUsdGoldQuote,
  toPublicSourceOrigin,
} from '../../../src/services/gold-price/xau-usd.adapter';
import {
  GoldPriceAdapterError,
  isGoldPriceAdapterError,
  normalizeGoldPriceAdapterError,
  type GoldQuoteFailureCode,
  type ParsedGoldQuote,
} from '../../../src/types/gold-politics';

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/gold-price/xau-usd.json'), 'utf8'),
) as { symbol: string; currency: string; price: number; updatedAt: string };

const expectedQuote: ParsedGoldQuote = {
  quoteKind: 'spot',
  spot: 4493.299805,
  sourceUnit: 'usd-per-troy-ounce',
  sourceTimestamp: '2026-08-20T03:01:39.000Z',
};

function expectQuote(actual: ParsedGoldQuote, expected: ParsedGoldQuote): void {
  expect(actual).toEqual(expected);
}

function expectThrownCode(run: () => unknown, code: GoldQuoteFailureCode): void {
  expect(run).toThrow(
    expect.objectContaining({ name: 'GoldPriceAdapterError', code }),
  );
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

describe('parseXauUsdGoldQuote', () => {
  it('parses the sanitized XAU/USD fixture', () => {
    expectQuote(parseXauUsdGoldQuote(fixture), expectedQuote);
  });

  it('requires XAU, USD, a positive price, and a valid updatedAt', () => {
    expectThrownCode(() => parseXauUsdGoldQuote({ ...fixture, symbol: 'XAG' }), 'invalid-payload');
    expectThrownCode(() => parseXauUsdGoldQuote({ ...fixture, currency: 'VND' }), 'invalid-payload');
    expectThrownCode(() => parseXauUsdGoldQuote({ ...fixture, price: 0 }), 'invalid-payload');
    expectThrownCode(() => parseXauUsdGoldQuote({ ...fixture, price: -1 }), 'invalid-payload');
    expectThrownCode(
      () => parseXauUsdGoldQuote({ ...fixture, price: Number.NaN }),
      'invalid-payload',
    );
    expectThrownCode(() => parseXauUsdGoldQuote({ ...fixture, updatedAt: '' }), 'invalid-timestamp');
    expectThrownCode(
      () => parseXauUsdGoldQuote({ ...fixture, updatedAt: '20/08/2026 10:32:28' }),
      'invalid-timestamp',
    );
  });

  it('accepts exactly the four GoldQuoteFailureCode literals', () => {
    for (const code of [
      'fetch-failed',
      'invalid-payload',
      'ambiguous-unit',
      'invalid-timestamp',
    ] as const) {
      const error = new GoldPriceAdapterError(code);
      expect(isGoldPriceAdapterError(error)).toBe(true);
      expect(normalizeGoldPriceAdapterError(error)).toBe(code);
    }

    expect(
      normalizeGoldPriceAdapterError({ name: 'GoldPriceAdapterError', code: 'raw-secret' }),
    ).toBe('fetch-failed');
    expect(
      isGoldPriceAdapterError(Object.assign(new Error('leak'), { name: 'GoldPriceAdapterError', code: 'raw-secret' })),
    ).toBe(false);
  });
});

describe('toPublicSourceOrigin', () => {
  it('exposes only origin and never retains path, query, or fragment secrets', () => {
    const secretUrl = 'https://spot.example/v1/path-secret/price?api_key=query-secret#latest';
    expect(toPublicSourceOrigin(secretUrl)).toBe('https://spot.example/');
    expect(toPublicSourceOrigin(secretUrl)).not.toContain('path-secret');
    expect(toPublicSourceOrigin(secretUrl)).not.toContain('query-secret');
  });
});

describe('XauUsdGoldPriceAdapter', () => {
  it('fetches the configured URL while exposing only the public origin', async () => {
    const secretUrl = 'https://spot.example/v1/path-secret/price?api_key=query-secret#latest';
    let requested: string | undefined;
    const adapter = new XauUsdGoldPriceAdapter(secretUrl, {
      async get(url) {
        requested = url;
        return { data: fixture, headers: { 'content-type': 'application/json' } };
      },
    });

    expect(adapter.source).toEqual({
      providerKey: 'xau-usd',
      providerName: 'Gold API',
      instrumentKey: 'xau-usd-spot',
      instrumentName: 'XAU/USD',
      sourceUrl: 'https://spot.example/',
      displayUnit: 'usd-per-troy-ounce',
    });
    expectQuote(await adapter.fetch(), expectedQuote);
    expect(requested).toBe(secretUrl);
    expect(JSON.stringify(adapter.source)).not.toContain('path-secret');
    expect(JSON.stringify(adapter.source)).not.toContain('query-secret');
  });

  it('uses GOLD_SPOT_API_URL by default', async () => {
    const adapter = new XauUsdGoldPriceAdapter(undefined, {
      async get(url) {
        expect(url).toBe(env.GOLD_SPOT_API_URL);
        return { data: fixture, headers: { 'content-type': 'application/json' } };
      },
    });

    expect(adapter.source.sourceUrl).toBe(toPublicSourceOrigin(env.GOLD_SPOT_API_URL));
    expectQuote(await adapter.fetch(), expectedQuote);
  });

  it('maps wrong MIME to invalid-payload and transport failures to fetch-failed', async () => {
    const wrongMime = new XauUsdGoldPriceAdapter(undefined, {
      async get() {
        return { data: fixture, headers: { 'content-type': 'text/html' } };
      },
    });
    await expect(wrongMime.fetch()).rejects.toEqual(
      expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'invalid-payload' }),
    );

    const transport = new XauUsdGoldPriceAdapter(undefined, {
      async get() {
        throw new Error('getaddrinfo ENOTFOUND');
      },
    });
    await expect(transport.fetch()).rejects.toEqual(
      expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'fetch-failed' }),
    );
  });

  it('rejects an oversize response and does not follow a 3xx Location', async () => {
    await withServer(
      (req, res) => {
        if (req.url === '/v1/path-secret/price?api_key=query-secret') {
          res.writeHead(302, { Location: '/secret-target' });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(fixture));
      },
      async ({ origin, requests }) => {
        const adapter = new XauUsdGoldPriceAdapter(
          `${origin}/v1/path-secret/price?api_key=query-secret#latest`,
        );
        expect(adapter.source.sourceUrl).toBe(`${origin}/`);
        await expect(adapter.fetch()).rejects.toEqual(
          expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'fetch-failed' }),
        );
        expect(requests).toEqual(['GET /v1/path-secret/price?api_key=query-secret']);
        expect(requests.join('\n')).not.toContain('secret-target');
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
        const adapter = new XauUsdGoldPriceAdapter(`${origin}/price/XAU`);
        await expect(adapter.fetch()).rejects.toEqual(
          expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'fetch-failed' }),
        );
      },
    );
  });
});
