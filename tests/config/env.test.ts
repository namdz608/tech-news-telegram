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

describe('env config', () => {
  it('accepts the editorial provider independently', () => {
    expect(readEditorialProvider('codex')).toBe('codex');
  });

  it('defaults the editorial provider to google', () => {
    expect(readEditorialProvider()).toBe('google');
  });
});
