import { env } from '../config/env';
import type { Article } from '../types/article';
import type { HealthDigestEntry, HealthMessage, HealthSelectionResult } from '../types/health';
import { CuratedTelegramFlow } from './curated-telegram-flow.service';
import { HealthMessageService } from './health-message.service';
import { HealthSelectionService } from './health-selection.service';
import { type HealthCollectionResult, HealthSourceService } from './health-source.service';
import { SentHistoryStore } from './sent-history.store';
import { createTelegramService } from './telegram.service';
import { TrackedTelegramDeliveryService } from './tracked-telegram-delivery.service';

interface Collector { collectLatest(): Promise<HealthCollectionResult> }
interface HistoryReader { seenUrls(): Promise<Set<string>> }
interface Selector {
  select(articles: Article[], seen: ReadonlySet<string>): HealthSelectionResult;
}
interface MessageBuilder { buildMessages(entries: HealthDigestEntry[]): Promise<HealthMessage[]> }
interface Delivery { send(messages: HealthMessage[]): Promise<void> }

export class AllHealthSourcesFailedError extends Error {
  constructor() {
    super('All health sources failed');
    this.name = 'AllHealthSourcesFailedError';
  }
}

export function isAllHealthSourcesFailedError(error: unknown): boolean {
  return error instanceof AllHealthSourcesFailedError
    || (typeof error === 'object'
      && error !== null
      && 'name' in error
      && error.name === 'AllHealthSourcesFailedError');
}

export class HealthFlowService {
  private readonly flow: CuratedTelegramFlow<
    HealthDigestEntry,
    HealthMessage,
    'telegram-health'
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
        channel: 'telegram-health',
        createAllSourcesFailedError: () => new AllHealthSourcesFailedError(),
      },
    );
  }

  run() {
    return this.flow.run();
  }
}

export function createHealthFlowService(): HealthFlowService {
  const source = new HealthSourceService();
  const history = new SentHistoryStore(
    env.HEALTH_HISTORY_PATH,
    env.HEALTH_HISTORY_RETENTION_DAYS,
  );
  const selection = new HealthSelectionService();
  const messages = new HealthMessageService();
  const telegram = createTelegramService(
    env.HEALTH_TELEGRAM_BOT_TOKEN,
    env.HEALTH_TELEGRAM_CHAT_ID,
  );
  const delivery = new TrackedTelegramDeliveryService<HealthMessage>(telegram, history);
  return new HealthFlowService(source, history, selection, messages, delivery);
}
