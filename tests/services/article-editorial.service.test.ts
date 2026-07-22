import { describe, expect, it, vi } from 'vitest';
import { ArticleEditorialService } from '../../src/services/article-editorial.service';

const article = {
  id: 'https://example.com/cve',
  sourceId: 'security-source',
  sourceName: 'Security Source',
  title: 'Critical gateway vulnerability',
  url: 'https://example.com/cve',
  summary: 'A gateway vulnerability is being actively exploited.',
  publishedAt: '2026-07-14T09:00:00.000Z',
  collectedAt: '2026-07-15T09:00:00.000Z',
  topics: ['security' as const],
};

describe('ArticleEditorialService', () => {
  it('accepts a complete structured editorial response', async () => {
    const generator = {
      generate: vi.fn().mockResolvedValue(
        JSON.stringify({
          title: 'Lỗ hổng nghiêm trọng trên gateway',
          summary: 'Lỗ hổng đang bị khai thác thực tế.',
          whyImportant: 'Gateway thường được mở trực tiếp ra Internet.',
          actionLevel: 'urgent',
          actionText: 'Kiểm tra phơi nhiễm và vá ngay.',
        }),
      ),
    };

    await expect(new ArticleEditorialService(generator).editArticle(article, 'security')).resolves.toEqual({
      title: 'Lỗ hổng nghiêm trọng trên gateway',
      summary: 'Lỗ hổng đang bị khai thác thực tế.',
      whyImportant: 'Gateway thường được mở trực tiếp ra Internet.',
      actionLevel: 'urgent',
      actionText: 'Kiểm tra phơi nhiễm và vá ngay.',
    });
  });

  it.each(['not json', '{"summary":"","actionLevel":"critical"}'])(
    'fills every field from fallback for %s',
    async (output) => {
      const service = new ArticleEditorialService({ generate: vi.fn().mockResolvedValue(output) });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      try {
        const result = await service.editArticle(article, 'security');

        expect(result.title).toBeTruthy();
        expect(result.summary).toBeTruthy();
        expect(result.whyImportant).toBeTruthy();
        expect(result.actionLevel).toBe('monitor');
        expect(result.actionText).toBeTruthy();
      } finally {
        warn.mockRestore();
      }
    },
  );

  it('uses fallback when the generator fails', async () => {
    const service = new ArticleEditorialService({ generate: vi.fn().mockRejectedValue(new Error('timeout')) });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await expect(service.editArticle(article, 'security')).resolves.toMatchObject({
        title: article.title,
        summary: article.summary,
        actionLevel: 'monitor',
      });
    } finally {
      warn.mockRestore();
    }
  });
});
