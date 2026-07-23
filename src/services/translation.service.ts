/**
 * Bao bọc translator, bỏ qua chuỗi rỗng và fallback digest gốc khi dịch lỗi.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { GoogleTranslationService } from './google-translation.service';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { DigestTranslator } from './translation.types';

/**
 * Hàm `createDefaultTranslator` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/translation.service.ts:9`
 * - `tests/services/translation.service.test.ts:3`
 * - `tests/services/translation.service.test.ts:7`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export function createDefaultTranslator(): DigestTranslator {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return new GoogleTranslationService();
}

/**
 * Class `TranslationService` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/controllers/news.controller.ts:13`
 * - `src/controllers/news.controller.ts:20`
 * - `tests/services/translation.service.test.ts:3`
 * - `tests/services/translation.service.test.ts:5`
 * - `tests/services/translation.service.test.ts:15`
 * - `tests/services/translation.service.test.ts:30`
 * - `tests/services/translation.service.test.ts:44`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class TranslationService {
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
   * - `src/services/google-article-editorial.generator.ts:85`
   * - `src/services/google-translation.service.ts:32`
   * - `src/services/openai-article-editorial.generator.ts:66`
   * - `src/services/source.service.ts:61`
   * - `src/services/telegram.service.ts:52`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  constructor(private readonly translator: DigestTranslator = createDefaultTranslator()) {}

  /**
   * Hàm `translateDigest` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/controllers/news.controller.ts:63`
   * - `src/services/google-article-editorial.generator.ts:52`
   * - `src/services/google-article-editorial.generator.ts:107`
   * - `src/services/google-article-editorial.generator.ts:109`
   * - `src/services/google-translation.service.ts:66`
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
  async translateDigest(digest: string): Promise<string> {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (!digest.trim()) {
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return digest;
    }

    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const protectedDigest = protectMarkup(digest);

    // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
    try {
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const translated = await this.translator.translateDigest(protectedDigest.text);
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return restoreMarkup(translated, protectedDigest.tokens);
    // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
    } catch (error) {
      // Ghi thông tin chẩn đoán mà không thay đổi dữ liệu nghiệp vụ.
      console.error('Digest translation failed, returning original digest', error);
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return digest;
    }
  }
}

/**
 * Interface `ProtectedText` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/translation.service.ts:39`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface ProtectedText {
  // Gán field cấu trúc để tạo object đúng contract.
  text: string;
  // Gán field cấu trúc để tạo object đúng contract.
  tokens: string[];
}

// Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
const protectPatterns: { name: string; regex: RegExp }[] = [
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  { name: 'TAG', regex: /<[^>]+>/g },
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  { name: 'ENT', regex: /&[a-zA-Z]+;|&#\d+;/g },
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  { name: 'URL', regex: /https?:\/\/[^\s<>"']+/g },
];

/**
 * Hàm `protectMarkup` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/translation.service.ts:16`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function protectMarkup(text: string): ProtectedText {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const tokens: string[] = [];
  // Khởi tạo trạng thái cục bộ sẽ được cập nhật có kiểm soát.
  let protectedText = text;

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  for (const { name, regex } of protectPatterns) {
    // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
    protectedText = protectedText.replace(regex, (match) => {
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const token = `__TNX_${name}_${tokens.length}__`;
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      tokens.push(match);
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return token;
    });
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return {
    // Gán field cấu trúc để tạo object đúng contract.
    text: protectedText,
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    tokens,
  };
}

/**
 * Hàm `restoreMarkup` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/translation.service.ts:20`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function restoreMarkup(text: string, tokens: string[]): string {
  // Khởi tạo trạng thái cục bộ sẽ được cập nhật có kiểm soát.
  let restored = text;

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    for (const { name } of protectPatterns) {
      // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
      restored = restored.replaceAll(`__TNX_${name}_${index}__`, tokens[index]);
    }
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return restored;
}
