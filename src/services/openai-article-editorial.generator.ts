import OpenAI from 'openai';
import { env } from '../config/env';
import type {
  ArticleEditorialGenerator,
  ArticleEditorialInput,
} from './article-editorial.types';
import { articleEditorialInstructions } from './article-editorial.types';

interface OpenAIResponseClientLike {
  responses: {
    create(input: { model: string; instructions: string; input: string }): Promise<{ output_text?: string }>;
  };
}

export class OpenAIArticleEditorialGenerator implements ArticleEditorialGenerator {
  constructor(
    private readonly client: OpenAIResponseClientLike = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    }) as OpenAIResponseClientLike,
    private readonly model = env.OPENAI_MODEL,
  ) {}

  async generate(input: ArticleEditorialInput): Promise<string> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: articleEditorialInstructions,
      input: JSON.stringify(input),
    });

    return response.output_text?.trim() ?? '';
  }
}
