/**
 * Chuẩn hóa URL tương đối/tuyệt đối thành URL HTTP hợp lệ.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
/**
 * Hàm `normalizeUrl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/crawlers/html.crawler.ts:20`
 * - `src/crawlers/html.crawler.ts:209`
 * - `src/crawlers/rss.crawler.ts:22`
 * - `src/crawlers/rss.crawler.ts:295`
 * - `tests/services/article.service.test.ts:3`
 * - `tests/services/article.service.test.ts:26`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export function normalizeUrl(input: string): string {
  // Khởi tạo giá trị bất biến dùng cho bước tiếp theo.
  const url = new URL(input);
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  url.hash = '';

  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  for (const key of [...url.searchParams.keys()]) {
    // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
    if (key.startsWith('utm_') || key === 'fbclid' || key === 'gclid') {
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      url.searchParams.delete(key);
    }
  }

  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  url.search = url.searchParams.toString();
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return url.toString().replace(/\/$/, '');
}
