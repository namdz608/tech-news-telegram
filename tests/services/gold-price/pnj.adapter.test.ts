import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PNJ_GOLD_FETCH_URL,
  PnjGoldPriceAdapter,
  parsePnjGoldQuote,
} from '../../../src/services/gold-price/pnj.adapter';
import type { GoldQuoteFailureCode, ParsedGoldQuote } from '../../../src/types/gold-politics';

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/gold-price/pnj.json'), 'utf8'),
) as {
  unit: string;
  updateDate: string;
  data: Array<{ masp: string; tensp: string; giamua: number; giaban: number }>;
};

const expectedQuote: ParsedGoldQuote = {
  quoteKind: 'buy-sell',
  buy: 14300,
  sell: 14600,
  sourceUnit: 'thousand-vnd-per-chi',
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

describe('parsePnjGoldQuote', () => {
  it('parses the SJC 999.9 row from the sanitized edge fixture', () => {
    expectQuote(parsePnjGoldQuote(fixture), expectedQuote);
  });

  it('selects masp SJC and the exact tensp among multiple rows', () => {
    expectQuote(parsePnjGoldQuote(fixture), expectedQuote);
    expectThrownCode(
      () =>
        parsePnjGoldQuote({
          ...fixture,
          data: fixture.data.filter((row) => row.masp !== 'SJC'),
        }),
      'invalid-payload',
    );
    expectThrownCode(
      () =>
        parsePnjGoldQuote({
          ...fixture,
          data: fixture.data.map((row) =>
            row.masp === 'SJC' ? { ...row, tensp: 'Vàng miếng SJC' } : row,
          ),
        }),
      'invalid-payload',
    );
  });

  it('maps the official UI unit ĐVT: 1.000đ/Chỉ and VND/chỉ without magnitude inference', () => {
    expect(parsePnjGoldQuote(fixture).sourceUnit).toBe('thousand-vnd-per-chi');
    expect(fixture.unit).toBe('ĐVT: 1.000đ/Chỉ');
    expect(parsePnjGoldQuote({ ...fixture, unit: 'VND/chỉ' }).sourceUnit).toBe('vnd-per-chi');
  });

  it('interprets Vietnamese updateDate as a +07:00 instant', () => {
    expect(parsePnjGoldQuote(fixture).sourceTimestamp).toBe('2026-08-20T03:32:28.000Z');
  });

  it('rejects missing or conflicting unit markers', () => {
    expectThrownCode(() => parsePnjGoldQuote({ ...fixture, unit: undefined }), 'ambiguous-unit');
    expectThrownCode(
      () => parsePnjGoldQuote({ ...fixture, unit: 'ĐVT: 1.000đ/Chỉ nghìn đồng/lượng' }),
      'ambiguous-unit',
    );
  });

  it('rejects missing, invalid, and impossible timestamps', () => {
    expectThrownCode(() => parsePnjGoldQuote({ ...fixture, updateDate: undefined }), 'invalid-timestamp');
    expectThrownCode(
      () => parsePnjGoldQuote({ ...fixture, updateDate: '2026-08-20T03:32:28.000Z' }),
      'invalid-timestamp',
    );
    expectThrownCode(
      () => parsePnjGoldQuote({ ...fixture, updateDate: '31/02/2026 10:32:28' }),
      'invalid-timestamp',
    );
  });

  it('rejects non-finite, non-positive, and inverted buy/sell values', () => {
    expectThrownCode(
      () =>
        parsePnjGoldQuote({
          ...fixture,
          data: fixture.data.map((row) => (row.masp === 'SJC' ? { ...row, giamua: 0 } : row)),
        }),
      'invalid-payload',
    );
    expectThrownCode(
      () =>
        parsePnjGoldQuote({
          ...fixture,
          data: fixture.data.map((row) =>
            row.masp === 'SJC' ? { ...row, giamua: Number.POSITIVE_INFINITY } : row,
          ),
        }),
      'invalid-payload',
    );
    expectThrownCode(
      () =>
        parsePnjGoldQuote({
          ...fixture,
          data: fixture.data.map((row) =>
            row.masp === 'SJC' ? { ...row, giamua: 14601, giaban: 14600 } : row,
          ),
        }),
      'invalid-payload',
    );
  });
});

describe('PnjGoldPriceAdapter', () => {
  it('fetches the edge API and exposes the public PNJ page as sourceUrl', async () => {
    const adapter = new PnjGoldPriceAdapter(undefined, {
      async get(url) {
        expect(url).toBe(PNJ_GOLD_FETCH_URL);
        return {
          data: { updateDate: fixture.updateDate, data: fixture.data },
          headers: { 'content-type': 'application/json' },
        };
      },
    });

    expect(adapter.source).toEqual({
      providerKey: 'pnj',
      providerName: 'PNJ',
      instrumentKey: 'pnj-sjc-999.9',
      instrumentName: 'Vàng miếng SJC 999.9',
      sourceUrl: 'https://www.pnj.com.vn/site/gia-vang',
      displayUnit: 'million-vnd-per-tael',
    });
    expect(adapter.source.sourceUrl).not.toContain('edge-api');
    expectQuote(await adapter.fetch(), expectedQuote);
  });

  it('maps wrong MIME to invalid-payload and transport failures to fetch-failed', async () => {
    const wrongMime = new PnjGoldPriceAdapter(undefined, {
      async get() {
        return { data: fixture, headers: { 'content-type': 'text/plain' } };
      },
    });
    await expect(wrongMime.fetch()).rejects.toEqual(
      expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'invalid-payload' }),
    );

    const transport = new PnjGoldPriceAdapter(undefined, {
      async get() {
        throw new Error('ECONNRESET');
      },
    });
    await expect(transport.fetch()).rejects.toEqual(
      expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'fetch-failed' }),
    );
  });

  it('rejects an oversize response and does not follow a 3xx Location', async () => {
    await withServer(
      (req, res) => {
        if (req.url?.startsWith('/ecom')) {
          res.writeHead(302, { Location: '/secret-target' });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ updateDate: fixture.updateDate, data: fixture.data }));
      },
      async ({ origin, requests }) => {
        const adapter = new PnjGoldPriceAdapter(`${origin}/ecom-frontend/v1/get-gold-price?zone=00`);
        await expect(adapter.fetch()).rejects.toEqual(
          expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'fetch-failed' }),
        );
        expect(requests).toEqual(['GET /ecom-frontend/v1/get-gold-price?zone=00']);
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
        const adapter = new PnjGoldPriceAdapter(`${origin}/`);
        await expect(adapter.fetch()).rejects.toEqual(
          expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'fetch-failed' }),
        );
      },
    );
  });
});
