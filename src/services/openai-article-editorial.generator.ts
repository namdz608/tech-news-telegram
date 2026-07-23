/**
 * Gọi OpenAI Responses API để sinh editorial JSON theo schema chung.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import OpenAI from 'openai';
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

/**
 * Interface `OpenAIResponseClientLike` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/openai-article-editorial.generator.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface OpenAIResponseClientLike {
  // Gán field cấu trúc để tạo object đúng contract.
  responses: {
    /**
     * Hàm `create` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - `src/crawlers/github-repos.crawler.ts`
     * - `src/crawlers/html.crawler.ts`
     * - `src/crawlers/rss.crawler.ts`
     * - `src/crawlers/x-search.crawler.ts`
     * - `src/services/google-translation.service.ts`
     * - `src/services/openai-article-editorial.generator.ts`
     * - `src/services/telegram.service.ts`
     * - `tests/services/openai-article-editorial.generator.test.ts`
     */
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    create(input: { model: string; instructions: string; input: string }): Promise<{ output_text?: string }>;
  };
}

/**
 * Class `OpenAIArticleEditorialGenerator` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 * - `tests/services/openai-article-editorial.generator.test.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class OpenAIArticleEditorialGenerator implements ArticleEditorialGenerator {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  constructor(
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly client: OpenAIResponseClientLike = new OpenAI({
      // Gán field cấu trúc để tạo object đúng contract.
      apiKey: env.OPENAI_API_KEY,
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    }) as OpenAIResponseClientLike,
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly model = env.OPENAI_MODEL,
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ) {}

  /**
   * Hàm `generate` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/services/article-editorial.service.ts`
   * - `src/services/article-editorial.types.ts`
   * - `src/services/codex-article-editorial.generator.ts`
   * - `src/services/google-article-editorial.generator.ts`
   * - `tests/services/article-editorial.service.test.ts`
   * - `tests/services/codex-article-editorial.generator.test.ts`
   * - `tests/services/google-article-editorial.generator.test.ts`
   * - `tests/services/openai-article-editorial.generator.test.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  async generate(input: ArticleEditorialInput): Promise<string> {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const response = await this.client.responses.create({
      // Gán field cấu trúc để tạo object đúng contract.
      model: this.model,
      // Gán field cấu trúc để tạo object đúng contract.
      instructions: articleEditorialInstructions,
      // Gán field cấu trúc để tạo object đúng contract.
      input: JSON.stringify(input),
    });

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return response.output_text?.trim() ?? '';
  }
}
