import { describe, expect, it, vi } from 'vitest';
import {
  ArticleEditorialService,
  createArticleEditorialGenerator,
} from '../../src/services/article-editorial.service';
import { verifiedVietnameseEditorial } from '../../src/services/article-editorial.types';
import { CodexArticleEditorialGenerator } from '../../src/services/codex-article-editorial.generator';
import { GoogleArticleEditorialGenerator } from '../../src/services/google-article-editorial.generator';

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
  it('selects Codex independently from the global editorial provider', () => {
    expect(createArticleEditorialGenerator('codex')).toBeInstanceOf(
      CodexArticleEditorialGenerator,
    );
    expect(createArticleEditorialGenerator('google')).toBeInstanceOf(
      GoogleArticleEditorialGenerator,
    );
    expect(createArticleEditorialGenerator('none')).toBeUndefined();
  });

  it('accepts structured editorial fields but does not trust a JSON verification flag', async () => {
    const generator = {
      generate: vi.fn().mockResolvedValue(
        JSON.stringify({
          title: 'Lỗ hổng nghiêm trọng trên gateway',
          summary: 'Lỗ hổng đang bị khai thác thực tế.',
          whyImportant: 'Gateway thường được mở trực tiếp ra Internet.',
          actionLevel: 'urgent',
          actionText: 'Kiểm tra phơi nhiễm và vá ngay.',
          languageVerified: true,
        }),
      ),
    };

    const result = await new ArticleEditorialService(generator).editArticle(article, 'security');

    expect(result).toEqual({
      title: 'Lỗ hổng nghiêm trọng trên gateway',
      summary: 'Lỗ hổng đang bị khai thác thực tế.',
      whyImportant: 'Gateway thường được mở trực tiếp ra Internet.',
      actionLevel: 'urgent',
      actionText: 'Kiểm tra phơi nhiễm và vá ngay.',
    });
    expect(result[verifiedVietnameseEditorial]).toBeUndefined();
  });

  it('edits multiple articles with one batch generator call', async () => {
    const secondArticle = { ...article, id: 'second', title: 'Second article' };
    const generator = {
      generate: vi.fn(),
      generateBatch: vi.fn().mockResolvedValue(JSON.stringify([
        {
          title: 'Tin thứ nhất',
          summary: 'Tóm tắt thứ nhất',
          whyImportant: 'Lý do thứ nhất',
          actionLevel: 'high',
          actionText: 'Xử lý thứ nhất',
        },
        {
          title: 'Tin thứ hai',
          summary: 'Tóm tắt thứ hai',
          whyImportant: 'Lý do thứ hai',
          actionLevel: 'monitor',
          actionText: 'Theo dõi thứ hai',
        },
      ])),
    };

    const result = await new ArticleEditorialService(generator).editArticles([
      { article, topic: 'security' },
      { article: secondArticle, topic: 'ai' },
    ]);

    expect(generator.generateBatch).toHaveBeenCalledTimes(1);
    expect(generator.generate).not.toHaveBeenCalled();
    expect(result.map((item) => item.title)).toEqual(['Tin thứ nhất', 'Tin thứ hai']);
    expect(generator.generateBatch).toHaveBeenCalledWith([
      expect.objectContaining({ title: article.title, topic: 'security' }),
      expect.objectContaining({ title: secondArticle.title, topic: 'ai' }),
    ]);
  });

  it('falls back only the malformed item in an otherwise valid batch', async () => {
    const secondArticle = { ...article, id: 'second', title: 'Second article' };
    const generator = {
      generate: vi.fn(),
      generateBatch: vi.fn().mockResolvedValue(JSON.stringify([
        {
          title: 'Tin hợp lệ',
          summary: 'Tóm tắt hợp lệ',
          whyImportant: 'Lý do hợp lệ',
          actionLevel: 'urgent',
          actionText: 'Xử lý ngay',
        },
        null,
      ])),
    };

    await expect(new ArticleEditorialService(generator).editArticles([
      { article, topic: 'security' },
      { article: secondArticle, topic: 'ai' },
    ])).resolves.toEqual([
      expect.objectContaining({ title: 'Tin hợp lệ', actionLevel: 'urgent' }),
      expect.objectContaining({ title: secondArticle.title, actionLevel: 'monitor' }),
    ]);
  });

  it('preserves valid items when a batch response is shorter than requested', async () => {
    const secondArticle = { ...article, id: 'second', title: 'Second article' };
    const generator = {
      generate: vi.fn(),
      generateBatch: vi.fn().mockResolvedValue(JSON.stringify([
        {
          title: 'Tin hợp lệ',
          summary: 'Tóm tắt hợp lệ',
          whyImportant: 'Lý do hợp lệ',
          actionLevel: 'high',
          actionText: 'Kiểm tra ngay',
        },
      ])),
    };

    await expect(new ArticleEditorialService(generator).editArticles([
      { article, topic: 'security' },
      { article: secondArticle, topic: 'ai' },
    ])).resolves.toEqual([
      expect.objectContaining({ title: 'Tin hợp lệ', actionLevel: 'high' }),
      expect.objectContaining({ title: secondArticle.title, actionLevel: 'monitor' }),
    ]);
  });

  it('uses verified Google translations when the primary batch generator fails', async () => {
    const secondArticle = { ...article, id: 'second', title: 'Second article' };
    const primary = {
      generate: vi.fn(),
      generateBatch: vi.fn().mockRejectedValue(new Error('codex unavailable')),
    };
    const translations = new Map([
      [article.title, 'Lỗ hổng nghiêm trọng'],
      [article.summary, 'Một lỗ hổng đang bị khai thác.'],
      [secondArticle.title, 'Bài viết thứ hai'],
    ]);
    const translator = {
      translateDigest: vi.fn(),
      translateDigestVerified: vi.fn(async (text: string) => ({
        text: translations.get(text) ?? text,
        succeeded: true,
      })),
    };
    const service = new ArticleEditorialService(primary, {
      fallbackGenerator: new GoogleArticleEditorialGenerator(translator),
      failClosed: true,
    });

    await expect(service.editArticles([
      { article, topic: 'security' },
      { article: secondArticle, topic: 'ai' },
    ])).resolves.toEqual([
      expect.objectContaining({
        title: 'Lỗ hổng nghiêm trọng',
        summary: 'Một lỗ hổng đang bị khai thác.',
      }),
      expect.objectContaining({
        title: 'Bài viết thứ hai',
        summary: 'Một lỗ hổng đang bị khai thác.',
      }),
    ]);
  });

  it('uses Google when the primary batch returns complete English editorial text', async () => {
    const primary = {
      generate: vi.fn(),
      generateBatch: vi.fn().mockResolvedValue(JSON.stringify([{
        title: 'Critical gateway vulnerability',
        summary: 'A gateway vulnerability is being actively exploited.',
        whyImportant: 'Internet-facing gateways are exposed.',
        actionLevel: 'urgent',
        actionText: 'Patch immediately.',
      }])),
    };
    const translator = {
      translateDigest: vi.fn(),
      translateDigestVerified: vi
        .fn()
        .mockResolvedValueOnce({ text: 'Lỗ hổng nghiêm trọng', succeeded: true })
        .mockResolvedValueOnce({ text: 'Lỗ hổng đang bị khai thác.', succeeded: true }),
    };
    const service = new ArticleEditorialService(primary, {
      fallbackGenerator: new GoogleArticleEditorialGenerator(translator),
      failClosed: true,
    });

    await expect(service.editArticles([
      { article, topic: 'security' },
    ])).resolves.toEqual([
      expect.objectContaining({
        title: 'Lỗ hổng nghiêm trọng',
        summary: 'Lỗ hổng đang bị khai thác.',
      }),
    ]);
  });

  it('rejects the batch when primary and fallback translation both fail', async () => {
    const primary = {
      generate: vi.fn(),
      generateBatch: vi.fn().mockRejectedValue(new Error('codex unavailable')),
    };
    const translator = {
      translateDigest: vi.fn(),
      translateDigestVerified: vi.fn(async (text: string) => ({
        text,
        succeeded: false,
      })),
    };
    const service = new ArticleEditorialService(primary, {
      fallbackGenerator: new GoogleArticleEditorialGenerator(translator),
      failClosed: true,
    });

    await expect(service.editArticles([
      { article, topic: 'security' },
    ])).rejects.toThrow('Article editorial unavailable');
  });

  it('rejects Google output that reports success but remains English', async () => {
    const primary = {
      generate: vi.fn(),
      generateBatch: vi.fn().mockRejectedValue(new Error('codex unavailable')),
    };
    const translator = {
      translateDigest: vi.fn(),
      translateDigestVerified: vi.fn(async (text: string) => ({
        text,
        succeeded: true,
      })),
    };
    const service = new ArticleEditorialService(primary, {
      fallbackGenerator: new GoogleArticleEditorialGenerator(translator),
      failClosed: true,
    });

    await expect(service.editArticles([
      { article, topic: 'security' },
    ])).rejects.toThrow('Article editorial unavailable');
  });

  it.each([
    {
      name: 'Vietnamese title with English summary',
      translatedTitle: 'Bản tin bảo mật mới',
      translatedSummary: article.summary,
    },
    {
      name: 'English title with Vietnamese summary',
      translatedTitle: article.title,
      translatedSummary: 'Lỗ hổng đang bị khai thác.',
    },
  ])('rejects partially untranslated Google output: $name', async ({
    translatedTitle,
    translatedSummary,
  }) => {
    const primary = {
      generate: vi.fn(),
      generateBatch: vi.fn().mockRejectedValue(new Error('codex unavailable')),
    };
    const translator = {
      translateDigest: vi.fn(),
      translateDigestVerified: vi.fn(async (text: string) => ({
        text: text === article.title ? translatedTitle : translatedSummary,
        succeeded: true,
      })),
    };
    const service = new ArticleEditorialService(primary, {
      fallbackGenerator: new GoogleArticleEditorialGenerator(translator),
      failClosed: true,
    });

    await expect(service.editArticles([
      { article, topic: 'security' },
    ])).rejects.toThrow('Article editorial unavailable');
  });

  it('adds trusted verification metadata for successful Google translations', async () => {
    const translator = {
      translateDigest: vi.fn(),
      translateDigestVerified: vi
        .fn()
        .mockResolvedValueOnce({ text: 'Lỗ hổng nghiêm trọng', succeeded: true })
        .mockResolvedValueOnce({ text: 'Lỗ hổng đang bị khai thác.', succeeded: true }),
    };
    const service = new ArticleEditorialService(
      new GoogleArticleEditorialGenerator(translator),
    );

    const result = await service.editArticle(article, 'security');

    expect(result[verifiedVietnameseEditorial]).toBe(true);
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

  it('logs only a constant message when generation fails with a sensitive error', async () => {
    const sensitive = new Error(
      'Authorization: Bearer 123456:ABC-TOKEN chat_id=-100123 allegation: received bribes BRAVE_KEY=search-secret',
    );
    const service = new ArticleEditorialService({ generate: vi.fn().mockRejectedValue(sensitive) });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await expect(service.editArticle(article, 'security')).resolves.toMatchObject({
        title: article.title,
        summary: article.summary,
        actionLevel: 'monitor',
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('Article editorial generation failed, using fallback');
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).not.toContain('123456:ABC-TOKEN');
      expect(logged).not.toContain('-100123');
      expect(logged).not.toContain('Authorization');
      expect(logged).not.toContain('BRAVE_KEY');
      expect(logged).not.toContain('received bribes');
    } finally {
      warn.mockRestore();
    }
  });

  it('uses a custom gadget editorial context without changing tech topics', async () => {
    const service = new ArticleEditorialService({ generate: vi.fn().mockResolvedValue('{}') });

    await expect(
      service.editArticle(article, {
        key: 'components',
        fallbackWhyImportant:
          'Thông số linh kiện có thể ảnh hưởng trực tiếp đến hiệu năng và quyết định nâng cấp.',
      }),
    ).resolves.toMatchObject({
      whyImportant: expect.stringContaining('hiệu năng'),
      actionLevel: 'monitor',
    });
  });

  it('passes domain instructions and uses a domain fallback action', async () => {
    const generator = { generate: vi.fn().mockResolvedValue('{}') };
    const service = new ArticleEditorialService(generator);
    const healthArticle = { ...article, title: 'Healthy sleep' };

    await expect(service.editArticle(healthArticle, {
      key: 'sleep-recovery',
      fallbackWhyImportant: 'Evidence fallback',
      fallbackActionText: 'Safe action fallback',
      instructions: 'HEALTH-SAFETY-INSTRUCTIONS',
    })).resolves.toMatchObject({
      whyImportant: 'Evidence fallback',
      actionText: 'Safe action fallback',
    });
    expect(generator.generate).toHaveBeenCalledWith(expect.objectContaining({
      instructions: 'HEALTH-SAFETY-INSTRUCTIONS',
    }));
  });
});
