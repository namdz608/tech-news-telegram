/**
 * Gọi Gemini generateContent và trích JSON editorial từ response.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type {
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ArticleEditorialGenerator,
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ArticleEditorialInput,
// Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
} from './article-editorial.types';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { GoogleTranslationService } from './google-translation.service';

/**
 * Interface `TextTranslator` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/google-article-editorial.generator.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface TextTranslator {
  /**
   * Hàm `translateDigest` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/controllers/news.controller.ts`
   * - `src/services/google-article-editorial.generator.ts`
   * - `src/services/google-translation.service.ts`
   * - `src/services/translation.service.ts`
   * - `src/services/translation.types.ts`
   * - `tests/services/google-article-editorial.generator.test.ts`
   * - `tests/services/google-translation.service.test.ts`
   * - `tests/services/translation.service.test.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  translateDigest(text: string): Promise<string>;
}

/**
 * Class `GoogleArticleEditorialGenerator` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 * - `tests/services/google-article-editorial.generator.test.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class GoogleArticleEditorialGenerator implements ArticleEditorialGenerator {
  /**
   * Hàm `constructor` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/crawlers/github-repos.crawler.ts`
   * - `src/crawlers/html.crawler.ts`
   * - `src/crawlers/rss.crawler.ts`
   * - `src/crawlers/x-search.crawler.ts`
   * - `src/services/article-editorial.service.ts`
   * - `src/services/codex-article-editorial.generator.ts`
   * - `src/services/digest.service.ts`
   * - `src/services/google-translation.service.ts`
   * - `src/services/openai-article-editorial.generator.ts`
   * - `src/services/source.service.ts`
   * - `src/services/telegram.service.ts`
   * - `src/services/translation.service.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  constructor(private readonly translator: TextTranslator = new GoogleTranslationService()) {}

  /**
   * Hàm `generate` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/services/article-editorial.service.ts`
   * - `src/services/article-editorial.types.ts`
   * - `src/services/codex-article-editorial.generator.ts`
   * - `src/services/openai-article-editorial.generator.ts`
   * - `tests/services/article-editorial.service.test.ts`
   * - `tests/services/codex-article-editorial.generator.test.ts`
   * - `tests/services/google-article-editorial.generator.test.ts`
   * - `tests/services/openai-article-editorial.generator.test.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  async generate(input: ArticleEditorialInput): Promise<string> {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const [title, summary] = await Promise.all([
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      this.translator.translateDigest(input.title),
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      input.summary ? this.translator.translateDigest(input.summary) : Promise.resolve(''),
    ]);

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return JSON.stringify({ title, summary });
  }
}
