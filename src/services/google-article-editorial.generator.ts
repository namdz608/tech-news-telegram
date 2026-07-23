/**
 * Gọi Gemini generateContent và trích JSON editorial từ response.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
import type {
  // Đưa giá trị `ArticleEditorialGenerator` vào field cùng tên của object đang tạo.
  ArticleEditorialGenerator,
  // Đưa giá trị `ArticleEditorialInput` vào field cùng tên của object đang tạo.
  ArticleEditorialInput,
} from './article-editorial.types';
// Nạp { GoogleTranslationService } từ `./google-translation.service` để dùng đúng dependency/type thay vì tự triển khai lại.
import { GoogleTranslationService } from './google-translation.service';

/**
 * Interface `TextTranslator` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/google-article-editorial.generator.ts`
 */
// Mở khai báo `interface TextTranslator` để compiler kiểm tra contract cho mọi consumer.
interface TextTranslator {
  // Gán field `translateDigest(text` từ `string): Promise<string>;` để object khớp contract.
  translateDigest(text: string): Promise<string>;
}

/**
 * Class `GoogleArticleEditorialGenerator` sở hữu vòng đời dependency và điều phối các bước google article editorial generator.
 *
 * Được sử dụng tại:
 * - `src/services/article-editorial.service.ts`
 * - `tests/services/google-article-editorial.generator.test.ts`
 */
// Mở khai báo `export class GoogleArticleEditorialGenerator implements ArticleEditorialGenerator` để compiler kiểm tra contract cho mọi consumer.
export class GoogleArticleEditorialGenerator implements ArticleEditorialGenerator {
  // Gán field `constructor(private readonly translator` từ `TextTranslator = new GoogleTranslationService()) {}` để object khớp contract.
  constructor(private readonly translator: TextTranslator = new GoogleTranslationService()) {}

  /**
   * Hàm `generate` thực hiện trách nhiệm `generate` của module; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `tests/services/google-article-editorial.generator.test.ts`
   * - `src/services/article-editorial.service.ts`
   */
  // Mở method `generate` để thực hiện trách nhiệm `generate` của module.
  async generate(input: ArticleEditorialInput): Promise<string> {
    const [title, summary] = await Promise.all([
      this.translator.translateDigest(input.title),
      // Gán field `input.summary ? this.translator.translateDigest(input.summary) ` từ `Promise.resolve(''),` để object khớp contract.
      input.summary ? this.translator.translateDigest(input.summary) : Promise.resolve(''),
    ]);

    // Trả `JSON.stringify({ title, summary });` cho caller và kết thúc nhánh hiện tại.
    return JSON.stringify({ title, summary });
  }
}
