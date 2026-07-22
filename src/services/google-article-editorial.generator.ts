import type {
  ArticleEditorialGenerator,
  ArticleEditorialInput,
} from './article-editorial.types';
import { GoogleTranslationService } from './google-translation.service';

interface TextTranslator {
  translateDigest(text: string): Promise<string>;
}

export class GoogleArticleEditorialGenerator implements ArticleEditorialGenerator {
  constructor(private readonly translator: TextTranslator = new GoogleTranslationService()) {}

  async generate(input: ArticleEditorialInput): Promise<string> {
    const [title, summary] = await Promise.all([
      this.translator.translateDigest(input.title),
      input.summary ? this.translator.translateDigest(input.summary) : Promise.resolve(''),
    ]);

    return JSON.stringify({ title, summary });
  }
}
