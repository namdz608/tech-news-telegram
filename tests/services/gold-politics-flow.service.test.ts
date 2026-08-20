import { inspect } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { GoldPoliticsDeliveryError } from '../../src/services/gold-politics-delivery.service';
import {
  AllGoldPoliticsSourcesFailedError,
  GoldPoliticsFlowError,
  GoldPoliticsFlowService,
  isAllGoldPoliticsSourcesFailedError,
} from '../../src/services/gold-politics-flow.service';
import type {
  GoldPriceSnapshot,
  PoliticsCandidate,
  PoliticsCollectionResult,
  PoliticsMessage,
  PoliticsSelectionResult,
  PoliticsSourceItem,
} from '../../src/types/gold-politics';

const PRICE_MESSAGE = 'price-html';
const SENSITIVE_HISTORY_ERROR = {
  botToken: '123456:ABC-TOKEN',
  chatId: '-100123',
  path: '/var/secrets/gold-politics-sent-history.json',
  allegation: 'received bribes from official X',
};

function leakSurface(value: unknown): string {
  const error = value as { cause?: unknown; message?: string; stack?: string; code?: unknown };
  return [
    JSON.stringify(value),
    JSON.stringify(error?.cause),
    String(value),
    error?.message ?? '',
    error?.stack ?? '',
    String(error?.code ?? ''),
    inspect(value, { depth: 8, showHidden: true }),
  ].join('\n');
}

function assertNoSensitiveLeak(value: unknown): void {
  const surface = leakSurface(value);
  expect(surface).not.toContain('123456:ABC-TOKEN');
  expect(surface).not.toContain('-100123');
  expect(surface).not.toContain('/var/secrets');
  expect(surface).not.toContain('received bribes');
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function newsItem(index: number): PoliticsSourceItem {
  const url = `https://news.example/story-${index}`;
  return {
    id: url,
    sourceId: 'rss-test',
    sourceName: 'Test Source',
    title: `Story ${index}`,
    url,
    publishedAt: '2026-08-19T08:00:00.000Z',
    collectedAt: '2026-08-20T04:00:00.000Z',
    topics: [],
    discoveryChannel: 'rss',
    discoveredAt: '2026-08-20T04:00:00.000Z',
    sourceQuotaKey: 'news.example',
    sourceTextStatus: 'full',
    evidenceKind: 'identified-report',
    evidentiaryEffect: 'mentions',
    evidenceOriginKey: 'news.example',
    originAttribution: {
      url,
      publishedAt: '2026-08-19T08:00:00.000Z',
      discoveredAt: '2026-08-20T04:00:00.000Z',
    },
  };
}

function candidate(index: number): PoliticsCandidate {
  const item = newsItem(index);
  return {
    ...item,
    primaryCategory: 'vietnam-politics',
    geographicScope: 'vietnam',
    semanticClaimKey: `story-${index}`,
    claimEntities: [],
    claimStance: 'neutral',
    claimModality: 'reported',
    evidenceAssertions: [],
    verificationState: 'reported',
    eventFingerprint: `fp-${index}`,
    claimOriginUrl: item.url,
    claimOriginResolution: 'collected-original',
    priorityTier: 1,
    independentSourceIds: ['news.example'],
    score: 10,
    scoringReasons: ['relevance'],
    corroborationNote: 'Một nguồn ghi nhận.',
  };
}

function newsMessage(index: number): PoliticsMessage {
  const selected = candidate(index);
  return { text: `news-${index}`, url: selected.claimOriginUrl, candidate: selected };
}

function priceSnapshot(overrides: Partial<GoldPriceSnapshot> = {}): GoldPriceSnapshot {
  return {
    collectedAt: '2026-08-20T04:00:00.000Z',
    quotes: [],
    successfulProviderCount: 4,
    failedSources: [],
    ...overrides,
  };
}

function newsResult(overrides: Partial<PoliticsCollectionResult> = {}): PoliticsCollectionResult {
  const items = overrides.items ?? [newsItem(1), newsItem(2), newsItem(3), newsItem(4), newsItem(5), newsItem(6), newsItem(7)];
  return {
    items,
    collectedCount: overrides.collectedCount ?? items.length,
    successfulSourceCount: 4,
    failedSourceCount: 0,
    failedSources: [],
    ...overrides,
  };
}

function selectionResult(overrides: Partial<PoliticsSelectionResult> = {}): PoliticsSelectionResult {
  return {
    selected: [candidate(1), candidate(2)],
    eligibleCount: 4,
    skippedSeenCount: 1,
    ...overrides,
  };
}

function dependencies() {
  return {
    priceService: { collect: vi.fn() },
    newsSource: { collectLatest: vi.fn() },
    history: { seenUrls: vi.fn().mockResolvedValue(new Set<string>()) },
    selector: { select: vi.fn() },
    messages: {
      buildPriceMessage: vi.fn().mockReturnValue(PRICE_MESSAGE),
      buildNewsMessages: vi.fn(),
    },
    delivery: { send: vi.fn().mockResolvedValue(undefined) },
  };
}

function flowOf(deps: ReturnType<typeof dependencies>): GoldPoliticsFlowService {
  return new GoldPoliticsFlowService(deps);
}

describe('GoldPoliticsFlowService', () => {
  it('collects price and news concurrently, then history, selection, messages, and delivery', async () => {
    const deps = dependencies();
    const price = deferred<GoldPriceSnapshot>();
    const news = deferred<PoliticsCollectionResult>();
    const snapshot = priceSnapshot();
    const collected = newsResult();
    const selected = selectionResult();
    const messages = [newsMessage(1), newsMessage(2)];
    let priceStarted = false;
    let newsStarted = false;

    deps.priceService.collect.mockImplementation(() => {
      priceStarted = true;
      return price.promise;
    });
    deps.newsSource.collectLatest.mockImplementation(() => {
      newsStarted = true;
      return news.promise;
    });
    deps.selector.select.mockReturnValue(selected);
    deps.messages.buildNewsMessages.mockResolvedValue(messages);

    const run = flowOf(deps).run();
    await vi.waitFor(() => {
      expect(priceStarted).toBe(true);
      expect(newsStarted).toBe(true);
    });
    expect(deps.history.seenUrls).not.toHaveBeenCalled();
    expect(deps.selector.select).not.toHaveBeenCalled();

    price.resolve(snapshot);
    news.resolve(collected);
    await expect(run).resolves.toEqual({
      sent: true,
      channel: 'telegram-gold-politics',
      priceMessageCount: 1,
      newsMessageCount: 2,
      collectedCount: 7,
      eligibleCount: 4,
      skippedSeenCount: 1,
      partial: false,
      failedSources: [],
      language: 'vi',
    });

    expect(deps.history.seenUrls).toHaveBeenCalledOnce();
    expect(deps.selector.select).toHaveBeenCalledWith(collected.items, new Set());
    expect(deps.messages.buildPriceMessage).toHaveBeenCalledWith(snapshot);
    expect(deps.messages.buildNewsMessages).toHaveBeenCalledWith(selected.selected);
    expect(deps.delivery.send).toHaveBeenCalledWith(PRICE_MESSAGE, messages);
  });

  it('sends a price-only delivery when there is no unseen eligible news and skips editorial', async () => {
    const deps = dependencies();
    deps.priceService.collect.mockResolvedValue(priceSnapshot());
    deps.newsSource.collectLatest.mockResolvedValue(newsResult());
    deps.selector.select.mockReturnValue(selectionResult({
      selected: [],
      eligibleCount: 0,
      skippedSeenCount: 1,
    }));

    await expect(flowOf(deps).run()).resolves.toMatchObject({
      sent: true,
      priceMessageCount: 1,
      newsMessageCount: 0,
      collectedCount: 7,
      eligibleCount: 0,
      skippedSeenCount: 1,
      partial: false,
      failedSources: [],
    });
    expect(deps.messages.buildNewsMessages).not.toHaveBeenCalled();
    expect(deps.delivery.send).toHaveBeenCalledWith(PRICE_MESSAGE, []);
  });

  it('returns partial with gold failures first then unique news failures in stable order', async () => {
    const deps = dependencies();
    const snapshot = priceSnapshot({
      successfulProviderCount: 2,
      failedSources: ['pnj', 'xau-usd', 'gold-price-history'],
    });
    const collected = newsResult({
      successfulSourceCount: 2,
      failedSourceCount: 3,
      failedSources: ['xau-usd', 'x-search', 'web-search'],
    });
    deps.priceService.collect.mockResolvedValue(snapshot);
    deps.newsSource.collectLatest.mockResolvedValue(collected);
    deps.selector.select.mockReturnValue(selectionResult());
    deps.messages.buildNewsMessages.mockResolvedValue([newsMessage(1), newsMessage(2)]);

    await expect(flowOf(deps).run()).resolves.toEqual({
      sent: true,
      channel: 'telegram-gold-politics',
      priceMessageCount: 1,
      newsMessageCount: 2,
      collectedCount: 7,
      eligibleCount: 4,
      skippedSeenCount: 1,
      partial: true,
      failedSources: ['pnj', 'xau-usd', 'gold-price-history', 'x-search', 'web-search'],
      language: 'vi',
    });
    expect(deps.delivery.send).toHaveBeenCalledOnce();
  });

  it('sends unavailable-price status then selected news when every price is unavailable', async () => {
    const deps = dependencies();
    const snapshot = priceSnapshot({
      successfulProviderCount: 0,
      failedSources: ['sjc', 'doji', 'pnj', 'xau-usd'],
    });
    const collected = newsResult({ successfulSourceCount: 1 });
    const selected = selectionResult();
    const messages = [newsMessage(1), newsMessage(2)];
    deps.priceService.collect.mockResolvedValue(snapshot);
    deps.newsSource.collectLatest.mockResolvedValue(collected);
    deps.selector.select.mockReturnValue(selected);
    deps.messages.buildNewsMessages.mockResolvedValue(messages);

    await expect(flowOf(deps).run()).resolves.toMatchObject({
      sent: true,
      newsMessageCount: 2,
      partial: true,
      failedSources: ['sjc', 'doji', 'pnj', 'xau-usd'],
    });
    expect(deps.messages.buildPriceMessage).toHaveBeenCalledWith(snapshot);
    expect(deps.delivery.send).toHaveBeenCalledWith(PRICE_MESSAGE, messages);
  });

  it('sends exactly one unavailable-price message when news succeeds with zero items', async () => {
    const deps = dependencies();
    deps.priceService.collect.mockResolvedValue(priceSnapshot({
      successfulProviderCount: 0,
      failedSources: ['sjc', 'doji', 'pnj', 'xau-usd'],
    }));
    deps.newsSource.collectLatest.mockResolvedValue(newsResult({
      items: [],
      collectedCount: 0,
      successfulSourceCount: 1,
    }));

    await expect(flowOf(deps).run()).resolves.toMatchObject({
      sent: true,
      priceMessageCount: 1,
      newsMessageCount: 0,
      collectedCount: 0,
      eligibleCount: 0,
      skippedSeenCount: 0,
      partial: true,
    });
    expect(deps.history.seenUrls).not.toHaveBeenCalled();
    expect(deps.selector.select).not.toHaveBeenCalled();
    expect(deps.messages.buildNewsMessages).not.toHaveBeenCalled();
    expect(deps.delivery.send).toHaveBeenCalledWith(PRICE_MESSAGE, []);
    expect(deps.delivery.send).toHaveBeenCalledOnce();
  });

  it('sends exactly one unavailable-price message when every news item was already seen', async () => {
    const deps = dependencies();
    const collected = newsResult({ successfulSourceCount: 1, collectedCount: 7 });
    deps.priceService.collect.mockResolvedValue(priceSnapshot({
      successfulProviderCount: 0,
      failedSources: ['sjc', 'doji', 'pnj', 'xau-usd'],
    }));
    deps.newsSource.collectLatest.mockResolvedValue(collected);
    deps.selector.select.mockReturnValue(selectionResult({
      selected: [],
      eligibleCount: 0,
      skippedSeenCount: 7,
    }));

    await expect(flowOf(deps).run()).resolves.toMatchObject({
      newsMessageCount: 0,
      skippedSeenCount: 7,
      partial: true,
    });
    expect(deps.history.seenUrls).toHaveBeenCalledOnce();
    expect(deps.messages.buildNewsMessages).not.toHaveBeenCalled();
    expect(deps.delivery.send).toHaveBeenCalledWith(PRICE_MESSAGE, []);
    expect(deps.delivery.send).toHaveBeenCalledOnce();
  });

  it('sends price only and skips history, selection, and editorial when every news source fails', async () => {
    const deps = dependencies();
    deps.priceService.collect.mockResolvedValue(priceSnapshot({
      successfulProviderCount: 2,
      failedSources: [],
    }));
    deps.newsSource.collectLatest.mockResolvedValue(newsResult({
      items: [],
      collectedCount: 0,
      successfulSourceCount: 0,
      failedSourceCount: 2,
      failedSources: ['x-search', 'web-search'],
    }));

    await expect(flowOf(deps).run()).resolves.toMatchObject({
      sent: true,
      newsMessageCount: 0,
      collectedCount: 0,
      eligibleCount: 0,
      skippedSeenCount: 0,
      partial: true,
      failedSources: ['x-search', 'web-search'],
    });
    expect(deps.history.seenUrls).not.toHaveBeenCalled();
    expect(deps.selector.select).not.toHaveBeenCalled();
    expect(deps.messages.buildNewsMessages).not.toHaveBeenCalled();
    expect(deps.delivery.send).toHaveBeenCalledWith(PRICE_MESSAGE, []);
  });

  it('sends price only and is not partial when news sources succeed with zero items', async () => {
    const deps = dependencies();
    deps.priceService.collect.mockResolvedValue(priceSnapshot());
    deps.newsSource.collectLatest.mockResolvedValue(newsResult({
      items: [],
      collectedCount: 0,
      successfulSourceCount: 3,
      failedSourceCount: 0,
      failedSources: [],
    }));

    await expect(flowOf(deps).run()).resolves.toMatchObject({
      sent: true,
      newsMessageCount: 0,
      collectedCount: 0,
      partial: false,
      failedSources: [],
    });
    expect(deps.messages.buildNewsMessages).not.toHaveBeenCalled();
    expect(deps.delivery.send).toHaveBeenCalledWith(PRICE_MESSAGE, []);
  });

  it('throws AllGoldPoliticsSourcesFailedError before history, selection, messages, or Telegram', async () => {
    const deps = dependencies();
    deps.priceService.collect.mockResolvedValue(priceSnapshot({
      successfulProviderCount: 0,
      failedSources: ['sjc', 'doji', 'pnj', 'xau-usd'],
    }));
    deps.newsSource.collectLatest.mockResolvedValue(newsResult({
      items: [],
      collectedCount: 0,
      successfulSourceCount: 0,
      failedSourceCount: 4,
      failedSources: ['vnexpress-thoi-su', 'x-search'],
    }));
    deps.history.seenUrls.mockRejectedValue(new Error(JSON.stringify(SENSITIVE_HISTORY_ERROR)));

    const error = await flowOf(deps).run().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(AllGoldPoliticsSourcesFailedError);
    expect(isAllGoldPoliticsSourcesFailedError(error)).toBe(true);
    expect(deps.history.seenUrls).not.toHaveBeenCalled();
    expect(deps.selector.select).not.toHaveBeenCalled();
    expect(deps.messages.buildPriceMessage).not.toHaveBeenCalled();
    expect(deps.messages.buildNewsMessages).not.toHaveBeenCalled();
    expect(deps.delivery.send).not.toHaveBeenCalled();
  });

  it('recognizes AllGoldPoliticsSourcesFailedError by name for the controller 503 path', () => {
    const renamed = new Error('All gold-politics sources failed');
    renamed.name = 'AllGoldPoliticsSourcesFailedError';
    expect(isAllGoldPoliticsSourcesFailedError(renamed)).toBe(true);
    expect(isAllGoldPoliticsSourcesFailedError(new Error('nope'))).toBe(false);
  });

  it('propagates a safe delivery error and never the raw Telegram object', async () => {
    const deps = dependencies();
    deps.priceService.collect.mockResolvedValue(priceSnapshot());
    deps.newsSource.collectLatest.mockResolvedValue(newsResult());
    deps.selector.select.mockReturnValue(selectionResult());
    deps.messages.buildNewsMessages.mockResolvedValue([newsMessage(1), newsMessage(2)]);
    deps.delivery.send.mockRejectedValue(new GoldPoliticsDeliveryError('telegram-send-failed'));

    const error = await flowOf(deps).run().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(GoldPoliticsDeliveryError);
    expect(error).toMatchObject({
      name: 'GoldPoliticsDeliveryError',
      code: 'telegram-send-failed',
      message: 'telegram-send-failed',
    });
    expect((error as Error).cause).toBeUndefined();
    assertNoSensitiveLeak(error);
  });

  it('does not return success when the second news message fails; tracking stays with delivery', async () => {
    const deps = dependencies();
    deps.priceService.collect.mockResolvedValue(priceSnapshot());
    deps.newsSource.collectLatest.mockResolvedValue(newsResult());
    deps.selector.select.mockReturnValue(selectionResult());
    deps.messages.buildNewsMessages.mockResolvedValue([newsMessage(1), newsMessage(2)]);
    deps.delivery.send.mockRejectedValue(new GoldPoliticsDeliveryError('telegram-send-failed'));

    await expect(flowOf(deps).run()).rejects.toMatchObject({
      name: 'GoldPoliticsDeliveryError',
      code: 'telegram-send-failed',
    });
  });

  it('keeps current quotes, adds gold-price-history, and returns partial when gold history fails', async () => {
    const deps = dependencies();
    const snapshot = priceSnapshot({
      successfulProviderCount: 4,
      failedSources: ['gold-price-history'],
      quotes: [
        {
          providerKey: 'sjc',
          providerName: 'SJC',
          instrumentKey: 'sjc-1l',
          instrumentName: 'SJC 1 lượng',
          sourceUrl: 'https://www.sjc.com.vn/bieu-do-gia-vang',
          displayUnit: 'million-vnd-per-tael',
          status: 'fresh',
          collectedAt: '2026-08-20T04:00:00.000Z',
          sourceUnit: 'thousand-vnd-per-tael',
          sourceTimestamp: '2026-08-20T03:32:28.000Z',
          quoteKind: 'buy-sell',
          buy: 143,
          sell: 146,
          movement: { status: 'not-available', reason: 'history-unavailable' },
        },
      ],
    });
    deps.priceService.collect.mockResolvedValue(snapshot);
    deps.newsSource.collectLatest.mockResolvedValue(newsResult());
    deps.selector.select.mockReturnValue(selectionResult());
    deps.messages.buildNewsMessages.mockResolvedValue([newsMessage(1), newsMessage(2)]);

    await expect(flowOf(deps).run()).resolves.toMatchObject({
      sent: true,
      partial: true,
      failedSources: ['gold-price-history'],
    });
    expect(deps.messages.buildPriceMessage).toHaveBeenCalledWith(snapshot);
    expect(snapshot.quotes[0]).toMatchObject({
      status: 'fresh',
      movement: { status: 'not-available', reason: 'history-unavailable' },
    });
  });

  it('fails closed on sent-history read without logging the raw error or rendering', async () => {
    const deps = dependencies();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    deps.priceService.collect.mockResolvedValue(priceSnapshot());
    deps.newsSource.collectLatest.mockResolvedValue(newsResult());
    deps.history.seenUrls.mockRejectedValue(new Error(JSON.stringify(SENSITIVE_HISTORY_ERROR)));

    try {
      const error = await flowOf(deps).run().catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(GoldPoliticsFlowError);
      expect(error).toMatchObject({
        name: 'GoldPoliticsFlowError',
        code: 'sent-history-read-failed',
        message: 'sent-history-read-failed',
      });
      expect((error as Error).cause).toBeUndefined();
      assertNoSensitiveLeak(error);
      expect(leakSurface(warn.mock.calls)).not.toContain('123456:ABC-TOKEN');
      expect(leakSurface(errorLog.mock.calls)).not.toContain('123456:ABC-TOKEN');
      expect(deps.messages.buildPriceMessage).not.toHaveBeenCalled();
      expect(deps.messages.buildNewsMessages).not.toHaveBeenCalled();
      expect(deps.delivery.send).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      errorLog.mockRestore();
    }
  });

  it('propagates sent-history-mark-failed after Telegram success as at-least-once delivery', async () => {
    const deps = dependencies();
    deps.priceService.collect.mockResolvedValue(priceSnapshot());
    deps.newsSource.collectLatest.mockResolvedValue(newsResult());
    deps.selector.select.mockReturnValue(selectionResult());
    deps.messages.buildNewsMessages.mockResolvedValue([newsMessage(1), newsMessage(2)]);
    deps.delivery.send.mockRejectedValue(new GoldPoliticsDeliveryError('sent-history-mark-failed'));

    const error = await flowOf(deps).run().catch((thrown: unknown) => thrown);
    expect(error).toMatchObject({
      name: 'GoldPoliticsDeliveryError',
      code: 'sent-history-mark-failed',
      message: 'sent-history-mark-failed',
    });
    expect((error as Error).cause).toBeUndefined();
  });
});
