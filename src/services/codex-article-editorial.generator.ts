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
    const output = await this.runner.run(
      input.instructions ?? articleEditorialInstructions,
      JSON.stringify(input),
      this.timeoutMs,
    );
    return output.trim();
  }

  async generateBatch(inputs: ArticleEditorialInput[]): Promise<string> {
    const batchInstructions = [
      'Biên tập các tin công nghệ bằng tiếng Việt tự nhiên, súc tích.',
      'Đầu vào là một JSON array. Hãy biên tập từng phần tử và trả về một JSON array có cùng số phần tử, cùng thứ tự với đầu vào.',
      'Mỗi phần tử đầu ra phải là một JSON object với đúng các khóa đã yêu cầu. Tuân theo instructions riêng trong từng phần tử đầu vào nếu có.',
      'Các khóa bắt buộc của mỗi object: title, summary, whyImportant, actionLevel, actionText.',
      'actionLevel chỉ được là urgent, high hoặc monitor.',
      'Tóm tắt và nhận định chỉ được dựa trên dữ kiện đầu vào. Không bịa CVE, phiên bản, số liệu, tổ chức, trạng thái khai thác hoặc phạm vi ảnh hưởng.',
      'Nếu dữ kiện chưa đủ để kết luận mạnh, chọn monitor và đề xuất kiểm tra mức độ liên quan hoặc theo dõi nguồn chính thức.',
      'Chỉ trả về JSON array, không thêm Markdown hoặc giải thích.',
    ].join('\n');

    const output = await this.runner.run(
      batchInstructions,
      JSON.stringify(inputs),
      this.timeoutMs,
    );
    return output.trim();
  }
}
