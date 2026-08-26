import { describe, expect, it, vi } from 'vitest';
import { CodexDigestTranslator } from '../../src/services/codex-digest-translator';

describe('CodexDigestTranslator', () => {
  it('requests a Vietnamese translation while preserving protected tokens', async () => {
    const runner = { run: vi.fn().mockResolvedValue('  Bản tin công nghệ\n') };
    const translator = new CodexDigestTranslator(runner, 12345);
    const input = 'Tech digest __TNX_URL_0__';

    await expect(translator.translateDigest(input)).resolves.toBe('Bản tin công nghệ');
    expect(runner.run).toHaveBeenCalledWith(
      expect.stringContaining('tiếng Việt'),
      input,
      12345,
    );
    expect(runner.run.mock.calls[0][0]).toContain('__TNX_');
  });
});
