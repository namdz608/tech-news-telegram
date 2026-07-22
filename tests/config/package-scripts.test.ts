import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('package scripts', () => {
  it('uses polling for the dev watcher when inotify instances are exhausted', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.dev).toBe('CHOKIDAR_USEPOLLING=1 tsx watch src/server.ts');
  });
});
