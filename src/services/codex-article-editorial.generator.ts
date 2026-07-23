/**
 * Tạo prompt editorial và gọi Codex runner để nhận JSON có cấu trúc.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp { env } từ `../config/env` để dùng đúng dependency/type thay vì tự triển khai lại.
import { env } from '../config/env';
import type {
  // Đưa giá trị `ArticleEditorialGenerator` vào field cùng tên của object đang tạo.
  ArticleEditorialGenerator,
  // Đưa giá trị `ArticleEditorialInput` vào field cùng tên của object đang tạo.
  ArticleEditorialInput,
} from './article-editorial.types';
// Nạp { articleEditorialInstructions } từ `./article-editorial.types` để dùng đúng dependency/type thay vì tự triển khai lại.
import { articleEditorialInstructions } from './article-editorial.types';
// Nạp { CodexExecRunner, type CodexRunner } từ `./codex-exec.runner` để dùng đúng dependency/type thay vì tự triển khai lại.
import { CodexExecRunner, type CodexRunner } from './codex-exec.runner';

/**
 * Class `CodexArticleEditorialGenerator` sở hữu vòng đời dependency và điều phối các bước codex article editorial generator.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 * - `tests/services/codex-article-editorial.generator.test.ts`
 */
// Mở khai báo `export class CodexArticleEditorialGenerator implements ArticleEditorialGenerator` để compiler kiểm tra contract cho mọi consumer.
export class CodexArticleEditorialGenerator implements ArticleEditorialGenerator {
  constructor(
    // Gán field `private readonly runner` từ `CodexRunner = new CodexExecRunner(),` để object khớp contract.
    private readonly runner: CodexRunner = new CodexExecRunner(),
    private readonly timeoutMs = env.CODEX_TRANSLATION_TIMEOUT_MS,
  ) {}

  /**
   * Hàm `generate` thực hiện trách nhiệm `generate` của module; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `tests/services/codex-article-editorial.generator.test.ts`
   * - `src/services/article-editorial.service.ts`
   */
  // Mở method `generate` để thực hiện trách nhiệm `generate` của module.
  async generate(input: ArticleEditorialInput): Promise<string> {
    // Tính `output` từ `await this.runner.run(` và giữ bất biến trong phạm vi hiện tại.
    const output = await this.runner.run(
      // Đưa giá trị `articleEditorialInstructions` vào field cùng tên của object đang tạo.
      articleEditorialInstructions,
      JSON.stringify(input),
      this.timeoutMs,
    );

    // Trả `output.trim();` cho caller và kết thúc nhánh hiện tại.
    return output.trim();
  }
}
