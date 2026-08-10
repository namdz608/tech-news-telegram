import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function readEditorialProvider(value?: string): string {
  const childEnv = { ...process.env };
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
});
