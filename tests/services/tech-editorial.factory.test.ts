import { describe, expect, it, vi } from 'vitest';
import { CodexArticleEditorialGenerator } from '../../src/services/codex-article-editorial.generator';
import { CodexDigestTranslator } from '../../src/services/codex-digest-translator';
import { GoogleArticleEditorialGenerator } from '../../src/services/google-article-editorial.generator';
import { GoogleTranslationService } from '../../src/services/google-translation.service';
import {
  createTechArticleEditorialGenerator,
  createTechArticleEditorialService,
  createTechDigestTranslator,
} from '../../src/services/tech-editorial.factory';

describe('tech editorial factory', () => {
  it('selects Codex for both article editorial and digest translation', () => {
    expect(createTechArticleEditorialGenerator('codex')).toBeInstanceOf(
      CodexArticleEditorialGenerator,
    );
    expect(createTechDigestTranslator('codex')).toBeInstanceOf(CodexDigestTranslator);
  });

  it('keeps Google available as an explicit opt-in', () => {
    expect(createTechArticleEditorialGenerator('google')).toBeInstanceOf(
      GoogleArticleEditorialGenerator,
    );
    expect(createTechDigestTranslator('google')).toBeInstanceOf(GoogleTranslationService);
  });

  it('uses identity translation and no article generator when disabled', async () => {
    expect(createTechArticleEditorialGenerator('none')).toBeUndefined();
    await expect(createTechDigestTranslator('none').translateDigest('Tech digest')).resolves.toBe(
      'Tech digest',
    );
  });

  it('falls back from Codex to verified Google translation for tech messages', async () => {
    const article = {
      id: 'https://example.com/aws',
      sourceId: 'aws',
      sourceName: 'AWS',
      title: 'AWS weekly roundup',
      url: 'https://example.com/aws',
      summary: 'New cloud services were announced.',
      collectedAt: '2026-08-29T01:00:00.000Z',
      topics: ['cloud' as const],
    };
    const codex = vi.spyOn(CodexArticleEditorialGenerator.prototype, 'generateBatch')
      .mockRejectedValue(new Error('not logged in'));
    const google = vi.spyOn(GoogleTranslationService.prototype, 'translateDigestVerified')
      .mockImplementation(async (text: string) => ({
        text: text === article.title
          ? 'Bản tin AWS hằng tuần'
          : 'Các dịch vụ đám mây mới đã được công bố.',
        succeeded: true,
      }));

    try {
      const [editorial] = await createTechArticleEditorialService('codex').editArticles([
        { article, topic: 'cloud' },
      ]);

      expect(editorial).toMatchObject({
        title: 'Bản tin AWS hằng tuần',
        summary: 'Các dịch vụ đám mây mới đã được công bố.',
      });
      expect(codex).toHaveBeenCalledTimes(1);
      expect(google).toHaveBeenCalledTimes(2);
    } finally {
      codex.mockRestore();
      google.mockRestore();
    }
  });

  it('rejects tech messages when Codex and Google translation are both unavailable', async () => {
    const article = {
      id: 'https://example.com/aws',
      sourceId: 'aws',
      sourceName: 'AWS',
      title: 'AWS weekly roundup',
      url: 'https://example.com/aws',
      summary: 'New cloud services were announced.',
      collectedAt: '2026-08-29T01:00:00.000Z',
      topics: ['cloud' as const],
    };
    const codex = vi.spyOn(CodexArticleEditorialGenerator.prototype, 'generateBatch')
      .mockRejectedValue(new Error('not logged in'));
    const google = vi.spyOn(GoogleTranslationService.prototype, 'translateDigestVerified')
      .mockImplementation(async (text: string) => ({ text, succeeded: false }));

    try {
      await expect(createTechArticleEditorialService('codex').editArticles([
        { article, topic: 'cloud' },
      ])).rejects.toThrow('Article editorial unavailable');
    } finally {
      codex.mockRestore();
      google.mockRestore();
    }
  });
});
