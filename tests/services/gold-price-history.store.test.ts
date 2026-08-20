import { inspect } from 'node:util';
import {
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GoldPriceHistoryStore,
  GoldPriceHistoryStoreError,
} from '../../src/services/gold-price-history.store';
import type { NormalizedGoldObservation, StoredGoldQuote } from '../../src/types/gold-politics';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
    writeFile: vi.fn(actual.writeFile),
    rename: vi.fn(actual.rename),
  };
});

const NOW = new Date('2026-08-20T04:00:00.000Z');

const sjcSource = {
  providerKey: 'sjc' as const,
  providerName: 'SJC',
  instrumentKey: 'sjc-1l',
  instrumentName: 'SJC 1 lượng',
  sourceUrl: 'https://www.sjc.com.vn/bieu-do-gia-vang',
  displayUnit: 'million-vnd-per-tael' as const,
};

const dojiSource = {
  providerKey: 'doji' as const,
  providerName: 'DOJI',
  instrumentKey: 'doji-sjc-bar',
  instrumentName: 'VÀNG MIẾNG SJC',
  sourceUrl: 'https://banggia.doji.vn/',
  displayUnit: 'million-vnd-per-tael' as const,
};

const xauSource = {
  providerKey: 'xau-usd' as const,
  providerName: 'Gold API',
  instrumentKey: 'xau-usd-spot',
  instrumentName: 'XAU/USD',
  sourceUrl: 'https://api.gold-api.com/',
  displayUnit: 'usd-per-troy-ounce' as const,
};

function buySellObservation(
  overrides: Partial<NormalizedGoldObservation> = {},
): NormalizedGoldObservation {
  return {
    ...sjcSource,
    status: 'fresh',
    collectedAt: NOW.toISOString(),
    sourceUnit: 'thousand-vnd-per-tael',
    sourceTimestamp: '2026-08-20T03:32:28.000Z',
    quoteKind: 'buy-sell',
    buy: 143,
    sell: 146,
    ...overrides,
  };
}

function spotObservation(
  overrides: Partial<Extract<NormalizedGoldObservation, { quoteKind: 'spot' }>> = {},
): Extract<NormalizedGoldObservation, { quoteKind: 'spot' }> {
  return {
    ...xauSource,
    status: 'fresh',
    collectedAt: NOW.toISOString(),
    sourceUnit: 'usd-per-troy-ounce',
    sourceTimestamp: '2026-08-20T03:45:00.000Z',
    quoteKind: 'spot',
    spot: 2400,
    ...overrides,
  };
}

function expectStableStoreError(error: unknown): void {
  expect(error).toMatchObject({
    name: 'GoldPriceHistoryStoreError',
    message: 'gold-price-history',
  });
  expect(error).toBeInstanceOf(GoldPriceHistoryStoreError);
  const serialized = [
    String(error),
    (error as Error).message,
    (error as Error).stack ?? '',
    JSON.stringify(error),
    inspect(error, { depth: 8, showHidden: true }),
  ].join('\n');
  expect(serialized).not.toMatch(/ENOSPC|EACCES|EPERM|secret|payload\.json|no space|permission denied/i);
  expect(serialized).not.toMatch(/\/var\/|\/etc\/|credentials|filesystem/i);
}

describe('GoldPriceHistoryStore', () => {
  let directory: string;
  let historyPath: string;
  let store: GoldPriceHistoryStore;
  let actualFs: typeof import('node:fs/promises');

  beforeEach(async () => {
    actualFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(readFile).mockImplementation(actualFs.readFile);
    vi.mocked(writeFile).mockImplementation(actualFs.writeFile);
    vi.mocked(rename).mockImplementation(actualFs.rename);
    directory = await mkdtemp(join(tmpdir(), 'gold-price-history-'));
    historyPath = join(directory, 'history.json');
    store = new GoldPriceHistoryStore(historyPath, () => NOW);
  });

  afterEach(async () => {
    vi.mocked(readFile).mockReset();
    vi.mocked(writeFile).mockReset();
    vi.mocked(rename).mockReset();
    await rm(directory, { recursive: true, force: true });
  });

  it('treats a missing file as empty and records version 1 JSON', async () => {
    const previous = await store.record([buySellObservation()]);

    expect(previous.size).toBe(0);
    const document = JSON.parse(await readFile(historyPath, 'utf8')) as {
      version: number;
      quotes: Record<string, StoredGoldQuote>;
    };
    expect(document.version).toBe(1);
    expect(document.quotes['sjc:sjc-1l:buy-sell']).toMatchObject({
      providerKey: 'sjc',
      instrumentKey: 'sjc-1l',
      quoteKind: 'buy-sell',
      sourceUnit: 'thousand-vnd-per-tael',
      buy: 143,
      sell: 146,
      sourceTimestamp: '2026-08-20T03:32:28.000Z',
      recordedAt: NOW.toISOString(),
    });
  });

  it('loads once, merges all valid identities, saves once through same-directory temp + rename, and returns previous values', async () => {
    const doji = buySellObservation({
      ...dojiSource,
      sourceUnit: 'thousand-vnd-per-chi',
      buy: 143,
      sell: 146,
    });
    const firstPrevious = await store.record([buySellObservation(), doji, spotObservation()]);
    expect(firstPrevious.size).toBe(0);

    const historyReads = vi.mocked(readFile).mock.calls.filter((call) => String(call[0]) === historyPath);
    expect(historyReads).toHaveLength(1);
    expect(vi.mocked(writeFile)).toHaveBeenCalledTimes(1);
    const temporaryPath = String(vi.mocked(writeFile).mock.calls[0]?.[0]);
    expect(dirname(temporaryPath)).toBe(directory);
    expect(temporaryPath).not.toBe(historyPath);
    expect(temporaryPath).toContain('.tmp-');
    expect(vi.mocked(rename)).toHaveBeenCalledWith(temporaryPath, historyPath);

    const secondPrevious = await store.record([
      buySellObservation({ buy: 150, sell: 154, sourceTimestamp: '2026-08-20T03:40:00.000Z' }),
    ]);
    expect(secondPrevious.get('sjc:sjc-1l:buy-sell')).toMatchObject({ buy: 143, sell: 146 });
    expect(secondPrevious.get('doji:doji-sjc-bar:buy-sell')).toMatchObject({ buy: 143, sell: 146 });
    expect(secondPrevious.get('xau-usd:xau-usd-spot:spot')).toMatchObject({ spot: 2400 });

    const document = JSON.parse(await readFile(historyPath, 'utf8')) as {
      quotes: Record<string, StoredGoldQuote>;
    };
    expect(Object.keys(document.quotes).sort()).toEqual([
      'doji:doji-sjc-bar:buy-sell',
      'sjc:sjc-1l:buy-sell',
      'xau-usd:xau-usd-spot:spot',
    ]);
    expect(document.quotes['sjc:sjc-1l:buy-sell']).toMatchObject({ buy: 150, sell: 154 });
  });

  it('keys records by provider, instrument, and quote kind while retaining source unit', async () => {
    await store.record([
      buySellObservation(),
      buySellObservation({
        ...dojiSource,
        sourceUnit: 'thousand-vnd-per-chi',
      }),
    ]);

    const document = JSON.parse(await readFile(historyPath, 'utf8')) as {
      quotes: Record<string, StoredGoldQuote>;
    };
    expect(document.quotes['sjc:sjc-1l:buy-sell']?.sourceUnit).toBe('thousand-vnd-per-tael');
    expect(document.quotes['doji:doji-sjc-bar:buy-sell']?.sourceUnit).toBe('thousand-vnd-per-chi');
    expect(document.quotes['sjc:sjc-1l:thousand-vnd-per-tael']).toBeUndefined();
  });

  it('never stores unavailable quotes', async () => {
    const unavailable = {
      ...sjcSource,
      status: 'unavailable',
      collectedAt: NOW.toISOString(),
      failureReason: 'fetch-failed',
    } as unknown as NormalizedGoldObservation;

    const previous = await store.record([unavailable, spotObservation()]);
    expect(previous.size).toBe(0);

    const document = JSON.parse(await readFile(historyPath, 'utf8')) as {
      quotes: Record<string, StoredGoldQuote>;
    };
    expect(Object.keys(document.quotes)).toEqual(['xau-usd:xau-usd-spot:spot']);
    expect(JSON.stringify(document)).not.toContain('unavailable');
    expect(JSON.stringify(document)).not.toContain('fetch-failed');
  });

  it('never overwrites a newer stored quote with an older source timestamp', async () => {
    await store.record([
      buySellObservation({
        buy: 150,
        sell: 154,
        sourceTimestamp: '2026-08-20T03:40:00.000Z',
      }),
    ]);

    const previous = await store.record([
      buySellObservation({
        buy: 100,
        sell: 110,
        sourceTimestamp: '2026-08-20T03:10:00.000Z',
      }),
    ]);

    expect(previous.get('sjc:sjc-1l:buy-sell')).toMatchObject({
      buy: 150,
      sell: 154,
      sourceTimestamp: '2026-08-20T03:40:00.000Z',
    });
    const document = JSON.parse(await readFile(historyPath, 'utf8')) as {
      quotes: Record<string, StoredGoldQuote>;
    };
    expect(document.quotes['sjc:sjc-1l:buy-sell']).toMatchObject({
      buy: 150,
      sell: 154,
      sourceTimestamp: '2026-08-20T03:40:00.000Z',
    });
  });

  it('keeps the stored unit when an observation is incompatible so later movement is unit-mismatch, not a numeric delta', async () => {
    await store.record([buySellObservation({ sourceUnit: 'thousand-vnd-per-tael', buy: 143, sell: 146 })]);

    const previous = await store.record([
      buySellObservation({
        sourceUnit: 'vnd-per-tael',
        buy: 143,
        sell: 146,
        sourceTimestamp: '2026-08-20T03:50:00.000Z',
      }),
    ]);

    expect(previous.get('sjc:sjc-1l:buy-sell')).toMatchObject({
      sourceUnit: 'thousand-vnd-per-tael',
      buy: 143,
      sell: 146,
    });
    const document = JSON.parse(await readFile(historyPath, 'utf8')) as {
      quotes: Record<string, StoredGoldQuote>;
    };
    expect(document.quotes['sjc:sjc-1l:buy-sell']).toMatchObject({
      sourceUnit: 'vnd-per-tael',
      buy: 143,
      sell: 146,
      sourceTimestamp: '2026-08-20T03:50:00.000Z',
    });
  });

  it('lets source-timestamp regression win persistence even when the unit also differs', async () => {
    await store.record([
      buySellObservation({
        sourceUnit: 'thousand-vnd-per-tael',
        buy: 150,
        sell: 154,
        sourceTimestamp: '2026-08-20T03:40:00.000Z',
      }),
    ]);

    const previous = await store.record([
      buySellObservation({
        sourceUnit: 'vnd-per-chi',
        buy: 100,
        sell: 110,
        sourceTimestamp: '2026-08-20T03:10:00.000Z',
      }),
    ]);

    expect(previous.get('sjc:sjc-1l:buy-sell')).toMatchObject({
      sourceUnit: 'thousand-vnd-per-tael',
      buy: 150,
      sourceTimestamp: '2026-08-20T03:40:00.000Z',
    });
    const document = JSON.parse(await readFile(historyPath, 'utf8')) as {
      quotes: Record<string, StoredGoldQuote>;
    };
    expect(document.quotes['sjc:sjc-1l:buy-sell']).toMatchObject({
      sourceUnit: 'thousand-vnd-per-tael',
      buy: 150,
      sell: 154,
      sourceTimestamp: '2026-08-20T03:40:00.000Z',
    });
  });

  it('establishes a new unit baseline only when the source timestamp is equal or newer', async () => {
    await store.record([
      buySellObservation({
        sourceUnit: 'thousand-vnd-per-tael',
        sourceTimestamp: '2026-08-20T03:32:28.000Z',
      }),
    ]);

    await store.record([
      buySellObservation({
        sourceUnit: 'thousand-vnd-per-chi',
        buy: 144,
        sell: 147,
        sourceTimestamp: '2026-08-20T03:32:28.000Z',
      }),
    ]);

    const document = JSON.parse(await readFile(historyPath, 'utf8')) as {
      quotes: Record<string, StoredGoldQuote>;
    };
    expect(document.quotes['sjc:sjc-1l:buy-sell']).toMatchObject({
      sourceUnit: 'thousand-vnd-per-chi',
      buy: 144,
      sell: 147,
      sourceTimestamp: '2026-08-20T03:32:28.000Z',
    });
  });

  it('quarantines corrupt JSON and recovers as empty', async () => {
    await writeFile(historyPath, '{broken');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const previous = await store.record([buySellObservation()]);
      expect(previous.size).toBe(0);
    } finally {
      warn.mockRestore();
    }

    const names = await readdir(directory);
    expect(names.some((name) => name.startsWith('history.json.corrupt-'))).toBe(true);
    expect(JSON.parse(await readFile(historyPath, 'utf8')).version).toBe(1);
  });

  it('quarantines unsupported schema versions and recovers as empty', async () => {
    await writeFile(historyPath, JSON.stringify({ version: 2, quotes: { 'sjc:sjc-1l:buy-sell': { buy: 1 } } }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const previous = await store.record([buySellObservation()]);
      expect(previous.size).toBe(0);
    } finally {
      warn.mockRestore();
    }

    expect((await readdir(directory)).some((name) => name.startsWith('history.json.corrupt-'))).toBe(true);
    expect(JSON.parse(await readFile(historyPath, 'utf8')).quotes['sjc:sjc-1l:buy-sell']).toMatchObject({
      buy: 143,
    });
  });

  it('leaves no .tmp-* file after a successful save', async () => {
    await store.record([buySellObservation()]);
    expect(await readdir(directory)).toEqual(['history.json']);
  });

  it('cleans up the same-directory temp file after a write failure and lets the next record succeed', async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(
      Object.assign(new Error('ENOSPC: no space left on device, write \'/secret/payload.json\''), {
        code: 'ENOSPC',
      }),
    );

    const error = await store.record([buySellObservation({ buy: 100, sell: 110 })]).catch((reason) => reason);
    expectStableStoreError(error);
    expect((await readdir(directory)).filter((name) => name.includes('.tmp'))).toEqual([]);

    const previous = await store.record([buySellObservation({ buy: 200, sell: 210 })]);
    expect(previous.size).toBe(0);
    expect(JSON.parse(await readFile(historyPath, 'utf8')).quotes['sjc:sjc-1l:buy-sell']).toMatchObject({
      buy: 200,
      sell: 210,
    });
  });

  it('cleans up the temp file after a rename failure', async () => {
    vi.mocked(rename).mockImplementation(async (from, to, ...rest) => {
      if (String(to) === historyPath) {
        throw Object.assign(new Error("EACCES: permission denied, rename '/secret/payload.json'"), {
          code: 'EACCES',
        });
      }
      return actualFs.rename(from, to, ...rest);
    });

    const error = await store.record([buySellObservation()]).catch((reason) => reason);
    expectStableStoreError(error);
    expect((await readdir(directory)).filter((name) => name.includes('.tmp'))).toEqual([]);
  });

  it('commits overlapping records in invocation order', async () => {
    const first = buySellObservation({
      buy: 100,
      sell: 110,
      sourceTimestamp: '2026-08-20T03:00:00.000Z',
    });
    const second = buySellObservation({
      buy: 200,
      sell: 210,
      sourceTimestamp: '2026-08-20T03:30:00.000Z',
    });

    const firstPromise = store.record([first]);
    const secondPromise = store.record([second]);
    const [previousFirst, previousSecond] = await Promise.all([firstPromise, secondPromise]);

    expect(previousFirst.size).toBe(0);
    expect(previousSecond.get('sjc:sjc-1l:buy-sell')).toMatchObject({ buy: 100, sell: 110 });
    expect(JSON.parse(await readFile(historyPath, 'utf8')).quotes['sjc:sjc-1l:buy-sell']).toMatchObject({
      buy: 200,
      sell: 210,
    });
  });

  it('lets a queued second record load the latest durable file after the first operation is rejected', async () => {
    await store.record([buySellObservation({ buy: 100, sell: 110 })]);

    let durableRenames = 0;
    vi.mocked(rename).mockImplementation(async (from, to, ...rest) => {
      if (String(to) === historyPath) {
        durableRenames += 1;
        if (durableRenames === 1) {
          throw Object.assign(new Error("EACCES: permission denied, rename '/secret/payload.json'"), {
            code: 'EACCES',
          });
        }
      }
      return actualFs.rename(from, to, ...rest);
    });

    const failing = store.record([buySellObservation({ buy: 999, sell: 1000, sourceTimestamp: '2026-08-20T03:50:00.000Z' })]);
    const queued = store.record([buySellObservation({ buy: 200, sell: 210, sourceTimestamp: '2026-08-20T03:55:00.000Z' })]);

    expectStableStoreError(await failing.catch((reason) => reason));
    const previous = await queued;
    expect(previous.get('sjc:sjc-1l:buy-sell')).toMatchObject({ buy: 100, sell: 110 });
    expect(JSON.parse(await readFile(historyPath, 'utf8')).quotes['sjc:sjc-1l:buy-sell']).toMatchObject({
      buy: 200,
      sell: 210,
    });
  });
});
