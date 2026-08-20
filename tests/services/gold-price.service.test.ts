import { describe, expect, it, vi } from 'vitest';
import { GoldPriceService } from '../../src/services/gold-price.service';
import type { GoldPriceHistoryLike } from '../../src/services/gold-price-history.store';
import {
  GoldPriceAdapterError,
  type GoldPriceAdapter,
  type GoldPriceSource,
  type GoldQuote,
  type GoldQuoteFailureCode,
  type GoldSourceUnit,
  type NormalizedGoldObservation,
  type ParsedGoldQuote,
  type StoredGoldQuote,
} from '../../src/types/gold-politics';

const COLLECTED_AT = new Date('2026-08-20T04:00:00.000Z');
const MAX_AGE_MINUTES = 60;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

const sjcSource: GoldPriceSource = {
  providerKey: 'sjc',
  providerName: 'SJC',
  instrumentKey: 'sjc-1l',
  instrumentName: 'SJC 1 lượng',
  sourceUrl: 'https://www.sjc.com.vn/bieu-do-gia-vang',
  displayUnit: 'million-vnd-per-tael',
};

const dojiSource: GoldPriceSource = {
  providerKey: 'doji',
  providerName: 'DOJI',
  instrumentKey: 'doji-sjc-bar',
  instrumentName: 'VÀNG MIẾNG SJC',
  sourceUrl: 'https://banggia.doji.vn/',
  displayUnit: 'million-vnd-per-tael',
};

const pnjSource: GoldPriceSource = {
  providerKey: 'pnj',
  providerName: 'PNJ',
  instrumentKey: 'pnj-sjc-999.9',
  instrumentName: 'Vàng miếng SJC 999.9',
  sourceUrl: 'https://www.pnj.com.vn/site/gia-vang',
  displayUnit: 'million-vnd-per-tael',
};

const xauSource: GoldPriceSource = {
  providerKey: 'xau-usd',
  providerName: 'Gold API',
  instrumentKey: 'xau-usd-spot',
  instrumentName: 'XAU/USD',
  sourceUrl: 'https://api.gold-api.com/',
  displayUnit: 'usd-per-troy-ounce',
};

function adapter(source: GoldPriceSource, fetch: GoldPriceAdapter['fetch']): GoldPriceAdapter {
  return { source, fetch };
}

function buySellQuote(
  sourceUnit: Exclude<GoldSourceUnit, 'usd-per-troy-ounce'>,
  buy: number,
  sell: number,
  sourceTimestamp = '2026-08-20T03:32:28.000Z',
): ParsedGoldQuote {
  return { quoteKind: 'buy-sell', sourceUnit, buy, sell, sourceTimestamp };
}

function spotQuote(spot: number, sourceTimestamp = '2026-08-20T03:45:00.000Z'): ParsedGoldQuote {
  return { quoteKind: 'spot', sourceUnit: 'usd-per-troy-ounce', spot, sourceTimestamp };
}

function createHistory(
  previous: ReadonlyMap<string, StoredGoldQuote> = new Map(),
): GoldPriceHistoryLike & { record: ReturnType<typeof vi.fn> } {
  return {
    record: vi.fn(async () => previous),
  };
}

function fourAdapters(overrides?: {
  sjc?: GoldPriceAdapter['fetch'];
  doji?: GoldPriceAdapter['fetch'];
  pnj?: GoldPriceAdapter['fetch'];
  xau?: GoldPriceAdapter['fetch'];
}): GoldPriceAdapter[] {
  return [
    adapter(sjcSource, overrides?.sjc ?? (async () => buySellQuote('thousand-vnd-per-tael', 143000, 146000))),
    adapter(dojiSource, overrides?.doji ?? (async () => buySellQuote('thousand-vnd-per-chi', 14300, 14600))),
    adapter(pnjSource, overrides?.pnj ?? (async () => buySellQuote('vnd-per-chi', 14_300_000, 14_600_000))),
    adapter(xauSource, overrides?.xau ?? (async () => spotQuote(2400))),
  ];
}

function createService(
  adapters: readonly GoldPriceAdapter[],
  history: GoldPriceHistoryLike = createHistory(),
  now: () => Date = () => COLLECTED_AT,
): GoldPriceService {
  return new GoldPriceService(adapters, history, MAX_AGE_MINUTES, MAX_FUTURE_SKEW_MS, now);
}

function expectUnavailable(quote: GoldQuote, providerKey: string, failureReason: GoldQuoteFailureCode): void {
  expect(quote).toMatchObject({
    providerKey,
    status: 'unavailable',
    collectedAt: COLLECTED_AT.toISOString(),
    failureReason,
  });
  expect(quote).not.toHaveProperty('buy');
  expect(quote).not.toHaveProperty('sell');
  expect(quote).not.toHaveProperty('spot');
  expect(quote).not.toHaveProperty('sourceUnit');
  expect(quote).not.toHaveProperty('sourceTimestamp');
}

describe('GoldPriceService', () => {
  it('collects adapters in order, isolates a rejected provider, and records one history batch', async () => {
    const history = createHistory();
    const service = createService(
      fourAdapters({
        doji: async () => {
          throw new GoldPriceAdapterError('fetch-failed');
        },
      }),
      history,
    );

    const snapshot = await service.collect();

    expect(snapshot.collectedAt).toBe(COLLECTED_AT.toISOString());
    expect(snapshot.quotes.map((quote) => quote.providerKey)).toEqual([
      'sjc',
      'doji',
      'pnj',
      'xau-usd',
    ]);
    expect(snapshot.successfulProviderCount).toBe(3);
    expect(snapshot.failedSources).toEqual(['doji']);
    expectUnavailable(snapshot.quotes[1], 'doji', 'fetch-failed');
    expect(history.record).toHaveBeenCalledTimes(1);

    const recorded = history.record.mock.calls[0]?.[0] as NormalizedGoldObservation[];
    expect(recorded.map((observation) => observation.providerKey)).toEqual(['sjc', 'pnj', 'xau-usd']);
    expect(recorded.every((observation) => observation.collectedAt === COLLECTED_AT.toISOString())).toBe(true);
    expect(recorded[0]).toMatchObject({ quoteKind: 'buy-sell', buy: 143, sell: 146 });
    expect(recorded[1]).toMatchObject({ quoteKind: 'buy-sell', buy: 143, sell: 146 });
    expect(recorded[2]).toMatchObject({ quoteKind: 'spot', spot: 2400 });
  });

  it('captures the injected clock exactly once so every row shares collectedAt', async () => {
    const now = vi.fn(() => COLLECTED_AT);
    const snapshot = await createService(fourAdapters(), createHistory(), now).collect();
    expect(now).toHaveBeenCalledTimes(1);
    expect(new Set(snapshot.quotes.map((quote) => quote.collectedAt))).toEqual(new Set([COLLECTED_AT.toISOString()]));
  });

  it('keeps remaining quotes when every other provider fails', async () => {
    const history = createHistory();
    const snapshot = await createService(
      fourAdapters({
        sjc: async () => {
          throw new Error('sjc transport secret=/etc/passwd');
        },
        doji: async () => {
          throw new GoldPriceAdapterError('invalid-payload');
        },
        pnj: async () => {
          throw new GoldPriceAdapterError('ambiguous-unit');
        },
      }),
      history,
    ).collect();

    expect(snapshot.successfulProviderCount).toBe(1);
    expect(snapshot.failedSources).toEqual(['sjc', 'doji', 'pnj']);
    expect(snapshot.quotes[3]).toMatchObject({ status: 'fresh', spot: 2400 });
    expect(history.record).toHaveBeenCalledTimes(1);
    expect((history.record.mock.calls[0]?.[0] as NormalizedGoldObservation[]).map((row) => row.providerKey)).toEqual([
      'xau-usd',
    ]);
  });

  it('reports all failed sources without numeric quotes when every adapter rejects', async () => {
    const history = createHistory();
    const snapshot = await createService(
      fourAdapters({
        sjc: async () => {
          throw new Error('offline');
        },
        doji: async () => {
          throw new Error('offline');
        },
        pnj: async () => {
          throw new Error('offline');
        },
        xau: async () => {
          throw new Error('offline');
        },
      }),
      history,
    ).collect();

    expect(snapshot.successfulProviderCount).toBe(0);
    expect(snapshot.failedSources).toEqual(['sjc', 'doji', 'pnj', 'xau-usd']);
    for (const quote of snapshot.quotes) {
      expectUnavailable(quote, quote.providerKey, 'fetch-failed');
    }
    expect(history.record).toHaveBeenCalledTimes(1);
    expect(history.record.mock.calls[0]?.[0]).toEqual([]);
  });

  it('marks the first observation as no-previous-quote', async () => {
    const snapshot = await createService(fourAdapters({
      doji: async () => {
        throw new GoldPriceAdapterError('fetch-failed');
      },
    })).collect();

    expect(snapshot.quotes[0]).toMatchObject({
      status: 'fresh',
      movement: { status: 'not-available', reason: 'no-previous-quote' },
    });
    expect(snapshot.quotes[3]).toMatchObject({
      status: 'fresh',
      movement: { status: 'not-available', reason: 'no-previous-quote' },
    });
  });

  it('computes buy/sell/spot deltas in display units from previous history', async () => {
    const history = createHistory(
      new Map<string, StoredGoldQuote>([
        [
          'sjc:sjc-1l:buy-sell',
          {
            ...sjcSource,
            sourceUnit: 'thousand-vnd-per-tael',
            sourceTimestamp: '2026-08-20T03:00:00.000Z',
            quoteKind: 'buy-sell',
            buy: 140,
            sell: 144,
            recordedAt: '2026-08-20T03:05:00.000Z',
          },
        ],
        [
          'xau-usd:xau-usd-spot:spot',
          {
            ...xauSource,
            sourceUnit: 'usd-per-troy-ounce',
            sourceTimestamp: '2026-08-20T03:00:00.000Z',
            quoteKind: 'spot',
            spot: 2390,
            recordedAt: '2026-08-20T03:05:00.000Z',
          },
        ],
      ]),
    );

    const snapshot = await createService(
      fourAdapters({
        doji: async () => {
          throw new GoldPriceAdapterError('fetch-failed');
        },
      }),
      history,
    ).collect();

    expect(snapshot.quotes[0]).toMatchObject({
      quoteKind: 'buy-sell',
      buy: 143,
      sell: 146,
      movement: {
        status: 'available',
        previousSourceTimestamp: '2026-08-20T03:00:00.000Z',
        buyDelta: 3,
        sellDelta: 2,
      },
    });
    expect(snapshot.quotes[3]).toMatchObject({
      quoteKind: 'spot',
      spot: 2400,
      movement: {
        status: 'available',
        previousSourceTimestamp: '2026-08-20T03:00:00.000Z',
        spotDelta: 10,
      },
    });
  });

  it.each([
    ['thousand-vnd-per-tael', 143000, 146000, 143, 146],
    ['thousand-vnd-per-chi', 14300, 14600, 143, 146],
    ['vnd-per-tael', 143_000_000, 146_000_000, 143, 146],
    ['vnd-per-chi', 14_300_000, 14_600_000, 143, 146],
  ] as const)(
    'converts %s into million-vnd-per-tael',
    async (sourceUnit, buy, sell, expectedBuy, expectedSell) => {
      const history = createHistory();
      const snapshot = await createService(
        [adapter(sjcSource, async () => buySellQuote(sourceUnit, buy, sell))],
        history,
      ).collect();

      expect(snapshot.quotes[0]).toMatchObject({
        status: 'fresh',
        displayUnit: 'million-vnd-per-tael',
        sourceUnit,
        quoteKind: 'buy-sell',
        buy: expectedBuy,
        sell: expectedSell,
      });
      const recorded = history.record.mock.calls[0]?.[0] as NormalizedGoldObservation[];
      expect(recorded[0]).toMatchObject({ buy: expectedBuy, sell: expectedSell, sourceUnit });
    },
  );

  it('keeps a quote fresh when age equals maxAge and stale when age is greater', async () => {
    const boundary = await createService(
      [adapter(sjcSource, async () => buySellQuote('thousand-vnd-per-tael', 143000, 146000, '2026-08-20T03:00:00.000Z'))],
    ).collect();
    expect(boundary.quotes[0]?.status).toBe('fresh');

    const stale = await createService(
      [adapter(sjcSource, async () => buySellQuote('thousand-vnd-per-tael', 143000, 146000, '2026-08-20T02:59:59.999Z'))],
    ).collect();
    expect(stale.quotes[0]?.status).toBe('stale');
    expect(stale.successfulProviderCount).toBe(1);
  });

  it('records a stale but valid quote and counts it as successful', async () => {
    const history = createHistory();
    const snapshot = await createService(
      [adapter(sjcSource, async () => buySellQuote('thousand-vnd-per-tael', 143000, 146000, '2026-08-20T02:59:59.999Z'))],
      history,
    ).collect();

    expect(snapshot.quotes[0]).toMatchObject({ status: 'stale', buy: 143, sell: 146 });
    expect(snapshot.successfulProviderCount).toBe(1);
    expect(snapshot.failedSources).toEqual([]);
    expect((history.record.mock.calls[0]?.[0] as NormalizedGoldObservation[])[0]?.status).toBe('stale');
  });

  it('accepts a source timestamp exactly five minutes in the future and rejects one millisecond beyond', async () => {
    const exact = new Date(COLLECTED_AT.getTime() + MAX_FUTURE_SKEW_MS).toISOString();
    const beyond = new Date(COLLECTED_AT.getTime() + MAX_FUTURE_SKEW_MS + 1).toISOString();

    const accepted = await createService(
      [adapter(sjcSource, async () => buySellQuote('thousand-vnd-per-tael', 143000, 146000, exact))],
    ).collect();
    expect(accepted.quotes[0]?.status).toBe('fresh');
    expect(accepted.successfulProviderCount).toBe(1);

    const rejected = await createService(
      [adapter(sjcSource, async () => buySellQuote('thousand-vnd-per-tael', 143000, 146000, beyond))],
    ).collect();
    expectUnavailable(rejected.quotes[0], 'sjc', 'invalid-timestamp');
    expect(rejected.successfulProviderCount).toBe(0);
    expect(rejected.failedSources).toEqual(['sjc']);
  });

  it('rejects an impossible Vietnamese date such as 31/02', async () => {
    const history = createHistory();
    const snapshot = await createService(
      [adapter(sjcSource, async () => buySellQuote('thousand-vnd-per-tael', 143000, 146000, '31/02/2026 10:32:28'))],
      history,
    ).collect();

    expectUnavailable(snapshot.quotes[0], 'sjc', 'invalid-timestamp');
    expect(snapshot.failedSources).toEqual(['sjc']);
    expect(history.record.mock.calls[0]?.[0]).toEqual([]);
  });

  it('reports unit-mismatch rather than a numeric delta when the stored source unit differs', async () => {
    const history = createHistory(
      new Map([
        [
          'sjc:sjc-1l:buy-sell',
          {
            ...sjcSource,
            sourceUnit: 'vnd-per-tael' as const,
            sourceTimestamp: '2026-08-20T03:00:00.000Z',
            quoteKind: 'buy-sell' as const,
            buy: 143,
            sell: 146,
            recordedAt: '2026-08-20T03:05:00.000Z',
          },
        ],
      ]),
    );

    const snapshot = await createService(
      [adapter(sjcSource, async () => buySellQuote('thousand-vnd-per-tael', 143000, 146000))],
      history,
    ).collect();

    expect(snapshot.quotes[0]).toMatchObject({
      status: 'fresh',
      buy: 143,
      movement: { status: 'not-available', reason: 'unit-mismatch' },
    });
    expect(snapshot.quotes[0]).not.toMatchObject({ movement: { buyDelta: expect.anything() } });
  });

  it('reports source-regression when the observation is older than the stored baseline', async () => {
    const history = createHistory(
      new Map([
        [
          'sjc:sjc-1l:buy-sell',
          {
            ...sjcSource,
            sourceUnit: 'thousand-vnd-per-tael' as const,
            sourceTimestamp: '2026-08-20T03:40:00.000Z',
            quoteKind: 'buy-sell' as const,
            buy: 150,
            sell: 154,
            recordedAt: '2026-08-20T03:45:00.000Z',
          },
        ],
      ]),
    );

    const snapshot = await createService(
      [adapter(sjcSource, async () => buySellQuote('thousand-vnd-per-tael', 143000, 146000, '2026-08-20T03:10:00.000Z'))],
      history,
    ).collect();

    expect(snapshot.quotes[0]).toMatchObject({
      buy: 143,
      movement: { status: 'not-available', reason: 'source-regression' },
    });
  });

  it('prefers source-regression over unit-mismatch when both apply', async () => {
    const history = createHistory(
      new Map([
        [
          'sjc:sjc-1l:buy-sell',
          {
            ...sjcSource,
            sourceUnit: 'vnd-per-chi' as const,
            sourceTimestamp: '2026-08-20T03:40:00.000Z',
            quoteKind: 'buy-sell' as const,
            buy: 150,
            sell: 154,
            recordedAt: '2026-08-20T03:45:00.000Z',
          },
        ],
      ]),
    );

    const snapshot = await createService(
      [adapter(sjcSource, async () => buySellQuote('thousand-vnd-per-tael', 143000, 146000, '2026-08-20T03:10:00.000Z'))],
      history,
    ).collect();

    expect(snapshot.quotes[0]).toMatchObject({
      movement: { status: 'not-available', reason: 'source-regression' },
    });
  });

  it.each([
    ['ambiguous-unit', new GoldPriceAdapterError('ambiguous-unit'), 'ambiguous-unit'],
    ['invalid-timestamp', new GoldPriceAdapterError('invalid-timestamp'), 'invalid-timestamp'],
    ['invalid-payload', new GoldPriceAdapterError('invalid-payload'), 'invalid-payload'],
    ['unknown transport', new Error('ECONNRESET api_key=super-secret-token'), 'fetch-failed'],
  ] as const)(
    'maps %s to a typed failure without using the raw message as a source key',
    async (_label, error, failureReason) => {
      const snapshot = await createService([
        adapter(sjcSource, async () => {
          throw error;
        }),
      ]).collect();

      expectUnavailable(snapshot.quotes[0], 'sjc', failureReason);
      expect(snapshot.failedSources).toEqual(['sjc']);
      expect(JSON.stringify(snapshot)).not.toContain('super-secret-token');
      expect(JSON.stringify(snapshot)).not.toContain('ECONNRESET');
      expect(JSON.stringify(snapshot.failedSources)).not.toContain(String(error));
    },
  );

  it('keeps valid prices and attaches history-unavailable when history fails', async () => {
    const history: GoldPriceHistoryLike = {
      record: vi.fn(async () => {
        throw new Error('EACCES: permission denied, open \'/var/lib/gold/secret.json\'');
      }),
    };
    const snapshot = await createService(
      fourAdapters({
        doji: async () => {
          throw new GoldPriceAdapterError('fetch-failed');
        },
      }),
      history,
    ).collect();

    expect(snapshot.successfulProviderCount).toBe(3);
    expect(snapshot.failedSources).toEqual(['doji', 'gold-price-history']);
    expect(snapshot.quotes[0]).toMatchObject({
      status: 'fresh',
      buy: 143,
      sell: 146,
      movement: { status: 'not-available', reason: 'history-unavailable' },
    });
    expect(snapshot.quotes[3]).toMatchObject({
      status: 'fresh',
      spot: 2400,
      movement: { status: 'not-available', reason: 'history-unavailable' },
    });
    expectUnavailable(snapshot.quotes[1], 'doji', 'fetch-failed');
    expect(JSON.stringify(snapshot)).not.toContain('EACCES');
    expect(JSON.stringify(snapshot)).not.toContain('secret.json');
    expect(JSON.stringify(snapshot)).not.toContain('/var/lib/gold');
  });
});
