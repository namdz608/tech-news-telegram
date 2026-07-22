import { describe, expect, it, vi } from 'vitest';
import { GoogleArticleEditorialGenerator } from '../../src/services/google-article-editorial.generator';
import type { ArticleEditorialInput } from '../../src/services/article-editorial.types';

const input: ArticleEditorialInput = {
  title: 'Critical gateway vulnerability',
  summary: 'A gateway vulnerability is being actively exploited.',
  sourceName: 'Security Source',
  topic: 'security',
  publishedAt: '2026-07-14T09:00:00.000Z',
  collectedAt: '2026-07-15T09:00:00.000Z',
};

describe('GoogleArticleEditorialGenerator', () => {
  it('translates the title and summary while leaving analysis to deterministic fallback', async () => {
    const translator = {
      translateDigest: vi
        .fn()
        .mockResolvedValueOnce('Lỗ hổng nghiêm trọng trên gateway')
        .mockResolvedValueOnce('Một lỗ hổng gateway đang bị khai thác.'),
    };
    const generator = new GoogleArticleEditorialGenerator(translator);

    await expect(generator.generate(input)).resolves.toBe(
      JSON.stringify({
        title: 'Lỗ hổng nghiêm trọng trên gateway',
        summary: 'Một lỗ hổng gateway đang bị khai thác.',
      }),
    );
    expect(translator.translateDigest).toHaveBeenNthCalledWith(1, input.title);
    expect(translator.translateDigest).toHaveBeenNthCalledWith(2, input.summary);
  });
});
