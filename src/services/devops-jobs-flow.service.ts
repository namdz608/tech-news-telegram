import { env } from '../config/env';
import type {
  DevopsJob,
  DevopsJobsCollectionResult,
  DevopsJobsFlowResult,
  DevopsJobsMessage,
  DevopsJobsSelectionResult,
} from '../types/devops-jobs';
import { SentHistoryStore } from './sent-history.store';
import { createTelegramService } from './telegram.service';
import { DevopsJobsDeliveryService } from './devops-jobs-delivery.service';
import { HimalayasAdapter } from './devops-jobs-himalayas.adapter';
import { HnHiringAdapter } from './devops-jobs-hn.adapter';
import { IndeedJobsAdapter } from './devops-jobs-indeed.adapter';
import { LinkedInJobsAdapter } from './devops-jobs-linkedin.adapter';
import { DevopsJobsMessageService } from './devops-jobs-message.service';
import { RemoteOkAdapter } from './devops-jobs-remoteok.adapter';
import { RemotiveAdapter } from './devops-jobs-remotive.adapter';
import { DevopsJobsSelectionService } from './devops-jobs-selection.service';
import { DevopsJobsSourceService } from './devops-jobs-source.service';
import { WeWorkRemotelyAdapter } from './devops-jobs-weworkremotely.adapter';

const PLACEHOLDER_VALUES = new Set([
  'test-devops-jobs-token',
  'test-devops-jobs-chat-id',
  'replace_me',
]);

export class AllDevopsJobsSourcesFailedError extends Error {
  constructor() {
    super('All devops-jobs sources failed');
    this.name = 'AllDevopsJobsSourcesFailedError';
  }
}

export function isAllDevopsJobsSourcesFailedError(error: unknown): boolean {
  return error instanceof AllDevopsJobsSourcesFailedError
    || (error instanceof Error && error.name === 'AllDevopsJobsSourcesFailedError');
}

export class DevopsJobsFlowError extends Error {
  constructor(readonly code: 'telegram-not-configured' | 'sent-history-read-failed') {
    super(code);
    this.name = 'DevopsJobsFlowError';
  }
}

export function assertDevopsJobsConfigured(configuration: {
  botToken: string;
  chatId: string;
}): void {
  const botToken = configuration.botToken.trim();
  const chatId = configuration.chatId.trim();
  if (
    botToken === ''
    || chatId === ''
    || PLACEHOLDER_VALUES.has(botToken.toLowerCase())
    || PLACEHOLDER_VALUES.has(chatId.toLowerCase())
  ) {
    throw new DevopsJobsFlowError('telegram-not-configured');
  }
}

export interface DevopsJobsFlowDependencies {
  source: { collectLatest(): Promise<DevopsJobsCollectionResult> };
  history: { seenUrls(): Promise<Set<string>> };
  selection: {
    select(jobs: readonly DevopsJob[], seenUrls: ReadonlySet<string>): DevopsJobsSelectionResult;
  };
  messages: { buildMessages(jobs: readonly DevopsJob[]): Promise<DevopsJobsMessage[]> };
  delivery: { send(messages: readonly DevopsJobsMessage[]): Promise<void> };
}

export class DevopsJobsFlowService {
  constructor(private readonly dependencies: DevopsJobsFlowDependencies) {}

  async run(): Promise<DevopsJobsFlowResult> {
    const { source, history, selection, messages, delivery } = this.dependencies;
    const collection = await source.collectLatest();
    if (collection.successfulSourceCount === 0) {
      throw new AllDevopsJobsSourcesFailedError();
    }
    let seenUrls: Set<string>;
    try {
      seenUrls = await history.seenUrls();
    } catch (error) {
      if (isAllDevopsJobsSourcesFailedError(error)) throw error;
      throw new DevopsJobsFlowError('sent-history-read-failed');
    }
    const result = selection.select(collection.items, seenUrls);
    const common = {
      channel: 'telegram-devops-jobs' as const,
      collectedCount: collection.collectedCount,
      eligibleCount: result.eligibleCount,
      skippedSeenCount: result.skippedSeenCount,
      partial: collection.failedSources.length > 0,
      failedSources: collection.failedSources,
      language: 'vi' as const,
    };
    if (result.selected.length === 0) {
      return { sent: false, reason: 'no_new_articles', messageCount: 0, ...common };
    }
    const built = await messages.buildMessages(result.selected);
    await delivery.send(built);
    return { sent: true, messageCount: built.length, ...common };
  }
}

export function createDevopsJobsFlowService(): DevopsJobsFlowService {
  assertDevopsJobsConfigured({
    botToken: env.DEVOPS_JOBS_TELEGRAM_BOT_TOKEN,
    chatId: env.DEVOPS_JOBS_TELEGRAM_CHAT_ID,
  });
  const source = new DevopsJobsSourceService([
    new RemoteOkAdapter(),
    new RemotiveAdapter(),
    new WeWorkRemotelyAdapter(),
    new HimalayasAdapter(),
    new HnHiringAdapter(),
    new LinkedInJobsAdapter(),
    new IndeedJobsAdapter(),
  ]);
  const history = new SentHistoryStore(
    env.DEVOPS_JOBS_HISTORY_PATH,
    env.DEVOPS_JOBS_HISTORY_RETENTION_DAYS,
    () => new Date(),
    { failurePolicy: 'fail-closed' },
  );
  const selection = new DevopsJobsSelectionService(
    env.DEVOPS_JOBS_MAX_JOBS,
    env.DEVOPS_JOBS_MAX_PER_SOURCE,
    env.DEVOPS_JOBS_MAX_AGE_HOURS,
  );
  const telegram = createTelegramService(
    env.DEVOPS_JOBS_TELEGRAM_BOT_TOKEN,
    env.DEVOPS_JOBS_TELEGRAM_CHAT_ID,
  );
  return new DevopsJobsFlowService({
    source,
    history,
    selection,
    messages: new DevopsJobsMessageService(),
    delivery: new DevopsJobsDeliveryService(telegram, history),
  });
}
