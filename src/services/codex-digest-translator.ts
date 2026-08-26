import { env } from '../config/env';
import { CodexExecRunner, type CodexRunner } from './codex-exec.runner';
import type { DigestTranslator } from './translation.types';

const CODEX_DIGEST_TRANSLATION_INSTRUCTIONS = [
  'Dịch bản tin công nghệ đầu vào sang tiếng Việt tự nhiên, chính xác và súc tích.',
  'Giữ nguyên mọi token bắt đầu bằng __TNX_ để URL và HTML được khôi phục an toàn.',
  'Không thêm, bớt hoặc suy diễn dữ kiện.',
  'Chỉ trả nội dung đã dịch, không dùng Markdown fence và không giải thích.',
].join('\n');

export class CodexDigestTranslator implements DigestTranslator {
  constructor(
    private readonly runner: CodexRunner = new CodexExecRunner(),
    private readonly timeoutMs = env.CODEX_TRANSLATION_TIMEOUT_MS,
  ) {}

  async translateDigest(text: string): Promise<string> {
    const output = await this.runner.run(
      CODEX_DIGEST_TRANSLATION_INSTRUCTIONS,
      text,
      this.timeoutMs,
    );
    return output.trim();
  }
}
