/** Thu thập giá vàng từ mọi adapter, chuẩn hóa đơn vị và gắn biến động so với lịch sử. */
import { env } from '../config/env';
import {
  normalizeGoldPriceAdapterError,
  type BuySellMovement,
  type GoldMovementUnavailable,
  type GoldPriceAdapter,
  type GoldPriceSnapshot,
  type GoldQuote,
  type GoldSourceUnit,
  type NormalizedGoldObservation,
  type ParsedGoldQuote,
  type SpotMovement,
  type StoredGoldQuote,
} from '../types/gold-politics';
import { createGoldPriceAdapters } from './gold-price/adapters';
import {
  GoldPriceHistoryStore,
  goldPriceHistoryKey,
  type GoldPriceHistoryLike,
} from './gold-price-history.store';

const domesticToMillionVndPerTael: Record<Exclude<GoldSourceUnit, 'usd-per-troy-ounce'>, number> = {
  'thousand-vnd-per-tael': 0.001,
  'thousand-vnd-per-chi': 0.01,
  'vnd-per-tael': 0.000001,
  'vnd-per-chi': 0.00001,
};

const unavailableMovement: GoldMovementUnavailable = {
  status: 'not-available',
  reason: 'history-unavailable',
};

export class GoldPriceService {
  constructor(
    private readonly adapters: readonly GoldPriceAdapter[] = createGoldPriceAdapters(),
    private readonly history: GoldPriceHistoryLike = new GoldPriceHistoryStore(),
    private readonly maxAgeMinutes = env.GOLD_POLITICS_MAX_PRICE_AGE_MINUTES,
    private readonly maxFutureSkewMs = 5 * 60 * 1000,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async collect(): Promise<GoldPriceSnapshot> {
    const collectedAtDate = this.now();
    const collectedAt = collectedAtDate.toISOString();
    const settled = await Promise.allSettled(this.adapters.map((adapter) => adapter.fetch()));

    const failedSources: string[] = [];
    const observations: NormalizedGoldObservation[] = [];
    const pending: Array<
      | { kind: 'unavailable'; quote: Extract<GoldQuote, { status: 'unavailable' }> }
      | { kind: 'valid'; observation: NormalizedGoldObservation }
    > = [];

    this.adapters.forEach((adapter, index) => {
      const result = settled[index];
      if (!result || result.status === 'rejected') {
        const failureReason = normalizeGoldPriceAdapterError(result?.reason);
        failedSources.push(adapter.source.providerKey);
        pending.push({
          kind: 'unavailable',
          quote: {
            ...adapter.source,
            status: 'unavailable',
            collectedAt,
            failureReason,
          },
        });
        return;
      }

      const normalized = this.normalizeQuote(adapter, result.value, collectedAtDate);
      if (normalized.status === 'unavailable') {
        failedSources.push(adapter.source.providerKey);
        pending.push({ kind: 'unavailable', quote: normalized });
        return;
      }

      observations.push(normalized);
      pending.push({ kind: 'valid', observation: normalized });
    });

    let previous = new Map<string, StoredGoldQuote>();
    let historyUnavailable = false;
    try {
      previous = new Map(await this.history.record(observations));
    } catch {
      historyUnavailable = true;
      failedSources.push('gold-price-history');
    }

    const quotes = pending.map((entry) => {
      if (entry.kind === 'unavailable') return entry.quote;
      return attachMovement(entry.observation, previous, historyUnavailable);
    });

    return {
      collectedAt,
      quotes,
      successfulProviderCount: quotes.filter((quote) => quote.status === 'fresh' || quote.status === 'stale').length,
      failedSources,
    };
  }

  private normalizeQuote(
    adapter: GoldPriceAdapter,
    quote: ParsedGoldQuote,
    collectedAtDate: Date,
  ): NormalizedGoldObservation | Extract<GoldQuote, { status: 'unavailable' }> {
    const collectedAt = collectedAtDate.toISOString();
    const unavailable = (failureReason: 'invalid-timestamp' | 'invalid-payload') => ({
      ...adapter.source,
      status: 'unavailable' as const,
      collectedAt,
      failureReason,
    });

    const sourceMs = parseSourceTimestamp(quote.sourceTimestamp);
    if (sourceMs === undefined) return unavailable('invalid-timestamp');
    if (sourceMs > collectedAtDate.getTime() + this.maxFutureSkewMs) {
      return unavailable('invalid-timestamp');
    }

    const ageMs = collectedAtDate.getTime() - sourceMs;
    const status = ageMs > this.maxAgeMinutes * 60 * 1000 ? 'stale' : 'fresh';

    if (quote.quoteKind === 'spot') {
      if (quote.sourceUnit !== 'usd-per-troy-ounce' || !Number.isFinite(quote.spot)) {
        return unavailable('invalid-payload');
      }
      return {
        ...adapter.source,
        status,
        collectedAt,
        sourceUnit: 'usd-per-troy-ounce',
        sourceTimestamp: quote.sourceTimestamp,
        quoteKind: 'spot',
        spot: quote.spot,
      };
    }

    const factor = domesticToMillionVndPerTael[quote.sourceUnit];
    if (factor === undefined) return unavailable('invalid-payload');
    const buy = quote.buy * factor;
    const sell = quote.sell * factor;
    if (!Number.isFinite(buy) || !Number.isFinite(sell)) return unavailable('invalid-payload');

    return {
      ...adapter.source,
      status,
      collectedAt,
      sourceUnit: quote.sourceUnit,
      sourceTimestamp: quote.sourceTimestamp,
      quoteKind: 'buy-sell',
      buy,
      sell,
    };
  }
}

function attachMovement(
  observation: NormalizedGoldObservation,
  previous: ReadonlyMap<string, StoredGoldQuote>,
  historyUnavailable: boolean,
): GoldQuote {
  const stored = previous.get(goldPriceHistoryKey(observation));
  if (observation.quoteKind === 'spot') {
    const movement: SpotMovement = historyUnavailable
      ? unavailableMovement
      : spotMovementFromPrevious(observation, stored);
    return { ...observation, movement };
  }
  const movement: BuySellMovement = historyUnavailable
    ? unavailableMovement
    : buySellMovementFromPrevious(observation, stored);
  return { ...observation, movement };
}

function unavailableReason(
  observation: NormalizedGoldObservation,
  stored: StoredGoldQuote | undefined,
): GoldMovementUnavailable | undefined {
  if (!stored) return { status: 'not-available', reason: 'no-previous-quote' };
  if (isStrictlyOlder(observation.sourceTimestamp, stored.sourceTimestamp)) {
    return { status: 'not-available', reason: 'source-regression' };
  }
  if (stored.sourceUnit !== observation.sourceUnit || stored.quoteKind !== observation.quoteKind) {
    return { status: 'not-available', reason: 'unit-mismatch' };
  }
  return undefined;
}

function spotMovementFromPrevious(
  observation: Extract<NormalizedGoldObservation, { quoteKind: 'spot' }>,
  stored: StoredGoldQuote | undefined,
): SpotMovement {
  const unavailable = unavailableReason(observation, stored);
  if (unavailable) return unavailable;
  if (!stored || stored.quoteKind !== 'spot') {
    return { status: 'not-available', reason: 'unit-mismatch' };
  }
  return {
    status: 'available',
    previousSourceTimestamp: stored.sourceTimestamp,
    spotDelta: observation.spot - stored.spot,
  };
}

function buySellMovementFromPrevious(
  observation: Extract<NormalizedGoldObservation, { quoteKind: 'buy-sell' }>,
  stored: StoredGoldQuote | undefined,
): BuySellMovement {
  const unavailable = unavailableReason(observation, stored);
  if (unavailable) return unavailable;
  if (!stored || stored.quoteKind !== 'buy-sell') {
    return { status: 'not-available', reason: 'unit-mismatch' };
  }
  return {
    status: 'available',
    previousSourceTimestamp: stored.sourceTimestamp,
    buyDelta: observation.buy - stored.buy,
    sellDelta: observation.sell - stored.sell,
  };
}

function isStrictlyOlder(candidate: string, stored: string): boolean {
  const incoming = Date.parse(candidate);
  const baseline = Date.parse(stored);
  if (!Number.isFinite(incoming) || !Number.isFinite(baseline)) return false;
  return incoming < baseline;
}

function parseSourceTimestamp(value: string): number | undefined {
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
