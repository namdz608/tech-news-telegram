import { env } from '../config/env';
import type {
  ArticleEditorialGenerator,
  ArticleEditorialInput,
} from './article-editorial.types';
import { articleEditorialInstructions } from './article-editorial.types';
import { CodexExecRunner, type CodexRunner } from './codex-exec.runner';

export class CodexArticleEditorialGenerator implements ArticleEditorialGenerator {
  constructor(
    private readonly runner: CodexRunner = new CodexExecRunner(),
    private readonly timeoutMs = env.CODEX_TRANSLATION_TIMEOUT_MS,
  ) {}

  async generate(input: ArticleEditorialInput): Promise<string> {
    const output = await this.runner.run(
      articleEditorialInstructions,
      JSON.stringify(input),
      this.timeoutMs,
    );

    return output.trim();
  }
}
