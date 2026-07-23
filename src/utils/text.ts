/**
 * Cung cấp các phép compact, escape HTML và match keyword dùng xuyên pipeline.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
/**
 * Hàm `compactText` thực hiện trách nhiệm `compact text` của module; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 * - `src/crawlers/html.crawler.ts`
 * - `src/crawlers/rss.crawler.ts`
 * - `src/crawlers/x-search.crawler.ts`
 * - `src/services/article-editorial.service.ts`
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `compactText` với input/output được TypeScript kiểm tra.
export function compactText(value: string): string {
  // Trả `value.replace(/\s+/g, ' ').trim();` cho caller và kết thúc nhánh hiện tại.
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Hàm `escapeHtml` escape ký tự có ý nghĩa đặc biệt; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `escapeHtml` với input/output được TypeScript kiểm tra.
export function escapeHtml(value: string): string {
  // Trả `value` cho caller và kết thúc nhánh hiện tại.
  return value
    // Áp dụng `replace` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
    .replace(/&/g, '&amp;')
    // Áp dụng `replace` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
    .replace(/</g, '&lt;')
    // Áp dụng `replace` để tiếp tục biến đổi kết quả trung gian mà không đổi input gốc.
    .replace(/>/g, '&gt;');
}

/**
 * Hàm `includesKeyword` kiểm tra keyword theo ranh giới từ; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/services/article.service.ts`
 * - `src/services/digest.service.ts`
 */
// Mở thân hàm `includesKeyword` với input/output được TypeScript kiểm tra.
export function includesKeyword(text: string, keyword: string): boolean {
  // Tính `normalizedText` từ `text.toLowerCase();` và giữ bất biến trong phạm vi hiện tại.
  const normalizedText = text.toLowerCase();
  // Tính `normalizedKeyword` từ `keyword.toLowerCase();` và giữ bất biến trong phạm vi hiện tại.
  const normalizedKeyword = keyword.toLowerCase();

  // Nếu `/^[a-z0-9]{1,3}$/.test(normalizedKeyword)` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
  if (/^[a-z0-9]{1,3}$/.test(normalizedKeyword)) {
    // Trả `new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`, 'i').test(normalizedText);` cho caller và kết thúc nhánh hiện tại.
    return new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`, 'i').test(normalizedText);
  }

  // Trả `normalizedText.includes(normalizedKeyword);` cho caller và kết thúc nhánh hiện tại.
  return normalizedText.includes(normalizedKeyword);
}

/**
 * Hàm `escapeRegExp` escape ký tự có ý nghĩa đặc biệt; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/utils/text.ts`
 */
// Mở thân hàm `escapeRegExp` với input/output được TypeScript kiểm tra.
function escapeRegExp(value: string): string {
  // Trả `value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');` cho caller và kết thúc nhánh hiện tại.
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
