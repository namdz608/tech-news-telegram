/** Lưu báo giá vàng gần nhất bằng JSON versioned và atomic rename. */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { env } from '../config/env';
import type {
  NormalizedGoldObservation,
  StoredGoldQuote,
} from '../types/gold-politics';

interface HistoryDocument {
  version: 1;
  quotes: Record<string, StoredGoldQuote>;
}

export class GoldPriceHistoryStoreError extends Error {
  constructor() {
    super('gold-price-history');
    this.name = 'GoldPriceHistoryStoreError';
  }
}

export interface GoldPriceHistoryLike {
  record(
    observations: readonly NormalizedGoldObservation[],
  ): Promise<ReadonlyMap<string, StoredGoldQuote>>;
}

export class GoldPriceHistoryStore implements GoldPriceHistoryLike {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath = env.GOLD_PRICE_HISTORY_PATH,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async record(
    observations: readonly NormalizedGoldObservation[],
  ): Promise<ReadonlyMap<string, StoredGoldQuote>> {
    const operation = this.writeQueue.then(() => this.recordExclusive(observations));
    this.writeQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async recordExclusive(
    observations: readonly NormalizedGoldObservation[],
  ): Promise<ReadonlyMap<string, StoredGoldQuote>> {
    const document = await this.load();
    const previous = new Map(Object.entries(document.quotes));
    const recordedAt = this.now().toISOString();

    for (const observation of observations) {
      if (!isPersistableObservation(observation)) continue;
      const key = historyKey(observation);
      const stored = previous.get(key);
      if (stored && isGoldSourceTimestampStrictlyOlder(observation.sourceTimestamp, stored.sourceTimestamp)) {
        continue;
      }
      document.quotes[key] = toStoredQuote(observation, recordedAt);
    }

    await this.save(document);
    return previous;
  }

  private async load(): Promise<HistoryDocument> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!isHistoryDocument(parsed)) throw new Error('Invalid gold price history schema');
      return parsed;
    } catch (error) {
      if (isMissingFile(error)) return { version: 1, quotes: {} };

      try {
        await mkdir(dirname(this.filePath), { recursive: true });
        const corruptPath = `${this.filePath}.corrupt-${this.now().toISOString().replace(/[:.]/g, '-')}`;
        await rename(this.filePath, corruptPath);
        console.warn(`Invalid gold price history moved to ${corruptPath}`);
      } catch {
        throw new GoldPriceHistoryStoreError();
      }
      return { version: 1, quotes: {} };
    }
  }

  private async save(document: HistoryDocument): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
      await rename(temporaryPath, this.filePath);
    } catch {
      throw new GoldPriceHistoryStoreError();
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
}

export function goldPriceHistoryKey(observation: {
  providerKey: string;
  instrumentKey: string;
  quoteKind: string;
}): string {
  return `${observation.providerKey}:${observation.instrumentKey}:${observation.quoteKind}`;
}

function historyKey(observation: {
  providerKey: string;
  instrumentKey: string;
  quoteKind: string;
}): string {
  return goldPriceHistoryKey(observation);
}

function isPersistableObservation(
  observation: NormalizedGoldObservation,
): observation is NormalizedGoldObservation {
  if ((observation as { status?: unknown }).status === 'unavailable') return false;
  if (observation.quoteKind === 'buy-sell') {
    return Number.isFinite(observation.buy) && Number.isFinite(observation.sell);
  }
  if (observation.quoteKind === 'spot') {
    return Number.isFinite(observation.spot);
  }
  return false;
}

function toStoredQuote(observation: NormalizedGoldObservation, recordedAt: string): StoredGoldQuote {
  if (observation.quoteKind === 'spot') {
    return {
      providerKey: observation.providerKey,
      providerName: observation.providerName,
      instrumentKey: observation.instrumentKey,
      instrumentName: observation.instrumentName,
      sourceUrl: observation.sourceUrl,
      displayUnit: observation.displayUnit,
      sourceUnit: observation.sourceUnit,
      sourceTimestamp: observation.sourceTimestamp,
      quoteKind: 'spot',
      spot: observation.spot,
      recordedAt,
    };
  }
  return {
    providerKey: observation.providerKey,
    providerName: observation.providerName,
    instrumentKey: observation.instrumentKey,
    instrumentName: observation.instrumentName,
    sourceUrl: observation.sourceUrl,
    displayUnit: observation.displayUnit,
    sourceUnit: observation.sourceUnit,
    sourceTimestamp: observation.sourceTimestamp,
    quoteKind: 'buy-sell',
    buy: observation.buy,
    sell: observation.sell,
    recordedAt,
  };
}

export function isGoldSourceTimestampStrictlyOlder(candidate: string, stored: string): boolean {
  const incoming = parseGoldSourceTimestamp(candidate);
  const baseline = parseGoldSourceTimestamp(stored);
  if (incoming === undefined || baseline === undefined) return false;
  return incoming < baseline;
}

export function parseGoldSourceTimestamp(value: string): number | undefined {
  const vietnam = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (vietnam) {
    const day = Number(vietnam[1]);
    const month = Number(vietnam[2]);
    const year = Number(vietnam[3]);
    const hour = Number(vietnam[4]);
    const minute = Number(vietnam[5]);
    const second = Number(vietnam[6]);
    if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) {
      return undefined;
    }
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second) - 7 * 60 * 60 * 1000);
    const plus7 = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    if (
      plus7.getUTCFullYear() !== year
      || plus7.getUTCMonth() + 1 !== month
      || plus7.getUTCDate() !== day
      || plus7.getUTCHours() !== hour
      || plus7.getUTCMinutes() !== minute
      || plus7.getUTCSeconds() !== second
    ) {
      return undefined;
    }
    return date.getTime();
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isHistoryDocument(value: unknown): value is HistoryDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { version?: unknown; quotes?: unknown };
  if (
    candidate.version !== 1
    || !candidate.quotes
    || typeof candidate.quotes !== 'object'
    || Array.isArray(candidate.quotes)
  ) {
    return false;
  }
  return Object.entries(candidate.quotes).every(
    ([key, quote]) => typeof key === 'string' && isStoredGoldQuote(quote),
  );
}

function isStoredGoldQuote(value: unknown): value is StoredGoldQuote {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.providerKey !== 'string'
    || typeof candidate.providerName !== 'string'
    || typeof candidate.instrumentKey !== 'string'
    || typeof candidate.instrumentName !== 'string'
    || typeof candidate.sourceUrl !== 'string'
    || typeof candidate.displayUnit !== 'string'
    || typeof candidate.sourceUnit !== 'string'
    || typeof candidate.sourceTimestamp !== 'string'
    || typeof candidate.recordedAt !== 'string'
  ) {
    return false;
  }
  if (candidate.quoteKind === 'buy-sell') {
    return Number.isFinite(candidate.buy) && Number.isFinite(candidate.sell);
  }
  if (candidate.quoteKind === 'spot') {
    return Number.isFinite(candidate.spot);
  }
  return false;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}
