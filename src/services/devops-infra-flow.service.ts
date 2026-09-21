import { env } from '../config/env';
import type {
  DevopsInfraCollectionResult,
  DevopsInfraFlowResult,
  DevopsInfraMessage,
  DevopsInfraSelectionResult,
  DevopsInfraSourceItem,
} from '../types/devops-infra';
import { DevopsInfraCodexEditorialGenerator } from './devops-infra-codex-editorial.generator';
import { DevopsInfraDeliveryService } from './devops-infra-delivery.service';
import { DevopsInfraDiscordAdapter } from './devops-infra-discord.adapter';
import { DevopsInfraEditorialService } from './devops-infra-editorial.service';
import { DevopsInfraFacebookAdapter } from './devops-infra-facebook.adapter';
import { DevopsInfraGoogleEditorialGenerator } from './devops-infra-google-editorial.generator';
import { DevopsInfraHnAdapter } from './devops-infra-hn.adapter';
import { DevopsInfraMessageService } from './devops-infra-message.service';
import { DevopsInfraOpenAIEditorialGenerator } from './devops-infra-openai-editorial.generator';
import { DevopsInfraRedditAdapter } from './devops-infra-reddit.adapter';
import { DevopsInfraSelectionService } from './devops-infra-selection.service';
import { DevopsInfraSourceService } from './devops-infra-source.service';
import { DevopsInfraStackExchangeAdapter } from './devops-infra-stackexchange.adapter';
import { DevopsInfraWebSearchAdapter } from './devops-infra-web-search.adapter';
import { DevopsInfraXAdapter } from './devops-infra-x.adapter';
import { SentHistoryStore } from './sent-history.store';
import { createTelegramService } from './telegram.service';

const PLACEHOLDER_VALUES = new Set([
  'test-devops-infra-token',
  'test-devops-infra-chat-id',
  'replace_me',
]);

export class AllDevopsInfraSourcesFailedError extends Error {
  constructor() {
    super('All devops-infra sources failed');
    this.name = 'AllDevopsInfraSourcesFailedError';
  }
}

export function isAllDevopsInfraSourcesFailedError(error: unknown): boolean {
  return error instanceof AllDevopsInfraSourcesFailedError
    || (error instanceof Error && error.name === 'AllDevopsInfraSourcesFailedError');
}

export class DevopsInfraFlowError extends Error {
  constructor(readonly code: 'telegram-not-configured' | 'sent-history-read-failed') {
    super(code);
    this.name = 'DevopsInfraFlowError';
  }
}

export interface DevopsInfraRequiredConfiguration {
  botToken: string;
  chatId: string;
}

export function assertDevopsInfraConfigured(
  configuration: DevopsInfraRequiredConfiguration,
): void {
  const botToken = configuration.botToken.trim();
  const chatId = configuration.chatId.trim();
  if (
    botToken === ''
    || chatId === ''
    || PLACEHOLDER_VALUES.has(botToken.toLowerCase())
    || PLACEHOLDER_VALUES.has(chatId.toLowerCase())
  ) {
    throw new DevopsInfraFlowError('telegram-not-configured');
  }
}

export interface DevopsInfraFlowDependencies {
  source: { collectLatest(): Promise<DevopsInfraCollectionResult> };
  history: { seenUrls(): Promise<Set<string>> };
  selection: {
    select(
      items: readonly DevopsInfraSourceItem[],
      seenUrls: ReadonlySet<string>,
    ): DevopsInfraSelectionResult;
  };
  messages: {
    buildMessages(
      selected: DevopsInfraSelectionResult['selected'],
    ): Promise<DevopsInfraMessage[]>;
  };
  delivery: { send(messages: readonly DevopsInfraMessage[]): Promise<void> };
}

export class DevopsInfraFlowService {
  constructor(private readonly dependencies: DevopsInfraFlowDependencies) {}

  async run(): Promise<DevopsInfraFlowResult> {
    const { source, history, selection, messages, delivery } = this.dependencies;
    const collection = await source.collectLatest();
    console.warn(
      'devops-infra collect',
      collection.collectedCount,
      collection.successfulSourceCount,
      collection.failedSources.join(',') || 'none',
    );
    if (collection.successfulSourceCount === 0) {
      throw new AllDevopsInfraSourcesFailedError();
    }

    let seenUrls: Set<string>;
    try {
      seenUrls = await history.seenUrls();
    } catch (error) {
      if (isAllDevopsInfraSourcesFailedError(error)) throw error;
      throw new DevopsInfraFlowError('sent-history-read-failed');
    }

    const result = selection.select(collection.items, seenUrls);
    const common = {
      channel: 'telegram-devops-infra' as const,
      collectedCount: collection.collectedCount,
      eligibleCount: result.eligibleCount,
      skippedSeenCount: result.skippedSeenCount,
      partial: collection.failedSources.length > 0,
      failedSources: collection.failedSources,
      language: 'vi' as const,
    };
    console.warn(
      'devops-infra selected',
      result.selected.length,
      'eligible',
      result.eligibleCount,
      'skippedSeen',
      result.skippedSeenCount,
    );
    if (result.selected.length === 0) {
      console.warn(
        'devops-infra skip send',
        'no_new_articles',
        result.skippedSeenCount,
        collection.collectedCount,
      );
      return {
        sent: false,
        reason: 'no_new_articles',
        messageCount: 0,
        ...common,
      };
    }

    console.warn('devops-infra editorial start', result.selected.length);
    const builtMessages = await messages.buildMessages(result.selected);
    console.warn('devops-infra telegram send', builtMessages.length);
    await delivery.send(builtMessages);
    return {
      sent: true,
      messageCount: builtMessages.length,
      ...common,
    };
  }
}

function createDevopsInfraEditorialService(): DevopsInfraEditorialService {
  switch (env.DEVOPS_INFRA_EDITORIAL_PROVIDER) {
    case 'none':
      return new DevopsInfraEditorialService();
    case 'google':
      return new DevopsInfraEditorialService(new DevopsInfraGoogleEditorialGenerator());
    case 'openai':
      return new DevopsInfraEditorialService(new DevopsInfraOpenAIEditorialGenerator());
    default:
      return new DevopsInfraEditorialService(
        new DevopsInfraCodexEditorialGenerator(),
        new DevopsInfraGoogleEditorialGenerator(),
      );
  }
}

export function createDevopsInfraFlowService(): DevopsInfraFlowService {
  assertDevopsInfraConfigured({
    botToken: env.DEVOPS_INFRA_TELEGRAM_BOT_TOKEN,
    chatId: env.DEVOPS_INFRA_TELEGRAM_CHAT_ID,
  });

  const source = new DevopsInfraSourceService([
    new DevopsInfraRedditAdapter(),
    new DevopsInfraStackExchangeAdapter(),
    new DevopsInfraHnAdapter(),
    new DevopsInfraWebSearchAdapter(),
    new DevopsInfraXAdapter(),
    new DevopsInfraDiscordAdapter(),
    new DevopsInfraFacebookAdapter(),
  ]);
  const history = new SentHistoryStore(
    env.DEVOPS_INFRA_HISTORY_PATH,
    env.DEVOPS_INFRA_HISTORY_RETENTION_DAYS,
    () => new Date(),
    { failurePolicy: 'fail-closed' },
  );
  const selection = new DevopsInfraSelectionService(
    env.DEVOPS_INFRA_MAX_ARTICLES,
    env.DEVOPS_INFRA_MAX_INCIDENTS,
    env.DEVOPS_INFRA_MAX_AGE_HOURS,
  );
  const messages = new DevopsInfraMessageService(createDevopsInfraEditorialService());
  const telegram = createTelegramService(
    env.DEVOPS_INFRA_TELEGRAM_BOT_TOKEN,
    env.DEVOPS_INFRA_TELEGRAM_CHAT_ID,
  );
  const delivery = new DevopsInfraDeliveryService(telegram, history);
  return new DevopsInfraFlowService({ source, history, selection, messages, delivery });
}
