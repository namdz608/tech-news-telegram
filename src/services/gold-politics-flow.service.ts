import { env } from '../config/env';
import { goldPoliticsRssSources } from '../config/gold-politics-sources';
import type {
  GoldPoliticsFlowResult,
  GoldPriceSnapshot,
  PoliticsCandidate,
  PoliticsCollectionResult,
  PoliticsMessage,
  PoliticsSelectionResult,
  PoliticsSourceItem,
} from '../types/gold-politics';
import { BraveWebSearchProvider } from './brave-web-search.provider';
import { GoldPoliticsDeliveryService } from './gold-politics-delivery.service';
import { GoldPoliticsMessageService } from './gold-politics-message.service';
import { createGoldPriceAdapters } from './gold-price/adapters';
import { GoldPriceHistoryStore } from './gold-price-history.store';
import { GoldPriceService } from './gold-price.service';
import { PoliticsClassificationService } from './politics-classification.service';
import { PoliticsEditorialService } from './politics-editorial.service';
import { PoliticsEventDedupeService } from './politics-event-dedupe.service';
import { PoliticsRssAdapter } from './politics-rss.adapter';
import { PoliticsSelectionService } from './politics-selection.service';
import { PoliticsSourceService } from './politics-source.service';
import { PoliticsVerificationService } from './politics-verification.service';
import { PoliticsWebSearchAdapter } from './politics-web-search.adapter';
import { PoliticsXAdapter } from './politics-x.adapter';
import { RedditSearchAdapter } from './reddit-search.adapter';
import { SafeWebRetrievalService } from './safe-web-retrieval.service';
import { SentHistoryStore } from './sent-history.store';
import { createTelegramService } from './telegram.service';

const PLACEHOLDER_VALUES = new Set([
  'test-gold-politics-token',
  'test-gold-politics-chat-id',
  'replace_me',
]);

export class AllGoldPoliticsSourcesFailedError extends Error {
  constructor() {
    super('All gold-politics sources failed');
    this.name = 'AllGoldPoliticsSourcesFailedError';
  }
}

export function isAllGoldPoliticsSourcesFailedError(error: unknown): boolean {
  return error instanceof AllGoldPoliticsSourcesFailedError
    || (error instanceof Error && error.name === 'AllGoldPoliticsSourcesFailedError');
}

export class GoldPoliticsFlowError extends Error {
  constructor(readonly code: 'telegram-not-configured' | 'sent-history-read-failed') {
    super(code);
    this.name = 'GoldPoliticsFlowError';
  }
}

export interface GoldPoliticsRequiredConfiguration {
  botToken: string;
  chatId: string;
}

export function assertGoldPoliticsConfigured(
  configuration: GoldPoliticsRequiredConfiguration,
): void {
  const botToken = configuration.botToken.trim();
  const chatId = configuration.chatId.trim();
  if (
    botToken === ''
    || chatId === ''
    || PLACEHOLDER_VALUES.has(botToken.toLowerCase())
    || PLACEHOLDER_VALUES.has(chatId.toLowerCase())
  ) {
    throw new GoldPoliticsFlowError('telegram-not-configured');
  }
}

export interface GoldPoliticsFlowDependencies {
  priceService: { collect(): Promise<GoldPriceSnapshot> };
  newsSource: { collectLatest(): Promise<PoliticsCollectionResult> };
  history: { seenUrls(): Promise<Set<string>> };
  selector: {
    select(
      items: readonly PoliticsSourceItem[],
      seenUrls: ReadonlySet<string>,
    ): PoliticsSelectionResult;
  };
  messages: {
    buildPriceMessage(snapshot: GoldPriceSnapshot): string;
    buildNewsMessages(
      candidates: readonly PoliticsCandidate[],
    ): Promise<PoliticsMessage[]>;
  };
  delivery: {
    send(priceMessage: string, newsMessages: readonly PoliticsMessage[]): Promise<void>;
  };
}

export class GoldPoliticsFlowService {
  constructor(private readonly dependencies: GoldPoliticsFlowDependencies) {}

  async run(): Promise<GoldPoliticsFlowResult> {
    const [price, news] = await Promise.all([
      this.dependencies.priceService.collect(),
      this.dependencies.newsSource.collectLatest(),
    ]);

    const failedSources = uniqueStable([...price.failedSources, ...news.failedSources]);
    if (price.successfulProviderCount === 0 && news.successfulSourceCount === 0) {
      throw new AllGoldPoliticsSourcesFailedError();
    }

    let eligibleCount = 0;
    let skippedSeenCount = 0;
    let newsMessages: PoliticsMessage[] = [];

    if (news.items.length > 0) {
      let seen: Set<string>;
      try {
        seen = await this.dependencies.history.seenUrls();
      } catch (error) {
        if (isAllGoldPoliticsSourcesFailedError(error)) throw error;
        throw new GoldPoliticsFlowError('sent-history-read-failed');
      }

      const selection = this.dependencies.selector.select(news.items, seen);
      eligibleCount = selection.eligibleCount;
      skippedSeenCount = selection.skippedSeenCount;
      if (selection.selected.length > 0) {
        newsMessages = await this.dependencies.messages.buildNewsMessages(selection.selected);
      }
    }

    const priceMessage = this.dependencies.messages.buildPriceMessage(price);
    await this.dependencies.delivery.send(priceMessage, newsMessages);

    return {
      sent: true,
      channel: 'telegram-gold-politics',
      priceMessageCount: 1,
      newsMessageCount: newsMessages.length,
      collectedCount: news.collectedCount,
      eligibleCount,
      skippedSeenCount,
      partial: failedSources.length > 0,
      failedSources,
      language: 'vi',
    };
  }
}

export function createGoldPoliticsFlowService(): GoldPoliticsFlowService {
  assertGoldPoliticsConfigured({
    botToken: env.GOLD_POLITICS_TELEGRAM_BOT_TOKEN,
    chatId: env.GOLD_POLITICS_TELEGRAM_CHAT_ID,
  });

  const priceAdapters = createGoldPriceAdapters();
  const priceHistory = new GoldPriceHistoryStore(env.GOLD_PRICE_HISTORY_PATH);
  const priceService = new GoldPriceService(
    priceAdapters,
    priceHistory,
    env.GOLD_POLITICS_MAX_PRICE_AGE_MINUTES,
  );

  const rssAdapters = goldPoliticsRssSources.map((source) => new PoliticsRssAdapter(source));
  const xAdapter = new PoliticsXAdapter();
  const redditAdapter = new RedditSearchAdapter();
  const braveProvider = new BraveWebSearchProvider();
  const retrieval = new SafeWebRetrievalService();
  const webAdapter = new PoliticsWebSearchAdapter(
    braveProvider,
    retrieval,
    () => new Date(),
    env.GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES,
  );
  const newsSource = new PoliticsSourceService(
    [...rssAdapters, xAdapter, redditAdapter, webAdapter],
    env.GOLD_POLITICS_MAX_AGE_HOURS,
  );
  const selector = new PoliticsSelectionService(
    new PoliticsClassificationService(),
    new PoliticsEventDedupeService(),
    new PoliticsVerificationService(),
    {
      maxArticles: env.GOLD_POLITICS_MAX_ARTICLES,
      maxGoldNews: Math.min(env.GOLD_POLITICS_MAX_GOLD_NEWS, env.GOLD_POLITICS_MAX_ARTICLES),
      maxPerSource: 3,
    },
  );
  const messages = new GoldPoliticsMessageService(new PoliticsEditorialService());
  const history = new SentHistoryStore(
    env.GOLD_POLITICS_HISTORY_PATH,
    env.GOLD_POLITICS_HISTORY_RETENTION_DAYS,
    () => new Date(),
    { failurePolicy: 'fail-closed' },
  );
  const telegram = createTelegramService(
    env.GOLD_POLITICS_TELEGRAM_BOT_TOKEN,
    env.GOLD_POLITICS_TELEGRAM_CHAT_ID,
    { messageEffectId: '' },
  );
  const delivery = new GoldPoliticsDeliveryService(telegram, history);

  return new GoldPoliticsFlowService({
    priceService,
    newsSource,
    history,
    selector,
    messages,
    delivery,
  });
}

function uniqueStable(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}
