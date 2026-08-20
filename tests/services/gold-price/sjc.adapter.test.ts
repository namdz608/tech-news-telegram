import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GoldPriceAdapterError,
  isGoldPriceAdapterError,
  normalizeGoldPriceAdapterError,
  type GoldQuoteFailureCode,
  type ParsedGoldQuote,
} from '../../../src/types/gold-politics';
import {
  SJC_GOLD_FETCH_URL,
  SjcGoldPriceAdapter,
  parseSjcGoldQuote,
} from '../../../src/services/gold-price/sjc.adapter';

const sjcHtml = readFileSync(join(process.cwd(), 'tests/fixtures/gold-price/sjc.html'), 'utf8');

const expectedQuote: ParsedGoldQuote = {
  quoteKind: 'buy-sell',
  buy: 143000,
  sell: 146000,
  sourceUnit: 'thousand-vnd-per-tael',
  sourceTimestamp: '2026-08-20T03:32:28.000Z',
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

describe('parseSjcGoldQuote', () => {
  it('parses the one-tael SJC row from the sanitized fixture', () => {
    expectQuote(parseSjcGoldQuote(sjcHtml), expectedQuote);
  });

  it('selects the SJC 1L row among multiple instruments', () => {
    expectQuote(parseSjcGoldQuote(sjcHtml), expectedQuote);
    expectThrownCode(
      () => parseSjcGoldQuote(sjcHtml.replace('SJC 1L', 'SJC 10L')),
      'invalid-payload',
    );
  });

  it('maps nghìn đồng/lượng and đồng/lượng without inferring from magnitude', () => {
    expect(parseSjcGoldQuote(sjcHtml).sourceUnit).toBe('thousand-vnd-per-tael');
    expect(
      parseSjcGoldQuote(sjcHtml.replace('nghìn đồng/lượng', 'đồng/lượng')).sourceUnit,
    ).toBe('vnd-per-tael');
  });

  it('interprets Vietnamese timestamps as +07:00 instants', () => {
    expect(parseSjcGoldQuote(sjcHtml).sourceTimestamp).toBe('2026-08-20T03:32:28.000Z');
  });

  it('rejects missing or conflicting unit markers', () => {
    expectThrownCode(() => parseSjcGoldQuote(sjcHtml.replace('nghìn đồng/lượng', '')), 'ambiguous-unit');
    expectThrownCode(
      () => parseSjcGoldQuote(sjcHtml.replace('nghìn đồng/lượng', 'nghìn đồng/lượng Nghìn VND/chỉ')),
      'ambiguous-unit',
    );
  });

  it('rejects missing, invalid, and impossible timestamps', () => {
    expectThrownCode(() => parseSjcGoldQuote(sjcHtml.replace('20/08/2026 10:32:28', '')), 'invalid-timestamp');
    expectThrownCode(
      () => parseSjcGoldQuote(sjcHtml.replace('20/08/2026 10:32:28', '20-08-2026 10:32:28')),
      'invalid-timestamp',
    );
    expectThrownCode(
      () => parseSjcGoldQuote(sjcHtml.replace('20/08/2026 10:32:28', '31/02/2026 10:32:28')),
      'invalid-timestamp',
    );
  });

  it('rejects non-finite, non-positive, and inverted buy/sell values', () => {
    expectThrownCode(() => parseSjcGoldQuote(sjcHtml.replace('143000', 'abc')), 'invalid-payload');
    expectThrownCode(() => parseSjcGoldQuote(sjcHtml.replace('143000', '0')), 'invalid-payload');
    expectThrownCode(() => parseSjcGoldQuote(sjcHtml.replace('143000', '-1')), 'invalid-payload');
    expectThrownCode(
      () => parseSjcGoldQuote(sjcHtml.replace('143000', '146001').replace('146000', '143000')),
      'invalid-payload',
    );
  });

  it('does not substitute another product when SJC 1L is missing', () => {
    expectThrownCode(
      () => parseSjcGoldQuote(sjcHtml.replace('<td>SJC 1L</td>', '<td>Vàng nữ trang</td>')),
      'invalid-payload',
    );
  });
});

describe('SjcGoldPriceAdapter', () => {
  it('fetches the pinned SJC page and returns the parsed quote', async () => {
    const adapter = new SjcGoldPriceAdapter(undefined, {
      async get(url) {
        expect(url).toBe(SJC_GOLD_FETCH_URL);
        return { data: sjcHtml, headers: { 'content-type': 'text/html; charset=utf-8' } };
      },
    });

    expect(adapter.source).toEqual({
      providerKey: 'sjc',
      providerName: 'SJC',
      instrumentKey: 'sjc-1l',
      instrumentName: 'SJC 1 lượng',
      sourceUrl: 'https://www.sjc.com.vn/bieu-do-gia-vang',
      displayUnit: 'million-vnd-per-tael',
    });
    expectQuote(await adapter.fetch(), expectedQuote);
  });

  it('maps wrong MIME to invalid-payload and transport failures to fetch-failed', async () => {
    const wrongMime = new SjcGoldPriceAdapter(undefined, {
      async get() {
        return { data: sjcHtml, headers: { 'content-type': 'application/json' } };
      },
    });
    await expect(wrongMime.fetch()).rejects.toEqual(
      expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'invalid-payload' }),
    );

    const transport = new SjcGoldPriceAdapter(undefined, {
      async get() {
        throw new Error('Request failed with status code 403');
      },
    });
    await expect(transport.fetch()).rejects.toEqual(
      expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'fetch-failed', message: 'fetch-failed' }),
    );
  });

  it('rejects an oversize response and does not follow a 3xx Location', async () => {
    await withServer(
      (req, res) => {
        if (req.url === '/quote') {
          res.writeHead(302, { Location: '/secret-target' });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(sjcHtml);
      },
      async ({ origin, requests }) => {
        const adapter = new SjcGoldPriceAdapter(`${origin}/quote`);
        await expect(adapter.fetch()).rejects.toEqual(
          expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'fetch-failed' }),
        );
        expect(requests).toEqual(['GET /quote']);
      },
    );

    await withServer(
      (_req, res) => {
        const body = Buffer.alloc(512 * 1024 + 1, 97);
        res.writeHead(200, {
          'content-type': 'text/html',
          'content-length': String(body.length),
        });
        res.end(body);
      },
      async ({ origin }) => {
        const adapter = new SjcGoldPriceAdapter(`${origin}/`);
        await expect(adapter.fetch()).rejects.toEqual(
          expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'fetch-failed' }),
        );
      },
    );
  });

  it('keeps spoofed adapter errors from inventing a failureReason', () => {
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
      isGoldPriceAdapterError({ name: 'GoldPriceAdapterError', code: 'raw-secret' }),
    ).toBe(false);
  });
});
