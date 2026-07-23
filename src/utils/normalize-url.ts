/**
 * Chuẩn hóa URL tương đối/tuyệt đối thành URL HTTP hợp lệ.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
/**
 * Hàm `normalizeUrl` chuẩn hóa giá trị theo rule của hàm; input sai được giữ nguyên, bỏ qua hoặc throw đúng như implementation; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/crawlers/html.crawler.ts`
 * - `src/crawlers/rss.crawler.ts`
 * - `tests/services/article.service.test.ts`
 */
// Mở thân hàm `normalizeUrl` với input/output được TypeScript kiểm tra.
export function normalizeUrl(input: string): string {
  // Tính `url` từ `new URL(input);` và giữ bất biến trong phạm vi hiện tại.
  const url = new URL(input);
  // Cập nhật `url.hash` bằng `'';` cho bước kế tiếp.
  url.hash = '';

  // Lặp theo `const key of [...url.searchParams.keys()]` để xử lý đủ từng phần tử/trạng thái.
  for (const key of [...url.searchParams.keys()]) {
    // Nếu `key.startsWith('utm_') || key === 'fbclid' || key === 'gclid'` đúng thì thực hiện block này; nếu sai, bỏ qua block và tiếp tục luồng.
    if (key.startsWith('utm_') || key === 'fbclid' || key === 'gclid') {
      // Gọi `url.searchParams.delete` với `key` để hoàn tất side effect/bước xử lý hiện tại.
      url.searchParams.delete(key);
    }
  }

  // Cập nhật `url.search` bằng `url.searchParams.toString();` cho bước kế tiếp.
  url.search = url.searchParams.toString();
  // Trả `url.toString().replace(/\/$/, '');` cho caller và kết thúc nhánh hiện tại.
  return url.toString().replace(/\/$/, '');
}
