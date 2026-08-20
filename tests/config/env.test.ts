import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function readEditorialProvider(value?: string): string {
  const childEnv = { ...process.env };
  childEnv.DOTENV_CONFIG_PATH = '/dev/null';
  delete childEnv.EDITORIAL_PROVIDER;

  if (value) {
    childEnv.EDITORIAL_PROVIDER = value;
  }

  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--eval',
      "import { env } from './src/config/env.ts'; process.stdout.write(env.EDITORIAL_PROVIDER)",
    ],
    { cwd: process.cwd(), env: childEnv, encoding: 'utf8' },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr);
  }

  return result.stdout;
}

function readEnvValues(keys: string[]): Record<string, unknown> {
  const childEnv = { ...process.env };
  childEnv.DOTENV_CONFIG_PATH = '/dev/null';
  for (const key of keys) {
    delete childEnv[key];
  }

  const script = [
    "import { env } from './src/config/env.ts';",
    `const keys = ${JSON.stringify(keys)};`,
    'process.stdout.write(JSON.stringify(Object.fromEntries(keys.map((key) => [key, env[key as keyof typeof env]]))));',
  ].join(' ');
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--eval', script], {
    cwd: process.cwd(),
    env: childEnv,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr);
  }

  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function runEnv(overrides: Record<string, string>, keys: string[] = []): ReturnType<typeof spawnSync> {
  const childEnv = { ...process.env };
  childEnv.DOTENV_CONFIG_PATH = '/dev/null';
  for (const key of keys) {
    delete childEnv[key];
  }
  Object.assign(childEnv, overrides);

  const script = [
    "import { env } from './src/config/env.ts';",
    `const keys = ${JSON.stringify(keys)};`,
    'process.stdout.write(JSON.stringify(Object.fromEntries(keys.map((key) => [key, env[key as keyof typeof env]]))));',
  ].join(' ');
  return spawnSync(process.execPath, ['--import', 'tsx', '--eval', script], {
    cwd: process.cwd(),
    env: childEnv,
    encoding: 'utf8',
  });
}

describe('env config', () => {
  it('accepts the editorial provider independently', () => {
    expect(readEditorialProvider('codex')).toBe('codex');
  });

  it('defaults the editorial provider to google', () => {
    expect(readEditorialProvider()).toBe('google');
  });

  it('provides isolated gadget defaults', () => {
    expect(
      readEnvValues([
        'GADGET_TELEGRAM_BOT_TOKEN',
        'GADGET_TELEGRAM_CHAT_ID',
        'GADGET_MAX_ARTICLES',
        'GADGET_HISTORY_RETENTION_DAYS',
        'GADGET_HISTORY_PATH',
      ]),
    ).toEqual({
      GADGET_TELEGRAM_BOT_TOKEN: 'test-gadget-token',
      GADGET_TELEGRAM_CHAT_ID: 'test-gadget-chat-id',
      GADGET_MAX_ARTICLES: 12,
      GADGET_HISTORY_RETENTION_DAYS: 30,
      GADGET_HISTORY_PATH: 'data/gadget-sent-history.json',
    });
  });

  it('provides isolated health defaults', () => {
    expect(
      readEnvValues([
        'HEALTH_TELEGRAM_BOT_TOKEN',
        'HEALTH_TELEGRAM_CHAT_ID',
        'HEALTH_MAX_ARTICLES',
        'HEALTH_HISTORY_RETENTION_DAYS',
        'HEALTH_HISTORY_PATH',
      ]),
    ).toEqual({
      HEALTH_TELEGRAM_BOT_TOKEN: 'test-health-token',
      HEALTH_TELEGRAM_CHAT_ID: 'test-health-chat-id',
      HEALTH_MAX_ARTICLES: 12,
      HEALTH_HISTORY_RETENTION_DAYS: 7,
      HEALTH_HISTORY_PATH: 'data/health-sent-history.json',
    });
  });

  it('provides isolated gold-politics defaults', () => {
    expect(
      readEnvValues([
        'GOLD_POLITICS_TELEGRAM_BOT_TOKEN',
        'GOLD_POLITICS_TELEGRAM_CHAT_ID',
        'GOLD_POLITICS_MAX_ARTICLES',
        'GOLD_POLITICS_MAX_GOLD_NEWS',
        'GOLD_POLITICS_MAX_AGE_HOURS',
        'GOLD_POLITICS_MAX_PRICE_AGE_MINUTES',
        'GOLD_POLITICS_HISTORY_RETENTION_DAYS',
        'GOLD_POLITICS_HISTORY_PATH',
        'GOLD_PRICE_HISTORY_PATH',
        'GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES',
        'BRAVE_SEARCH_API_KEY',
        'GOLD_SPOT_API_URL',
      ]),
    ).toEqual({
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
      BRAVE_SEARCH_API_KEY: '',
      GOLD_SPOT_API_URL: 'https://api.gold-api.com/price/XAU',
    });
  });

  it('coerces gold-politics numeric strings and caps gold news by total articles', () => {
    const keys = [
      'GOLD_POLITICS_MAX_ARTICLES',
      'GOLD_POLITICS_MAX_GOLD_NEWS',
      'GOLD_POLITICS_MAX_AGE_HOURS',
      'GOLD_POLITICS_MAX_PRICE_AGE_MINUTES',
      'GOLD_POLITICS_HISTORY_RETENTION_DAYS',
      'GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES',
    ];
    const result = runEnv(
      {
        GOLD_POLITICS_MAX_ARTICLES: '2',
        GOLD_POLITICS_MAX_GOLD_NEWS: '3',
        GOLD_POLITICS_MAX_AGE_HOURS: '24',
        GOLD_POLITICS_MAX_PRICE_AGE_MINUTES: '30',
        GOLD_POLITICS_HISTORY_RETENTION_DAYS: '9',
        GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES: '0',
      },
      keys,
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      GOLD_POLITICS_MAX_ARTICLES: 2,
      GOLD_POLITICS_MAX_GOLD_NEWS: 2,
      GOLD_POLITICS_MAX_AGE_HOURS: 24,
      GOLD_POLITICS_MAX_PRICE_AGE_MINUTES: 30,
      GOLD_POLITICS_HISTORY_RETENTION_DAYS: 9,
      GOLD_POLITICS_WEB_SEARCH_MAX_QUERIES: 0,
    });
  });

  it.each(['0', '1', '16'])('rejects article count %s', (value) => {
    expect(runEnv({ GOLD_POLITICS_MAX_ARTICLES: value }).status).not.toBe(0);
  });

  it.each(['-1', '4'])('rejects gold-news count %s', (value) => {
    expect(runEnv({ GOLD_POLITICS_MAX_GOLD_NEWS: value }).status).not.toBe(0);
  });

  it.each(['GOLD_POLITICS_HISTORY_PATH', 'GOLD_PRICE_HISTORY_PATH'])(
    'rejects an empty %s',
    (key) => {
      expect(runEnv({ [key]: '' }).status).not.toBe(0);
    },
  );

  it.each([
    'ftp://api.gold.example/price/XAU',
    'https://user@api.gold.example/price/XAU',
    'https://user:secret@api.gold.example/price/XAU',
  ])('rejects unsafe gold spot URL %s', (value) => {
    expect(runEnv({ GOLD_SPOT_API_URL: value }).status).not.toBe(0);
  });
});
