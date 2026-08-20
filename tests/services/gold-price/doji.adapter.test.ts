import { createCipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DojiGoldPriceAdapter,
  parseDojiGoldQuote,
} from '../../../src/services/gold-price/doji.adapter';
import type { GoldQuoteFailureCode, ParsedGoldQuote } from '../../../src/types/gold-politics';

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'tests/fixtures/gold-price/doji.json'), 'utf8'),
) as { unit: string; data: unknown[] };

const DOJI_FRONTEND_AES_KEY_HEX =
  '7a4b8c3d1e9f2a5b6c0d4e8f3a7b1c5d9e2f6a0b4c8d3e7f1a5b9c2d6e0f4a8b';
const DOJI_AES_ENVELOPE =
  'AAECAwQFBgcICQoLDA0OD/LPb6VVzQE4+pWL3qZwNoaByOQpbm4vXAvndf8YMwOUJm0AqToT3sFipMKTfiIzl0MUBDP6qx3ow0IzrHXm84OaqYXq3IbdVd/xNHZSJqLVtSImkiC9tlH/4xzJgVuW8HEmnMlqtSzvTn187mib+81oOuAY57N/qNsX8SEtDft76hUZNE6Z69nlsjgGGwolXZo+aCrgxbhP969xeFVgt1M4xEGNKSVgibQOQ7cnp9i8RWJjFIfMomw1QmONysca7A==';

const expectedQuote: ParsedGoldQuote = {
  quoteKind: 'buy-sell',
  buy: 14300,
  sell: 14600,
  sourceUnit: 'thousand-vnd-per-chi',
  sourceTimestamp: '2026-08-20T03:32:28.600Z',
};

function expectQuote(actual: ParsedGoldQuote, expected: ParsedGoldQuote): void {
  expect(actual).toEqual(expected);
}

function expectThrownCode(run: () => unknown, code: GoldQuoteFailureCode): void {
  expect(run).toThrow(
    expect.objectContaining({ name: 'GoldPriceAdapterError', code }),
  );
}

function encryptDojiPlaintext(plaintext: string, keyHex = DOJI_FRONTEND_AES_KEY_HEX): string {
  const iv = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
  const cipher = createCipheriv('aes-256-cbc', Buffer.from(keyHex, 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, ciphertext]).toString('base64');
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

function jsonHeaders() {
  return { 'content-type': 'application/json; charset=utf-8' };
}

describe('parseDojiGoldQuote', () => {
  it('parses the active SJC bar from the decrypted fixture', () => {
    expectQuote(parseDojiGoldQuote(fixture), expectedQuote);
  });

  it('selects type G / materialCode 01 among multiple rows', () => {
    expectQuote(parseDojiGoldQuote(fixture), expectedQuote);
    expectThrownCode(
      () =>
        parseDojiGoldQuote({
          ...fixture,
          data: fixture.data.filter((row) => (row as { materialCode: string }).materialCode !== '01'),
        }),
      'invalid-payload',
    );
  });

  it('maps Nghìn VND/chỉ and VND/chỉ from the official UI label', () => {
    expect(parseDojiGoldQuote(fixture).sourceUnit).toBe('thousand-vnd-per-chi');
    expect(parseDojiGoldQuote({ ...fixture, unit: 'VND/chỉ' }).sourceUnit).toBe('vnd-per-chi');
    expect(fixture.unit).toBe('Nghìn VND/chỉ');
  });

  it('rejects missing or conflicting unit markers', () => {
    expectThrownCode(() => parseDojiGoldQuote({ ...fixture, unit: undefined }), 'ambiguous-unit');
    expectThrownCode(
      () => parseDojiGoldQuote({ ...fixture, unit: 'Nghìn VND/chỉ nghìn đồng/lượng' }),
      'ambiguous-unit',
    );
  });

  it('rejects missing, invalid, and out-of-contract timestamps', () => {
    const [other, sjc] = fixture.data as Record<string, unknown>[];
    expectThrownCode(
      () => parseDojiGoldQuote({ ...fixture, data: [other, { ...sjc, updateDate: undefined }] }),
      'invalid-timestamp',
    );
    expectThrownCode(
      () => parseDojiGoldQuote({ ...fixture, data: [other, { ...sjc, updateDate: '20/08/2026 10:32:28' }] }),
      'invalid-timestamp',
    );
    expectThrownCode(
      () => parseDojiGoldQuote({ ...fixture, data: [other, { ...sjc, updateDate: 'not-a-date' }] }),
      'invalid-timestamp',
    );
  });

  it('rejects non-finite, non-positive, and inverted buy/sell values', () => {
    const [other, sjc] = fixture.data as Record<string, unknown>[];
    expectThrownCode(
      () => parseDojiGoldQuote({ ...fixture, data: [other, { ...sjc, priceDojiBuyIn: Number.NaN }] }),
      'invalid-payload',
    );
    expectThrownCode(
      () => parseDojiGoldQuote({ ...fixture, data: [other, { ...sjc, priceDojiBuyIn: 0 }] }),
      'invalid-payload',
    );
    expectThrownCode(
      () =>
        parseDojiGoldQuote({
          ...fixture,
          data: [other, { ...sjc, priceDojiBuyIn: 14601, priceDojiSellOut: 14600 }],
        }),
      'invalid-payload',
    );
  });

  it('does not substitute another product when the SJC bar is inactive or missing', () => {
    const [other, sjc] = fixture.data as Record<string, unknown>[];
    expectThrownCode(
      () => parseDojiGoldQuote({ ...fixture, data: [other, { ...sjc, isActive: false }] }),
      'invalid-payload',
    );
    expectThrownCode(
      () => parseDojiGoldQuote({ ...fixture, data: [other] }),
      'invalid-payload',
    );
  });
});

describe('DojiGoldPriceAdapter', () => {
  it('decrypts the public AES envelope and returns the SJC bar quote', async () => {
    const decoded = Buffer.from(DOJI_AES_ENVELOPE, 'base64');
    expect(decoded.subarray(0, 16).toString('hex')).toBe('000102030405060708090a0b0c0d0e0f');

    const adapter = new DojiGoldPriceAdapter(undefined, {
      async get(url) {
        expect(url).toBe('https://banggia.doji.vn/api/TablePrice/GetTablePrice');
        return {
          data: { status: true, data: DOJI_AES_ENVELOPE },
          headers: jsonHeaders(),
        };
      },
    });

    expect(adapter.source).toEqual({
      providerKey: 'doji',
      providerName: 'DOJI',
      instrumentKey: 'doji-sjc-bar',
      instrumentName: 'VÀNG MIẾNG SJC',
      sourceUrl: 'https://banggia.doji.vn/',
      displayUnit: 'million-vnd-per-tael',
    });
    expect(adapter.source.sourceUrl).not.toContain('TablePrice');
    expectQuote(await adapter.fetch(), expectedQuote);
  });

  it('rejects non-canonical base64, short IV, non-block ciphertext, bad padding, wrong key, and invalid schema', async () => {
    const cases: unknown[] = [
      { status: true, data: `${DOJI_AES_ENVELOPE.slice(0, -2)}` },
      { status: true, data: DOJI_AES_ENVELOPE.replaceAll('+', '-') },
      { status: true, data: Buffer.alloc(8).toString('base64') },
      { status: true, data: Buffer.concat([Buffer.alloc(16), Buffer.alloc(15)]).toString('base64') },
      {
        status: true,
        data: Buffer.concat([Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex'), Buffer.alloc(16)]).toString(
          'base64',
        ),
      },
      { status: true, data: encryptDojiPlaintext(JSON.stringify(fixture.data), '11'.repeat(32)) },
      { status: true, data: encryptDojiPlaintext('{"hello":"world"}') },
      { status: false, data: DOJI_AES_ENVELOPE },
    ];

    for (const payload of cases) {
      const adapter = new DojiGoldPriceAdapter(undefined, {
        async get() {
          return { data: payload, headers: jsonHeaders() };
        },
      });
      await expect(adapter.fetch()).rejects.toEqual(
        expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'invalid-payload' }),
      );
    }
  });

  it('maps wrong MIME to invalid-payload and transport failures to fetch-failed', async () => {
    const wrongMime = new DojiGoldPriceAdapter(undefined, {
      async get() {
        return { data: { status: true, data: DOJI_AES_ENVELOPE }, headers: { 'content-type': 'text/html' } };
      },
    });
    await expect(wrongMime.fetch()).rejects.toEqual(
      expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'invalid-payload' }),
    );

    const transport = new DojiGoldPriceAdapter(undefined, {
      async get() {
        throw new Error('socket hang up');
      },
    });
    await expect(transport.fetch()).rejects.toEqual(
      expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'fetch-failed' }),
    );
  });

  it('rejects an oversize response and does not follow a 3xx Location', async () => {
    await withServer(
      (req, res) => {
        if (req.url === '/api') {
          res.writeHead(302, { Location: '/secret-target' });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: true, data: DOJI_AES_ENVELOPE }));
      },
      async ({ origin, requests }) => {
        const adapter = new DojiGoldPriceAdapter(`${origin}/api`);
        await expect(adapter.fetch()).rejects.toEqual(
          expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'fetch-failed' }),
        );
        expect(requests).toEqual(['GET /api']);
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
        const adapter = new DojiGoldPriceAdapter(`${origin}/`);
        await expect(adapter.fetch()).rejects.toEqual(
          expect.objectContaining({ name: 'GoldPriceAdapterError', code: 'fetch-failed' }),
        );
      },
    );
  });
});
