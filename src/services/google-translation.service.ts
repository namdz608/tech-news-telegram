/**
 * Chia digest thành đoạn và gọi Google Translate HTTP endpoint.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import axios from 'axios';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { env } from '../config/env';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { DigestTranslator } from './translation.types';

/**
 * Class `GoogleTranslationService` đóng gói trách nhiệm chính của module.
 *
 * Được sử dụng tại:
 * - `src/services/google-article-editorial.generator.ts`
 * - `src/services/translation.service.ts`
 * - `tests/services/google-translation.service.test.ts`
 * - `tests/services/translation.service.test.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export class GoogleTranslationService implements DigestTranslator {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  constructor(
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly targetLanguage = env.TRANSLATION_TARGET_LANGUAGE,
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    private readonly http = axios.create({ timeout: env.REQUEST_TIMEOUT_MS })
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ) {}

  /**
   * Hàm `translateDigest` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/controllers/news.controller.ts`
   * - `src/services/google-article-editorial.generator.ts`
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

    // Bắt đầu thao tác có thể lỗi để bảo vệ toàn bộ pipeline.
    try {
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const chunks = splitDigestForTranslation(digest, 4000);
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const translatedChunks = await Promise.all(
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        chunks.map(chunk => this.translateText(chunk))
      );
      
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const translated = translatedChunks.map((chunk) => chunk.trim()).filter(Boolean).join('\n\n');
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return translated.trim() || digest;
    // Thu lỗi từ thao tác trước và chuyển sang fallback an toàn.
    } catch (error) {
      // Ghi thông tin chẩn đoán mà không thay đổi dữ liệu nghiệp vụ.
      console.error('Google Translate failed', error);
      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return digest;
    }
  }

  /**
   * Hàm `translateText` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/services/google-translation.service.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  private async translateText(text: string): Promise<string> {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const response = await this.http.get('https://translate.googleapis.com/translate_a/single', {
      // Gán field cấu trúc để tạo object đúng contract.
      params: {
        // Gán field cấu trúc để tạo object đúng contract.
        client: 'gtx',
        // Gán field cấu trúc để tạo object đúng contract.
        sl: 'auto',
        // Gán field cấu trúc để tạo object đúng contract.
        tl: this.targetLanguage,
        // Gán field cấu trúc để tạo object đúng contract.
        dt: 't',
        // Gán field cấu trúc để tạo object đúng contract.
        q: text,
      },
    });

    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const data: unknown = response.data;

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (Array.isArray(data) && Array.isArray(data[0])) {
      // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
      const translated = data[0]
        // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
        .map((segment: unknown) =>
          // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
          Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : '',
        )
        // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
        .join('');

      // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
      return translated || text;
    }

    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return text;
  }
}

/**
 * Hàm `splitDigestForTranslation` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/google-translation.service.ts`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function splitDigestForTranslation(digest: string, maxChars: number): string[] {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (digest.length <= maxChars) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return [digest];
  }

  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const chunks: string[] = [];
  // Khởi tạo trạng thái cục bộ sẽ được cập nhật có kiểm soát.
  let current = '';

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  for (const block of digest.split(/\n{2,}/)) {
    // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
    const candidate = current ? `${current}\n\n${block}` : block;

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (candidate.length <= maxChars) {
      // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
      current = candidate;
      // Điều khiển vòng lặp sau khi nhánh hiện tại đã xử lý xong.
      continue;
    }

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (current) {
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      chunks.push(current);
      // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
      current = '';
    }

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (block.length <= maxChars) {
      // Cập nhật trạng thái cục bộ từ kết quả vừa tính.
      current = block;
      // Điều khiển vòng lặp sau khi nhánh hiện tại đã xử lý xong.
      continue;
    }

    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    for (let index = 0; index < block.length; index += maxChars) {
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      chunks.push(block.slice(index, index + maxChars));
    }
  }

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (current) {
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    chunks.push(current);
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return chunks;
}
