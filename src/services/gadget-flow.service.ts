import { env } from '../config/env';
import type { Article } from '../types/article';
import type { GadgetDigestEntry, GadgetMessage, GadgetSelectionResult } from '../types/gadget';
import { CuratedTelegramFlow } from './curated-telegram-flow.service';
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
  private readonly flow: CuratedTelegramFlow<
    GadgetDigestEntry,
    GadgetMessage,
    'telegram-gadgets'
  >;

  constructor(
    source: Collector,
    history: HistoryReader,
    selection: Selector,
    messages: MessageBuilder,
    delivery: Delivery,
  ) {
    this.flow = new CuratedTelegramFlow(
      { collector: source, history, selector: selection, messageBuilder: messages, delivery },
      {
        channel: 'telegram-gadgets',
        createAllSourcesFailedError: () => new AllGadgetSourcesFailedError(),
      },
    );
  }

  run() {
    return this.flow.run();
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
