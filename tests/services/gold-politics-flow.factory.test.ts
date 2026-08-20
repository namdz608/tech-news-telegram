import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goldPoliticsRssSources } from '../../src/config/gold-politics-sources';

const VALID_TOKEN = 'gold-politics-live-bot-token';
const VALID_CHAT = '-100999888777';

const {
  envState,
  SjcGoldPriceAdapter,
  DojiGoldPriceAdapter,
  PnjGoldPriceAdapter,
  XauUsdGoldPriceAdapter,
  GoldPriceHistoryStore,
  GoldPriceService,
  PoliticsRssAdapter,
  PoliticsXAdapter,
  RedditSearchAdapter,
  BraveWebSearchProvider,
  PoliticsWebSearchAdapter,
  SafeWebRetrievalService,
  PoliticsSourceService,
  PoliticsSelectionService,
  PoliticsEditorialService,
  GoldPoliticsMessageService,
  SentHistoryStore,
  createTelegramService,
  GoldPoliticsDeliveryService,
  Telegraf,
  axiosCreate,
} = vi.hoisted(() => {
  function mockCtor(label: string, extras: (args: unknown[]) => Record<string, unknown> = () => ({})) {
    return vi.fn(function MockCtor(this: Record<string, unknown>, ...args: unknown[]) {
      Object.assign(this, { __label: label, __args: args, ...extras(args) });
      return this;
    });
  }

  const envState = {
    GOLD_POLITICS_TELEGRAM_BOT_TOKEN: 'test-gold-politics-token',
    GOLD_POLITICS_TELEGRAM_CHAT_ID: 'test-gold-politics-chat-id',
    GOLD_POLITICS_MAX_ARTICLES: 15,
    GOLD_POLITICS_MAX_GOLD_NEWS: 3,
    GOLD_POLITICS_MAX_AGE_HOURS: 72,
    GOLD_POLITICS_MAX_PRICE_AGE_MINUTES: 60,
    GOLD_POLITICS_HISTORY_RETENTION_DAYS: 7,
    GOLD_POLITICS_HISTORY_PATH: 'data/gold-politics-sent-history.json',
    GOLD_PRICE_HISTORY_PATH: 'data/gold-price-history.json',
    GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES: 8,
    X_BEARER_TOKEN: '',
    BRAVE_SEARCH_API_KEY: '',
  };

  return {
    envState,
    SjcGoldPriceAdapter: mockCtor('sjc', () => ({ source: { providerKey: 'sjc' } })),
    DojiGoldPriceAdapter: mockCtor('doji', () => ({ source: { providerKey: 'doji' } })),
    PnjGoldPriceAdapter: mockCtor('pnj', () => ({ source: { providerKey: 'pnj' } })),
    XauUsdGoldPriceAdapter: mockCtor('xau-usd', () => ({ source: { providerKey: 'xau-usd' } })),
    GoldPriceHistoryStore: mockCtor('gold-price-history'),
    GoldPriceService: mockCtor('gold-price-service'),
    PoliticsRssAdapter: mockCtor('politics-rss', (args) => {
      const source = args[0] as { id: string; enabled: boolean };
      return { key: source.id, isEnabled: () => source.enabled };
    }),
    PoliticsXAdapter: mockCtor('x-search', () => ({
      key: 'x-search',
      isEnabled: () => envState.X_BEARER_TOKEN.trim() !== '',
    })),
    RedditSearchAdapter: mockCtor('reddit-search', () => ({
      key: 'reddit-search',
      isEnabled: () => true,
    })),
    BraveWebSearchProvider: mockCtor('brave-search', () => ({
      key: 'brave-search',
      isEnabled: () => envState.BRAVE_SEARCH_API_KEY.trim() !== '',
    })),
    PoliticsWebSearchAdapter: mockCtor('web-search', () => ({
      key: 'web-search',
      isEnabled: () => envState.BRAVE_SEARCH_API_KEY.trim() !== '' && envState.GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES > 0,
    })),
    SafeWebRetrievalService: mockCtor('safe-web-retrieval'),
    PoliticsSourceService: mockCtor('politics-source'),
    PoliticsSelectionService: mockCtor('politics-selection'),
    PoliticsEditorialService: mockCtor('politics-editorial'),
    GoldPoliticsMessageService: mockCtor('gold-politics-messages'),
    SentHistoryStore: mockCtor('sent-history'),
    createTelegramService: vi.fn(() => ({ __label: 'telegram' })),
    GoldPoliticsDeliveryService: mockCtor('gold-politics-delivery'),
    Telegraf: vi.fn(),
    axiosCreate: vi.fn(),
  };
});

vi.mock('../../src/config/env', () => ({ env: envState }));
vi.mock('../../src/services/gold-price/sjc.adapter', () => ({ SjcGoldPriceAdapter }));
vi.mock('../../src/services/gold-price/doji.adapter', () => ({ DojiGoldPriceAdapter }));
vi.mock('../../src/services/gold-price/pnj.adapter', () => ({ PnjGoldPriceAdapter }));
vi.mock('../../src/services/gold-price/xau-usd.adapter', () => ({ XauUsdGoldPriceAdapter }));
vi.mock('../../src/services/gold-price-history.store', () => ({ GoldPriceHistoryStore }));
vi.mock('../../src/services/gold-price.service', () => ({ GoldPriceService }));
vi.mock('../../src/services/politics-rss.adapter', () => ({ PoliticsRssAdapter }));
vi.mock('../../src/services/politics-x.adapter', () => ({ PoliticsXAdapter }));
vi.mock('../../src/services/reddit-search.adapter', () => ({ RedditSearchAdapter }));
vi.mock('../../src/services/brave-web-search.provider', () => ({ BraveWebSearchProvider }));
vi.mock('../../src/services/politics-web-search.adapter', () => ({ PoliticsWebSearchAdapter }));
vi.mock('../../src/services/safe-web-retrieval.service', () => ({ SafeWebRetrievalService }));
vi.mock('../../src/services/politics-source.service', () => ({ PoliticsSourceService }));
vi.mock('../../src/services/politics-selection.service', () => ({ PoliticsSelectionService }));
vi.mock('../../src/services/politics-editorial.service', () => ({ PoliticsEditorialService }));
vi.mock('../../src/services/gold-politics-message.service', () => ({ GoldPoliticsMessageService }));
vi.mock('../../src/services/sent-history.store', () => ({ SentHistoryStore }));
vi.mock('../../src/services/telegram.service', () => ({ createTelegramService }));
vi.mock('../../src/services/gold-politics-delivery.service', () => ({ GoldPoliticsDeliveryService }));
vi.mock('telegraf', () => ({ Telegraf }));
vi.mock('axios', () => ({ default: { create: axiosCreate }, create: axiosCreate }));

const compositionMocks = [
  SjcGoldPriceAdapter,
  DojiGoldPriceAdapter,
  PnjGoldPriceAdapter,
  XauUsdGoldPriceAdapter,
  GoldPriceHistoryStore,
  GoldPriceService,
  PoliticsRssAdapter,
  PoliticsXAdapter,
  RedditSearchAdapter,
  BraveWebSearchProvider,
  PoliticsWebSearchAdapter,
  SafeWebRetrievalService,
  PoliticsSourceService,
  PoliticsSelectionService,
  PoliticsEditorialService,
  GoldPoliticsMessageService,
  SentHistoryStore,
  createTelegramService,
  GoldPoliticsDeliveryService,
  Telegraf,
  axiosCreate,
] as const;

function resetEnv(): void {
  envState.GOLD_POLITICS_TELEGRAM_BOT_TOKEN = 'test-gold-politics-token';
  envState.GOLD_POLITICS_TELEGRAM_CHAT_ID = 'test-gold-politics-chat-id';
  envState.GOLD_POLITICS_MAX_ARTICLES = 15;
  envState.GOLD_POLITICS_MAX_GOLD_NEWS = 3;
  envState.GOLD_POLITICS_MAX_AGE_HOURS = 72;
  envState.GOLD_POLITICS_MAX_PRICE_AGE_MINUTES = 60;
  envState.GOLD_POLITICS_HISTORY_RETENTION_DAYS = 7;
  envState.GOLD_POLITICS_HISTORY_PATH = 'data/gold-politics-sent-history.json';
  envState.GOLD_PRICE_HISTORY_PATH = 'data/gold-price-history.json';
  envState.GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES = 8;
  envState.X_BEARER_TOKEN = '';
  envState.BRAVE_SEARCH_API_KEY = '';
}

function useLiveCredentials(): void {
  envState.GOLD_POLITICS_TELEGRAM_BOT_TOKEN = VALID_TOKEN;
  envState.GOLD_POLITICS_TELEGRAM_CHAT_ID = VALID_CHAT;
}

function leakSurface(value: unknown): string {
  return [
    JSON.stringify(value),
    String(value),
    value instanceof Error ? value.message : '',
    value instanceof Error ? value.stack ?? '' : '',
  ].join('\n');
}

async function loadFlowModule() {
  vi.resetModules();
  for (const mock of compositionMocks) mock.mockClear();
  return import('../../src/services/gold-politics-flow.service');
}

describe('createGoldPoliticsFlowService', () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    resetEnv();
  });

  it('creates no clients and makes no network call on module import', async () => {
    await loadFlowModule();
    for (const mock of compositionMocks) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it.each([
    { botToken: '', chatId: VALID_CHAT },
    { botToken: '   ', chatId: VALID_CHAT },
    { botToken: VALID_TOKEN, chatId: '' },
    { botToken: VALID_TOKEN, chatId: '\t' },
    { botToken: 'test-gold-politics-token', chatId: VALID_CHAT },
    { botToken: 'TEST-GOLD-POLITICS-TOKEN', chatId: VALID_CHAT },
    { botToken: VALID_TOKEN, chatId: 'test-gold-politics-chat-id' },
    { botToken: VALID_TOKEN, chatId: 'Test-Gold-Politics-Chat-Id' },
    { botToken: 'replace_me', chatId: VALID_CHAT },
    { botToken: VALID_TOKEN, chatId: 'REPLACE_ME' },
  ])('rejects placeholder or empty delivery config before constructing dependencies %#', async ({ botToken, chatId }) => {
    envState.GOLD_POLITICS_TELEGRAM_BOT_TOKEN = botToken;
    envState.GOLD_POLITICS_TELEGRAM_CHAT_ID = chatId;
    const module = await loadFlowModule();
    const error = (() => {
      try {
        module.createGoldPoliticsFlowService();
        return undefined;
      } catch (thrown) {
        return thrown;
      }
    })();

    expect(error).toBeInstanceOf(module.GoldPoliticsFlowError);
    expect(error).toMatchObject({
      name: 'GoldPoliticsFlowError',
      code: 'telegram-not-configured',
      message: 'telegram-not-configured',
    });
    expect((error as Error).cause).toBeUndefined();
    const surface = leakSurface(error);
    if (botToken.trim()) expect(surface).not.toContain(botToken.trim());
    if (chatId.trim()) expect(surface).not.toContain(chatId.trim());
    expect(surface).not.toContain(VALID_TOKEN);
    expect(surface).not.toContain(VALID_CHAT);
    for (const mock of compositionMocks) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it('composes dedicated Telegram credentials, disabled effect, histories, adapters, and caps', async () => {
    useLiveCredentials();
    envState.GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES = 5;
    envState.GOLD_POLITICS_MAX_ARTICLES = 10;
    envState.GOLD_POLITICS_MAX_GOLD_NEWS = 3;
    const module = await loadFlowModule();

    const service = module.createGoldPoliticsFlowService();
    expect(service).toBeInstanceOf(module.GoldPoliticsFlowService);

    expect(SjcGoldPriceAdapter).toHaveBeenCalledOnce();
    expect(DojiGoldPriceAdapter).toHaveBeenCalledOnce();
    expect(PnjGoldPriceAdapter).toHaveBeenCalledOnce();
    expect(XauUsdGoldPriceAdapter).toHaveBeenCalledOnce();
    const priceAdapters = GoldPriceService.mock.calls[0]?.[0] as Array<{ source: { providerKey: string } }>;
    expect(priceAdapters.map((adapter) => adapter.source.providerKey)).toEqual([
      'sjc',
      'doji',
      'pnj',
      'xau-usd',
    ]);
    expect(GoldPriceHistoryStore).toHaveBeenCalledWith(envState.GOLD_PRICE_HISTORY_PATH);
    expect(GoldPriceService.mock.calls[0]?.[1]).toBe(GoldPriceHistoryStore.mock.results[0]?.value);

    expect(PoliticsRssAdapter).toHaveBeenCalledTimes(17);
    expect(PoliticsRssAdapter.mock.calls.map((call) => call[0])).toEqual(goldPoliticsRssSources);
    expect(PoliticsXAdapter).toHaveBeenCalledOnce();
    expect(RedditSearchAdapter).toHaveBeenCalledOnce();
    expect(BraveWebSearchProvider).toHaveBeenCalledOnce();
    expect(SafeWebRetrievalService).toHaveBeenCalledOnce();
    expect(PoliticsWebSearchAdapter).toHaveBeenCalledWith(
      BraveWebSearchProvider.mock.results[0]?.value,
      SafeWebRetrievalService.mock.results[0]?.value,
      expect.any(Function),
      5,
    );

    const newsAdapters = PoliticsSourceService.mock.calls[0]?.[0] as Array<{ key: string }>;
    expect(newsAdapters.map((adapter) => adapter.key)).toEqual([
      ...goldPoliticsRssSources.map((source) => source.id),
      'x-search',
      'reddit-search',
      'web-search',
    ]);
    expect(newsAdapters.some((adapter) => /final-record/i.test(adapter.key))).toBe(false);
    expect(PoliticsXAdapter.mock.results[0]?.value).toMatchObject({ key: 'x-search' });
    expect((PoliticsXAdapter.mock.results[0]?.value as { isEnabled: () => boolean }).isEnabled()).toBe(false);
    expect((BraveWebSearchProvider.mock.results[0]?.value as { isEnabled: () => boolean }).isEnabled()).toBe(false);

    expect(PoliticsSourceService.mock.calls[0]?.[1]).toBe(envState.GOLD_POLITICS_MAX_AGE_HOURS);
    expect(PoliticsSelectionService.mock.calls[0]?.[3]).toEqual({
      maxArticles: 10,
      maxGoldNews: 3,
      maxPerSource: 3,
    });
    expect(GoldPoliticsMessageService).toHaveBeenCalledWith(PoliticsEditorialService.mock.results[0]?.value);
    expect(SentHistoryStore).toHaveBeenCalledWith(
      envState.GOLD_POLITICS_HISTORY_PATH,
      envState.GOLD_POLITICS_HISTORY_RETENTION_DAYS,
      expect.any(Function),
      { failurePolicy: 'fail-closed' },
    );
    expect(createTelegramService).toHaveBeenCalledWith(VALID_TOKEN, VALID_CHAT, { messageEffectId: '' });
    expect(GoldPoliticsDeliveryService).toHaveBeenCalledWith(
      createTelegramService.mock.results[0]?.value,
      SentHistoryStore.mock.results[0]?.value,
    );
    expect(Telegraf).not.toHaveBeenCalled();
    expect(axiosCreate).not.toHaveBeenCalled();
  });

  it('wires optional X and Brave when credentials are present', async () => {
    useLiveCredentials();
    envState.X_BEARER_TOKEN = 'x-live-token';
    envState.BRAVE_SEARCH_API_KEY = 'brave-live-key';
    await loadFlowModule().then((module) => module.createGoldPoliticsFlowService());

    expect((PoliticsXAdapter.mock.results[0]?.value as { isEnabled: () => boolean }).isEnabled()).toBe(true);
    expect((BraveWebSearchProvider.mock.results[0]?.value as { isEnabled: () => boolean }).isEnabled()).toBe(true);
    expect((PoliticsWebSearchAdapter.mock.results[0]?.value as { isEnabled: () => boolean }).isEnabled()).toBe(true);
  });

  it('restricts every wired V1 news adapter to non-establishes effects and omits a final-record adapter', () => {
    const adapterDir = join(__dirname, '../../src/services');
    for (const file of [
      'politics-rss.adapter.ts',
      'politics-x.adapter.ts',
      'reddit-search.adapter.ts',
      'politics-web-search.adapter.ts',
    ]) {
      const source = readFileSync(join(adapterDir, file), 'utf8');
      expect(source).not.toMatch(/evidentiaryEffect:\s*'establishes'/);
      expect(source).not.toMatch(/final-record/i);
    }
  });
});

describe('assertGoldPoliticsConfigured', () => {
  it('never prints the rejected bot or chat value', async () => {
    const { assertGoldPoliticsConfigured, GoldPoliticsFlowError } = await loadFlowModule();
    const error = (() => {
      try {
        assertGoldPoliticsConfigured({
          botToken: `  ${VALID_TOKEN}  `,
          chatId: 'replace_me',
        });
        return undefined;
      } catch (thrown) {
        return thrown;
      }
    })();
    expect(error).toBeInstanceOf(GoldPoliticsFlowError);
    expect(leakSurface(error)).not.toContain(VALID_TOKEN);
    expect(leakSurface(error)).not.toContain('replace_me');
  });
});
