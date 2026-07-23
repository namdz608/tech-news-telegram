/**
 * Tạo prompt editorial và gọi Codex runner để nhận JSON có cấu trúc.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { env } from '../config/env';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type {
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ArticleEditorialGenerator,
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ArticleEditorialInput,
// Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
} from './article-editorial.types';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { articleEditorialInstructions } from './article-editorial.types';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { CodexExecRunner, type CodexRunner } from './codex-exec.runner';

/**
 * Class `CodexArticleEditorialGenerator` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 * - `tests/services/codex-article-editorial.generator.test.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class CodexArticleEditorialGenerator implements ArticleEditorialGenerator {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  constructor(
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly runner: CodexRunner = new CodexExecRunner(),
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly timeoutMs = env.CODEX_TRANSLATION_TIMEOUT_MS,
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ) {}

  /**
   * Hàm `generate` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/services/article-editorial.service.ts`
   * - `src/services/article-editorial.types.ts`
   * - `src/services/google-article-editorial.generator.ts`
   * - `src/services/openai-article-editorial.generator.ts`
   * - `tests/services/article-editorial.service.test.ts`
   * - `tests/services/codex-article-editorial.generator.test.ts`
   * - `tests/services/google-article-editorial.generator.test.ts`
   * - `tests/services/openai-article-editorial.generator.test.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  async generate(input: ArticleEditorialInput): Promise<string> {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const output = await this.runner.run(
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      articleEditorialInstructions,
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      JSON.stringify(input),
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      this.timeoutMs,
    );

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return output.trim();
  }
}
