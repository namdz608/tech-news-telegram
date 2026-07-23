/**
 * Chia digest thành đoạn và gọi Google Translate HTTP endpoint.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp axios từ `axios` để dùng đúng dependency/type thay vì tự triển khai lại.
import axios from 'axios';
// Nạp { env } từ `../config/env` để dùng đúng dependency/type thay vì tự triển khai lại.
import { env } from '../config/env';
// Nạp { DigestTranslator } từ `./translation.types` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { DigestTranslator } from './translation.types';

/**
 * Class `GoogleTranslationService` sở hữu vòng đời dependency và điều phối các bước google translation service.
 *
 * Được sử dụng tại:
 * - `src/services/google-article-editorial.generator.ts`
 * - `src/services/translation.service.ts`
 * - `tests/services/google-translation.service.test.ts`
 * - `tests/services/translation.service.test.ts`
 */
// Mở khai báo `export class GoogleTranslationService implements DigestTranslator` để compiler kiểm tra contract cho mọi consumer.
export class GoogleTranslationService implements DigestTranslator {
  constructor(
    private readonly targetLanguage = env.TRANSLATION_TARGET_LANGUAGE,
    // Gán field `private readonly http = axios.create({ timeout` từ `env.REQUEST_TIMEOUT_MS })` để object khớp contract.
    private readonly http = axios.create({ timeout: env.REQUEST_TIMEOUT_MS })
  ) {}

  /**
   * Hàm `translateDigest` dịch nội dung và giữ fallback khi provider lỗi; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `tests/services/google-translation.service.test.ts`
   * - `src/controllers/news.controller.ts`
   * - `src/services/translation.service.ts`
   */
  // Mở method `translateDigest` để dịch nội dung và giữ fallback khi provider lỗi.
  async translateDigest(digest: string): Promise<string> {
    // Nếu `!digest.trim()` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (!digest.trim()) {
      // Trả `digest;` cho caller và kết thúc nhánh hiện tại.
      return digest;
    }

    // Cô lập thao tác có thể lỗi để module còn cơ hội log và trả fallback an toàn.
    try {
      // Tính `chunks` từ `splitDigestForTranslation(digest, 4000);` và giữ bất biến trong phạm vi hiện tại.
      const chunks = splitDigestForTranslation(digest, 4000);
      // Tính `translatedChunks` từ `await Promise.all(` và giữ bất biến trong phạm vi hiện tại.
      const translatedChunks = await Promise.all(
        // Gọi `chunks.map` với `chunk => this.translateText(chunk)` để hoàn tất side effect/bước xử lý hiện tại.
        chunks.map(chunk => this.translateText(chunk))
      );
      
      // Tính `translated` từ `translatedChunks.map((chunk) => chunk.trim()).filter(Boolean).join('\n\n');` và giữ bất biến trong phạm vi hiện tại.
      const translated = translatedChunks.map((chunk) => chunk.trim()).filter(Boolean).join('\n\n');
      // Trả `translated.trim() || digest;` cho caller và kết thúc nhánh hiện tại.
      return translated.trim() || digest;
    // Bắt lỗi từ khối try, không để một dependency ngoài làm hỏng toàn bộ đợt xử lý.
    } catch (error) {
      // Ghi sự kiện `console.error('Google Translate failed', error);` phục vụ chẩn đoán mà không đổi kết quả nghiệp vụ.
      console.error('Google Translate failed', error);
      // Trả `digest;` cho caller và kết thúc nhánh hiện tại.
      return digest;
    }
  }

  /**
   * Hàm `translateText` dịch nội dung và giữ fallback khi provider lỗi; kết quả được trả cho caller theo kiểu khai báo.
   *
   * Được sử dụng tại:
   * - `src/services/google-translation.service.ts`
   */
  // Mở method `translateText` để dịch nội dung và giữ fallback khi provider lỗi.
  private async translateText(text: string): Promise<string> {
    // Tính `response` từ `await this.http.get('https://translate.googleapis.com/translate_a/single', {` và giữ bất biến trong phạm vi hiện tại.
    const response = await this.http.get('https://translate.googleapis.com/translate_a/single', {
      // Gán field `params` từ `{` để object khớp contract.
      params: {
        // Gán field `client` từ `'gtx',` để object khớp contract.
        client: 'gtx',
        // Gán field `sl` từ `'auto',` để object khớp contract.
        sl: 'auto',
        // Gán field `tl` từ `this.targetLanguage,` để object khớp contract.
        tl: this.targetLanguage,
        // Gán field `dt` từ `'t',` để object khớp contract.
        dt: 't',
        // Gán field `q` từ `text,` để object khớp contract.
        q: text,
      },
    });

    // Gán field `const data` từ `unknown = response.data;` để object khớp contract.
    const data: unknown = response.data;

    // Nếu `Array.isArray(data) && Array.isArray(data[0])` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (Array.isArray(data) && Array.isArray(data[0])) {
      // Tính `translated` từ `data[0]` và giữ bất biến trong phạm vi hiện tại.
      const translated = data[0]
        // Áp dụng `map` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
        .map((segment: unknown) =>
          // Gán field `Array.isArray(segment) && typeof segment[0] === string ? segment[0] ` từ `'',` để object khớp contract.
          Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : '',
        )
        // Áp dụng `join` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
        .join('');

      // Trả `translated || text;` cho caller và kết thúc nhánh hiện tại.
      return translated || text;
    }

    // Trả `text;` cho caller và kết thúc nhánh hiện tại.
    return text;
  }
}

/**
 * Hàm `splitDigestForTranslation` chia nội dung theo giới hạn của API đích; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/google-translation.service.ts`
 */
// Mở thân hàm `splitDigestForTranslation` với input/output được TypeScript kiểm tra.
function splitDigestForTranslation(digest: string, maxChars: number): string[] {
  // Nếu `digest.length <= maxChars` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (digest.length <= maxChars) {
    // Trả `[digest];` cho caller và kết thúc nhánh hiện tại.
    return [digest];
  }

  // Gán field `const chunks` từ `string[] = [];` để object khớp contract.
  const chunks: string[] = [];
  // Khởi tạo trạng thái `current`; các nhánh bên dưới sẽ cập nhật nó có kiểm soát.
  let current = '';

  // Lặp theo `const block of digest.split(/\n{2,}/)` để xử lý đủ từng phần tử/trạng thái.
  for (const block of digest.split(/\n{2,}/)) {
    // Tính `candidate` từ `current ? `${current}\n\n${block}` : block;` và giữ bất biến trong phạm vi hiện tại.
    const candidate = current ? `${current}\n\n${block}` : block;

    // Nếu `candidate.length <= maxChars` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (candidate.length <= maxChars) {
      // Cập nhật `current` bằng `candidate;` cho bước kế tiếp.
      current = candidate;
      // Dùng `continue;` để bỏ qua/kết thúc vòng lặp sau khi điều kiện hiện tại đã rõ.
      continue;
    }

    // Nếu `current` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (current) {
      // Gọi `chunks.push` với `current` để hoàn tất side effect/bước xử lý hiện tại.
      chunks.push(current);
      // Cập nhật `current` bằng `'';` cho bước kế tiếp.
      current = '';
    }

    // Nếu `block.length <= maxChars` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (block.length <= maxChars) {
      // Cập nhật `current` bằng `block;` cho bước kế tiếp.
      current = block;
      // Dùng `continue;` để bỏ qua/kết thúc vòng lặp sau khi điều kiện hiện tại đã rõ.
      continue;
    }

    // Lặp theo `let index = 0; index < block.length; index += maxChars` để xử lý đủ từng phần tử/trạng thái.
    for (let index = 0; index < block.length; index += maxChars) {
      // Gọi `chunks.push` với `block.slice(index, index + maxChars)` để hoàn tất side effect/bước xử lý hiện tại.
      chunks.push(block.slice(index, index + maxChars));
    }
  }

  // Nếu `current` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (current) {
    // Gọi `chunks.push` với `current` để hoàn tất side effect/bước xử lý hiện tại.
    chunks.push(current);
  }

  // Trả `chunks;` cho caller và kết thúc nhánh hiện tại.
  return chunks;
}
