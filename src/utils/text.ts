/**
 * Cung cấp các phép compact, escape HTML và match keyword dùng xuyên pipeline.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
/**
 * Hàm `compactText` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts:16`
 * - `src/crawlers/github-repos.crawler.ts:432`
 * - `src/crawlers/html.crawler.ts:22`
 * - `src/crawlers/html.crawler.ts:196`
 * - `src/crawlers/html.crawler.ts:213`
 * - `src/crawlers/html.crawler.ts:251`
 * - `src/crawlers/rss.crawler.ts:26`
 * - `src/crawlers/rss.crawler.ts:291`
 * - `src/crawlers/rss.crawler.ts:293`
 * - `src/crawlers/x-search.crawler.ts:18`
 * - `src/crawlers/x-search.crawler.ts:442`
 * - `src/services/article-editorial.service.ts:14`
 * - `src/services/article-editorial.service.ts:190`
 * - `src/services/article-editorial.service.ts:250`
 * - `src/services/digest.service.ts:18`
 * - `src/services/digest.service.ts:534`
 * - `src/services/digest.service.ts:536`
 * - `src/services/digest.service.ts:538`
 * - `src/services/digest.service.ts:729`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export function compactText(value: string): string {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Hàm `escapeHtml` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts:18`
 * - `src/services/digest.service.ts:545`
 * - `src/services/digest.service.ts:551`
 * - `src/services/digest.service.ts:573`
 * - `src/services/digest.service.ts:591`
 * - `src/services/digest.service.ts:597`
 * - `src/services/digest.service.ts:601`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export function escapeHtml(value: string): string {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return value
    // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
    .replace(/&/g, '&amp;')
    // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
    .replace(/</g, '&lt;')
    // Tiếp tục biến đổi dữ liệu theo chuỗi thao tác bất biến.
    .replace(/>/g, '&gt;');
}

/**
 * Hàm `includesKeyword` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/services/article.service.ts:14`
 * - `src/services/article.service.ts:52`
 * - `src/services/digest.service.ts:18`
 * - `src/services/digest.service.ts:489`
 * - `src/services/digest.service.ts:495`
 * - `src/services/digest.service.ts:501`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export function includesKeyword(text: string, keyword: string): boolean {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const normalizedText = text.toLowerCase();
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const normalizedKeyword = keyword.toLowerCase();

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  if (/^[a-z0-9]{1,3}$/.test(normalizedKeyword)) {
    // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
    return new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`, 'i').test(normalizedText);
  }

  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return normalizedText.includes(normalizedKeyword);
}

/**
 * Hàm `escapeRegExp` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/utils/text.ts:17`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
function escapeRegExp(value: string): string {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
