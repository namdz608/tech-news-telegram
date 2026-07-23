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
 * - `src/services/openai-article-editorial.generator.ts:17`
 * - `src/services/openai-article-editorial.generator.ts:19`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface OpenAIResponseClientLike {
  // Gán field cấu trúc để tạo object đúng contract.
  responses: {
    /**
     * Hàm `create` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
     *
     * Được sử dụng tại:
     * - `src/crawlers/github-repos.crawler.ts:123`
     * - `src/crawlers/html.crawler.ts:112`
     * - `src/crawlers/rss.crawler.ts:213`
     * - `src/crawlers/x-search.crawler.ts:168`
     * - `src/services/google-translation.service.ts:8`
     * - `src/services/openai-article-editorial.generator.ts:24`
     * - `src/services/telegram.service.ts:57`
     * - `tests/services/openai-article-editorial.generator.test.ts:16`
     * - `tests/services/openai-article-editorial.generator.test.ts:17`
     * - `tests/services/openai-article-editorial.generator.test.ts:20`
     */
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    create(input: { model: string; instructions: string; input: string }): Promise<{ output_text?: string }>;
  };
}

/**
 * Class `OpenAIArticleEditorialGenerator` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts:30`
 * - `src/services/article-editorial.service.ts:164`
 * - `tests/services/openai-article-editorial.generator.test.ts:2`
 * - `tests/services/openai-article-editorial.generator.test.ts:14`
 * - `tests/services/openai-article-editorial.generator.test.ts:17`
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
   * - `src/services/article-editorial.service.ts:107`
   * - `src/services/article-editorial.types.ts:38`
   * - `src/services/codex-article-editorial.generator.ts:59`
   * - `src/services/google-article-editorial.generator.ts:14`
   * - `tests/services/article-editorial.service.test.ts:19`
   * - `tests/services/article-editorial.service.test.ts:42`
   * - `tests/services/article-editorial.service.test.ts:60`
   * - `tests/services/codex-article-editorial.generator.test.ts:19`
   * - `tests/services/google-article-editorial.generator.test.ts:24`
   * - `tests/services/openai-article-editorial.generator.test.ts:19`
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
