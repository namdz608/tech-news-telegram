import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('ESLint config', () => {
  it('lints a TypeScript source file with the project flat config', () => {
    const result = spawnSync(
      process.execPath,
      ['./node_modules/eslint/bin/eslint.js', 'src/config/env.ts'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
