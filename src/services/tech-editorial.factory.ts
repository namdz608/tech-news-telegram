import { env } from '../config/env';
import {
  ArticleEditorialService,
  createArticleEditorialGenerator,
} from './article-editorial.service';
import type { ArticleEditorialGenerator } from './article-editorial.types';
import { CodexDigestTranslator } from './codex-digest-translator';
import { GoogleTranslationService } from './google-translation.service';
import { TranslationService } from './translation.service';
import type { DigestTranslator } from './translation.types';

export type TechEditorialProvider = 'codex' | 'google' | 'none';

export function createTechArticleEditorialGenerator(
  provider: TechEditorialProvider = env.TECH_EDITORIAL_PROVIDER,
): ArticleEditorialGenerator | undefined {
  return createArticleEditorialGenerator(provider);
}

export function createTechDigestTranslator(
  provider: TechEditorialProvider = env.TECH_EDITORIAL_PROVIDER,
): DigestTranslator {
  if (provider === 'codex') {
    return new CodexDigestTranslator();
  }
  if (provider === 'google') {
    return new GoogleTranslationService();
  }
  return new IdentityDigestTranslator();
}

export function createTechArticleEditorialService(
  provider: TechEditorialProvider = env.TECH_EDITORIAL_PROVIDER,
): ArticleEditorialService {
  return new ArticleEditorialService(
    createTechArticleEditorialGenerator(provider) ?? null,
  );
}

export function createTechTranslationService(
  provider: TechEditorialProvider = env.TECH_EDITORIAL_PROVIDER,
): TranslationService {
  return new TranslationService(createTechDigestTranslator(provider));
}

class IdentityDigestTranslator implements DigestTranslator {
  async translateDigest(text: string): Promise<string> {
    return text;
  }
}
