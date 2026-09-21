import { beforeEach, describe, expect, it, vi } from 'vitest';

const VALID_TOKEN = 'dummy-devops-live-token';
const VALID_CHAT = '-100000000013';

const mocks = vi.hoisted(() => {
  const ctor = (key?: string) => vi.fn(function Mock(this: Record<string, unknown>, ...args: unknown[]) {
    Object.assign(this, { key, args });
  });
  return {
    env: {
      DEVOPS_INFRA_TELEGRAM_BOT_TOKEN: 'dummy-devops-live-token',
      DEVOPS_INFRA_TELEGRAM_CHAT_ID: '-100000000013',
      DEVOPS_INFRA_HISTORY_PATH: 'data/dummy-devops-history.json',
      DEVOPS_INFRA_HISTORY_RETENTION_DAYS: 7,
      DEVOPS_INFRA_EDITORIAL_PROVIDER: 'codex',
    },
    Reddit: ctor('reddit'),
    StackExchange: ctor('stackexchange'),
    Hn: ctor('hn-search'),
    Web: ctor('web-search'),
    X: ctor('x-search'),
    Discord: ctor('discord'),
    Facebook: ctor('facebook'),
    Source: ctor(),
    History: ctor(),
    Selection: ctor(),
    Message: ctor(),
    Delivery: ctor(),
    Editorial: ctor(),
    Codex: ctor(),
    Google: ctor(),
    OpenAI: ctor(),
    telegram: vi.fn(() => ({ kind: 'telegram' })),
  };
});

vi.mock('../../src/config/env', () => ({ env: mocks.env }));
vi.mock('../../src/services/devops-infra-reddit.adapter', () => ({ DevopsInfraRedditAdapter: mocks.Reddit }));
vi.mock('../../src/services/devops-infra-stackexchange.adapter', () => ({ DevopsInfraStackExchangeAdapter: mocks.StackExchange }));
vi.mock('../../src/services/devops-infra-hn.adapter', () => ({ DevopsInfraHnAdapter: mocks.Hn }));
vi.mock('../../src/services/devops-infra-web-search.adapter', () => ({ DevopsInfraWebSearchAdapter: mocks.Web }));
vi.mock('../../src/services/devops-infra-x.adapter', () => ({ DevopsInfraXAdapter: mocks.X }));
vi.mock('../../src/services/devops-infra-discord.adapter', () => ({ DevopsInfraDiscordAdapter: mocks.Discord }));
vi.mock('../../src/services/devops-infra-facebook.adapter', () => ({ DevopsInfraFacebookAdapter: mocks.Facebook }));
vi.mock('../../src/services/devops-infra-source.service', () => ({ DevopsInfraSourceService: mocks.Source }));
vi.mock('../../src/services/sent-history.store', () => ({ SentHistoryStore: mocks.History }));
vi.mock('../../src/services/devops-infra-selection.service', () => ({ DevopsInfraSelectionService: mocks.Selection }));
vi.mock('../../src/services/devops-infra-message.service', () => ({ DevopsInfraMessageService: mocks.Message }));
vi.mock('../../src/services/devops-infra-delivery.service', () => ({ DevopsInfraDeliveryService: mocks.Delivery }));
vi.mock('../../src/services/devops-infra-editorial.service', () => ({ DevopsInfraEditorialService: mocks.Editorial }));
vi.mock('../../src/services/devops-infra-codex-editorial.generator', () => ({ DevopsInfraCodexEditorialGenerator: mocks.Codex }));
vi.mock('../../src/services/devops-infra-google-editorial.generator', () => ({ DevopsInfraGoogleEditorialGenerator: mocks.Google }));
vi.mock('../../src/services/devops-infra-openai-editorial.generator', () => ({ DevopsInfraOpenAIEditorialGenerator: mocks.OpenAI }));
vi.mock('../../src/services/telegram.service', () => ({ createTelegramService: mocks.telegram }));

const constructors = [
  mocks.Reddit, mocks.StackExchange, mocks.Hn, mocks.Web, mocks.X, mocks.Discord,
  mocks.Facebook, mocks.Source, mocks.History, mocks.Selection, mocks.Message,
  mocks.Delivery, mocks.Editorial, mocks.Codex, mocks.Google, mocks.OpenAI,
  mocks.telegram,
];

async function loadModule() {
  vi.resetModules();
  constructors.forEach((mock) => mock.mockClear());
  return import('../../src/services/devops-infra-flow.service');
}

describe('createDevopsInfraFlowService', () => {
  beforeEach(() => {
    mocks.env.DEVOPS_INFRA_TELEGRAM_BOT_TOKEN = VALID_TOKEN;
    mocks.env.DEVOPS_INFRA_TELEGRAM_CHAT_ID = VALID_CHAT;
    mocks.env.DEVOPS_INFRA_EDITORIAL_PROVIDER = 'codex';
  });

  it('constructs nothing on module import', async () => {
    await loadModule();
    constructors.forEach((mock) => expect(mock).not.toHaveBeenCalled());
  });

  it.each([
    ['', VALID_CHAT],
    ['  ', VALID_CHAT],
    ['test-devops-infra-token', VALID_CHAT],
    ['TEST-DEVOPS-INFRA-TOKEN', VALID_CHAT],
    ['replace_me', VALID_CHAT],
    [VALID_TOKEN, ''],
    [VALID_TOKEN, 'test-devops-infra-chat-id'],
    [VALID_TOKEN, 'TEST-DEVOPS-INFRA-CHAT-ID'],
    [VALID_TOKEN, 'REPLACE_ME'],
  ])('rejects unsafe Telegram configuration before construction %#', async (token, chatId) => {
    mocks.env.DEVOPS_INFRA_TELEGRAM_BOT_TOKEN = token;
    mocks.env.DEVOPS_INFRA_TELEGRAM_CHAT_ID = chatId;
    const module = await loadModule();
    const error = (() => {
      try {
        module.createDevopsInfraFlowService();
      } catch (value) {
        return value;
      }
    })();

    expect(error).toBeInstanceOf(module.DevopsInfraFlowError);
    expect(error).toMatchObject({ code: 'telegram-not-configured', message: 'telegram-not-configured' });
    expect((error as Error).cause).toBeUndefined();
    if (token.trim()) expect(String(error)).not.toContain(token.trim());
    if (chatId.trim()) expect(String(error)).not.toContain(chatId.trim());
    constructors.forEach((mock) => expect(mock).not.toHaveBeenCalled());
  });

  it('wires adapters, fail-closed history, editorial, and Telegram exactly', async () => {
    const module = await loadModule();
    expect(module.createDevopsInfraFlowService()).toBeInstanceOf(module.DevopsInfraFlowService);

    const adapters = mocks.Source.mock.calls[0][0] as Array<{ key: string }>;
    expect(adapters.map(({ key }) => key)).toEqual([
      'reddit', 'stackexchange', 'hn-search', 'web-search', 'x-search', 'discord', 'facebook',
    ]);
    expect(mocks.History).toHaveBeenCalledWith(
      mocks.env.DEVOPS_INFRA_HISTORY_PATH,
      mocks.env.DEVOPS_INFRA_HISTORY_RETENTION_DAYS,
      expect.any(Function),
      { failurePolicy: 'fail-closed' },
    );
    expect(mocks.Editorial).toHaveBeenCalledWith(
      mocks.Codex.mock.results[0].value,
      mocks.Google.mock.results[0].value,
    );
    expect(mocks.Message).toHaveBeenCalledWith(mocks.Editorial.mock.results[0].value);
    expect(mocks.telegram).toHaveBeenCalledWith(VALID_TOKEN, VALID_CHAT);
    expect(mocks.Delivery).toHaveBeenCalledWith(
      mocks.telegram.mock.results[0].value,
      mocks.History.mock.results[0].value,
    );
  });

  it.each([
    ['none', 0, 0, 0],
    ['google', 0, 1, 0],
    ['openai', 0, 0, 1],
  ])('uses the exact %s editorial switch', async (provider, codexCalls, googleCalls, openaiCalls) => {
    mocks.env.DEVOPS_INFRA_EDITORIAL_PROVIDER = provider;
    const module = await loadModule();
    module.createDevopsInfraFlowService();
    expect(mocks.Codex).toHaveBeenCalledTimes(codexCalls);
    expect(mocks.Google).toHaveBeenCalledTimes(googleCalls);
    expect(mocks.OpenAI).toHaveBeenCalledTimes(openaiCalls);
  });
});
