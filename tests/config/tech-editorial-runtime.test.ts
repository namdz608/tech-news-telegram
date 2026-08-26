import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('tech editorial runtime wiring', () => {
  it('uses the isolated tech factory in both news and Telegram controllers', () => {
    const newsController = readFileSync('src/controllers/news.controller.ts', 'utf8');
    const telegramController = readFileSync('src/controllers/telegram.controller.ts', 'utf8');

    expect(newsController).toContain('createTechArticleEditorialService');
    expect(newsController).toContain('createTechTranslationService');
    expect(newsController).toMatch(/Promise\.all\([\s\S]*translateDigest[\s\S]*editDigestMessages/);
    expect(newsController).not.toContain('new TranslationService()');
    expect(telegramController).toContain('createTechArticleEditorialService');
  });

  it('documents Codex as the isolated tech default', () => {
    const envExample = readFileSync('.env.example', 'utf8');
    const readme = readFileSync('README.md', 'utf8');

    expect(envExample).toContain('TECH_EDITORIAL_PROVIDER=codex');
    expect(readme).toMatch(/TECH_EDITORIAL_PROVIDER.*codex/isu);
    expect(readme).toMatch(/ChatGPT.*login|đăng nhập.*ChatGPT/isu);
    expect(readme).toMatch(/không.*Google Translate|không gọi Google Translate/isu);
  });
});
