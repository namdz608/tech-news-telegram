import { describe, expect, it, vi } from 'vitest';
import { CodexArticleEditorialGenerator } from '../../src/services/codex-article-editorial.generator';
import type { ArticleEditorialInput } from '../../src/services/article-editorial.types';

const input: ArticleEditorialInput = {
  title: 'Critical gateway vulnerability',
  summary: 'A gateway vulnerability is being actively exploited.',
  sourceName: 'Security Source',
  topic: 'security',
  publishedAt: '2026-07-14T09:00:00.000Z',
  collectedAt: '2026-07-15T09:00:00.000Z',
};

describe('CodexArticleEditorialGenerator', () => {
  it('requests JSON-only Vietnamese editorial content', async () => {
    const runner = { run: vi.fn().mockResolvedValue('{"title":"Tin"}') };
    const generator = new CodexArticleEditorialGenerator(runner, 12345);

    await expect(generator.generate(input)).resolves.toBe('{"title":"Tin"}');
    expect(runner.run).toHaveBeenCalledWith(
      expect.stringContaining('actionLevel'),
      JSON.stringify(input),
      12345,
    );
    expect(runner.run.mock.calls[0][0]).toContain('Không bịa');
  });
});
