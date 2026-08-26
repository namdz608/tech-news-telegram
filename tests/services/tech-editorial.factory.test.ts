import { describe, expect, it } from 'vitest';
import { CodexArticleEditorialGenerator } from '../../src/services/codex-article-editorial.generator';
import { CodexDigestTranslator } from '../../src/services/codex-digest-translator';
import { GoogleArticleEditorialGenerator } from '../../src/services/google-article-editorial.generator';
import { GoogleTranslationService } from '../../src/services/google-translation.service';
import {
  createTechArticleEditorialGenerator,
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
});
