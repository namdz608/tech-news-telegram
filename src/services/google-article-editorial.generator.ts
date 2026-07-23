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
 * - `src/services/google-article-editorial.generator.ts:12`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface TextTranslator {
  /**
   * Hàm `translateDigest` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/controllers/news.controller.ts:63`
   * - `src/services/google-article-editorial.generator.ts:16`
   * - `src/services/google-article-editorial.generator.ts:17`
   * - `src/services/google-translation.service.ts:11`
   * - `src/services/translation.service.ts:11`
   * - `src/services/translation.service.ts:19`
   * - `src/services/translation.types.ts:9`
   * - `tests/services/google-article-editorial.generator.test.ts:17`
   * - `tests/services/google-article-editorial.generator.test.ts:30`
   * - `tests/services/google-article-editorial.generator.test.ts:31`
   * - `tests/services/google-translation.service.test.ts:13`
   * - `tests/services/google-translation.service.test.ts:24`
   * - `tests/services/translation.service.test.ts:12`
   * - `tests/services/translation.service.test.ts:15`
   * - `tests/services/translation.service.test.ts:18`
   * - `tests/services/translation.service.test.ts:25`
   * - `tests/services/translation.service.test.ts:30`
   * - `tests/services/translation.service.test.ts:31`
   * - `tests/services/translation.service.test.ts:41`
   * - `tests/services/translation.service.test.ts:44`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  translateDigest(text: string): Promise<string>;
}

/**
 * Class `GoogleArticleEditorialGenerator` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts:28`
 * - `src/services/article-editorial.service.ts:170`
 * - `tests/services/google-article-editorial.generator.test.ts:2`
 * - `tests/services/google-article-editorial.generator.test.ts:14`
 * - `tests/services/google-article-editorial.generator.test.ts:22`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class GoogleArticleEditorialGenerator implements ArticleEditorialGenerator {
  /**
   * Hàm `constructor` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/crawlers/github-repos.crawler.ts:121`
   * - `src/crawlers/html.crawler.ts:110`
   * - `src/crawlers/rss.crawler.ts:194`
   * - `src/crawlers/x-search.crawler.ts:166`
   * - `src/services/article-editorial.service.ts:80`
   * - `src/services/codex-article-editorial.generator.ts:35`
   * - `src/services/digest.service.ts:174`
   * - `src/services/google-translation.service.ts:6`
   * - `src/services/openai-article-editorial.generator.ts:66`
   * - `src/services/source.service.ts:61`
   * - `src/services/telegram.service.ts:52`
   * - `src/services/translation.service.ts:9`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  constructor(private readonly translator: TextTranslator = new GoogleTranslationService()) {}

  /**
   * Hàm `generate` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/services/article-editorial.service.ts:107`
   * - `src/services/article-editorial.types.ts:38`
   * - `src/services/codex-article-editorial.generator.ts:59`
   * - `src/services/openai-article-editorial.generator.ts:94`
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
