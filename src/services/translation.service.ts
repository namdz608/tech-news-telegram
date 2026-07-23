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
 * - `src/services/translation.service.ts`
 * - `tests/services/translation.service.test.ts`
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
 * - `src/controllers/news.controller.ts`
 * - `tests/services/translation.service.test.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class TranslationService {
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
   * - `src/services/google-article-editorial.generator.ts`
   * - `src/services/google-translation.service.ts`
   * - `src/services/openai-article-editorial.generator.ts`
   * - `src/services/source.service.ts`
   * - `src/services/telegram.service.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  constructor(private readonly translator: DigestTranslator = createDefaultTranslator()) {}

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
 * - `src/services/translation.service.ts`
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
 * - `src/services/translation.service.ts`
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
 * - `src/services/translation.service.ts`
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
