import { env } from '../config/env';
import type { Article } from '../types/article';
import type { GadgetMessage, GadgetSelectionResult } from '../types/gadget';
import { GadgetDeliveryService } from './gadget-delivery.service';
import { GadgetMessageService } from './gadget-message.service';
import { GadgetSelectionService } from './gadget-selection.service';
import { type GadgetCollectionResult, GadgetSourceService } from './gadget-source.service';
import { SentHistoryStore } from './sent-history.store';
import { createTelegramService } from './telegram.service';

interface Collector { collectLatest(): Promise<GadgetCollectionResult> }
interface HistoryReader { seenUrls(): Promise<Set<string>> }
interface Selector { select(articles: Article[], seen: ReadonlySet<string>): GadgetSelectionResult }
interface MessageBuilder { buildMessages(entries: GadgetSelectionResult['selected']): Promise<GadgetMessage[]> }
interface Delivery { send(messages: GadgetMessage[]): Promise<void> }

export class AllGadgetSourcesFailedError extends Error {
  constructor() {
    super('All gadget sources failed');
    this.name = 'AllGadgetSourcesFailedError';
  }
}

export function isAllGadgetSourcesFailedError(error: unknown): boolean {
  return error instanceof AllGadgetSourcesFailedError
    || (typeof error === 'object'
      && error !== null
      && 'name' in error
      && error.name === 'AllGadgetSourcesFailedError');
}

export class GadgetFlowService {
  constructor(
    private readonly source: Collector,
    private readonly history: HistoryReader,
    private readonly selection: Selector,
    private readonly messages: MessageBuilder,
    private readonly delivery: Delivery,
  ) {}

  async run() {
    const collected = await this.source.collectLatest();
    if (collected.successfulSourceCount === 0) throw new AllGadgetSourcesFailedError();
    const result = this.selection.select(collected.articles, await this.history.seenUrls());
    const common = {
      collectedCount: collected.articles.length,
      eligibleCount: result.eligibleCount,
      skippedSeenCount: result.skippedSeenCount,
      language: 'vi' as const,
      channel: 'telegram-gadgets' as const,
    };
    if (result.selected.length === 0) {
      return { sent: false, reason: 'no_new_articles' as const, messageCount: 0, ...common };
    }
    const messages = await this.messages.buildMessages(result.selected);
    await this.delivery.send(messages);
    return { sent: true, messageCount: messages.length, ...common };
  }
}

export function createGadgetFlowService(): GadgetFlowService {
  const source = new GadgetSourceService();
  const history = new SentHistoryStore();
  const selection = new GadgetSelectionService();
  const messages = new GadgetMessageService();
  const telegram = createTelegramService(env.GADGET_TELEGRAM_BOT_TOKEN, env.GADGET_TELEGRAM_CHAT_ID);
  return new GadgetFlowService(
    source,
    history,
    selection,
    messages,
    new GadgetDeliveryService(telegram, history),
  );
}
