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
      if (stored && isStrictlyOlder(observation.sourceTimestamp, stored.sourceTimestamp)) {
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

function isStrictlyOlder(candidate: string, stored: string): boolean {
  const incoming = Date.parse(candidate);
  const baseline = Date.parse(stored);
  if (!Number.isFinite(incoming) || !Number.isFinite(baseline)) return false;
  return incoming < baseline;
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
