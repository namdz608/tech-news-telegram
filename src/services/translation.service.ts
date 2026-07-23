/**
 * Bao bọc translator, bỏ qua chuỗi rỗng và fallback digest gốc khi dịch lỗi.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp { GoogleTranslationService } từ `./google-translation.service` để dùng đúng dependency/type thay vì tự triển khai lại.
import { GoogleTranslationService } from './google-translation.service';
// Nạp { DigestTranslator } từ `./translation.types` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { DigestTranslator } from './translation.types';

/**
 * Hàm `createDefaultTranslator` tạo cấu trúc đầu ra từ cấu hình/dữ liệu đầu vào; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/translation.service.ts`
 * - `tests/services/translation.service.test.ts`
 */
// Mở thân hàm `createDefaultTranslator` với input/output được TypeScript kiểm tra.
export function createDefaultTranslator(): DigestTranslator {
  // Trả `new GoogleTranslationService();` cho caller và kết thúc nhánh hiện tại.
  return new GoogleTranslationService();
}

/**
 * Class `TranslationService` sở hữu vòng đời dependency và điều phối các bước translation service.
 *
 * Được sử dụng tại:
 * - `src/controllers/news.controller.ts`
 * - `tests/services/translation.service.test.ts`
 */
// Mở khai báo `export class TranslationService` để compiler kiểm tra contract cho mọi consumer.
export class TranslationService {
  // Gán field `constructor(private readonly translator` từ `DigestTranslator = createDefaultTranslator()) {}` để object khớp contract.
  constructor(private readonly translator: DigestTranslator = createDefaultTranslator()) {}

  /**
   * Hàm `translateDigest` dịch nội dung và giữ fallback khi provider lỗi; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `src/services/translation.service.ts`
   * - `tests/services/translation.service.test.ts`
   * - `src/controllers/news.controller.ts`
   */
  // Mở method `translateDigest` để dịch nội dung và giữ fallback khi provider lỗi.
  async translateDigest(digest: string): Promise<string> {
    // Nếu `!digest.trim()` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (!digest.trim()) {
      // Trả `digest;` cho caller và kết thúc nhánh hiện tại.
      return digest;
    }

    // Tính `protectedDigest` từ `protectMarkup(digest);` và giữ bất biến trong phạm vi hiện tại.
    const protectedDigest = protectMarkup(digest);

    // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
    try {
      // Tính `translated` từ `await this.translator.translateDigest(protectedDigest.text);` và giữ bất biến trong phạm vi hiện tại.
      const translated = await this.translator.translateDigest(protectedDigest.text);
      // Trả `restoreMarkup(translated, protectedDigest.tokens);` cho caller và kết thúc nhánh hiện tại.
      return restoreMarkup(translated, protectedDigest.tokens);
    // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
    } catch (error) {
      // Ghi sự kiện `console.error('Digest translation failed, returning original digest', error);` phục vụ chẩn đoán mà không đổi kết quả nghiệp vụ.
      console.error('Digest translation failed, returning original digest', error);
      // Trả `digest;` cho caller và kết thúc nhánh hiện tại.
      return digest;
    }
  }
}

/**
 * Interface `ProtectedText` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/translation.service.ts`
 */
// Mở khai báo `interface ProtectedText` để compiler kiểm tra contract cho mọi consumer.
interface ProtectedText {
  // Gán field `text` từ `string;` để object khớp contract.
  text: string;
  // Gán field `tokens` từ `string[];` để object khớp contract.
  tokens: string[];
}

// Gán field `const protectPatterns` từ `{ name: string; regex: RegExp }[] = [` để object khớp contract.
const protectPatterns: { name: string; regex: RegExp }[] = [
  { name: 'TAG', regex: /<[^>]+>/g },
  { name: 'ENT', regex: /&[a-zA-Z]+;|&#\d+;/g },
  { name: 'URL', regex: /https?:\/\/[^\s<>"']+/g },
];

/**
 * Hàm `protectMarkup` bảo vệ hoặc phục hồi markup quanh bước dịch; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/translation.service.ts`
 */
// Mở thân hàm `protectMarkup` với input/output được TypeScript kiểm tra.
function protectMarkup(text: string): ProtectedText {
  // Gán field `const tokens` từ `string[] = [];` để object khớp contract.
  const tokens: string[] = [];
  // Khởi tạo trạng thái `protectedText`; các nhánh bên dưới sẽ cập nhật nó có kiểm soát.
  let protectedText = text;

  // Lặp theo `const { name, regex } of protectPatterns` để xử lý đủ từng phần tử/trạng thái.
  for (const { name, regex } of protectPatterns) {
    // Cập nhật `protectedText` bằng `protectedText.replace(regex, (match) => {` cho bước kế tiếp.
    protectedText = protectedText.replace(regex, (match) => {
      // Tính `token` từ ``__TNX_${name}_${tokens.length}__`;` và giữ bất biến trong phạm vi hiện tại.
      const token = `__TNX_${name}_${tokens.length}__`;
      // Gọi `tokens.push` với `match` để hoàn tất side effect/bước xử lý hiện tại.
      tokens.push(match);
      // Trả `token;` cho caller và kết thúc nhánh hiện tại.
      return token;
    });
  }

  // Trả `{` cho caller và kết thúc nhánh hiện tại.
  return {
    // Gán field `text` từ `protectedText,` để object khớp contract.
    text: protectedText,
    // Đưa giá trị `tokens` vào field cùng tên của object đang tạo.
    tokens,
  };
}

/**
 * Hàm `restoreMarkup` bảo vệ hoặc phục hồi markup quanh bước dịch; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/translation.service.ts`
 */
// Mở thân hàm `restoreMarkup` với input/output được TypeScript kiểm tra.
function restoreMarkup(text: string, tokens: string[]): string {
  // Khởi tạo trạng thái `restored`; các nhánh bên dưới sẽ cập nhật nó có kiểm soát.
  let restored = text;

  // Lặp theo `let index = tokens.length - 1; index >= 0; index -= 1` để xử lý đủ từng phần tử/trạng thái.
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    // Lặp theo `const { name } of protectPatterns` để xử lý đủ từng phần tử/trạng thái.
    for (const { name } of protectPatterns) {
      // Cập nhật `restored` bằng `restored.replaceAll(`__TNX_${name}_${index}__`, tokens[index]);` cho bước kế tiếp.
      restored = restored.replaceAll(`__TNX_${name}_${index}__`, tokens[index]);
    }
  }

  // Trả `restored;` cho caller và kết thúc nhánh hiện tại.
  return restored;
}
