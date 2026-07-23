/**
 * Định nghĩa contract chung mà mọi crawler phải triển khai để chuyển cấu hình nguồn thành Article[].
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { Article } from '../types/article';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { SourceConfig } from '../types/source';

/**
 * Interface `NewsCrawler` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 * - `src/crawlers/html.crawler.ts`
 * - `src/crawlers/rss.crawler.ts`
 * - `src/crawlers/x-search.crawler.ts`
 * - `src/services/source.service.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export interface NewsCrawler<TSource extends SourceConfig = SourceConfig> {
  /**
   * Hàm `crawl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/crawlers/github-repos.crawler.ts`
   * - `src/crawlers/html.crawler.ts`
   * - `src/crawlers/rss.crawler.ts`
   * - `src/crawlers/x-search.crawler.ts`
   * - `src/services/source.service.ts`
   * - `tests/crawlers/github-repos.crawler.test.ts`
   * - `tests/crawlers/html.crawler.test.ts`
   * - `tests/crawlers/rss.crawler.test.ts`
   * - `tests/crawlers/x-search.crawler.test.ts`
   * - `tests/services/source.service.test.ts`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  crawl(source: TSource): Promise<Article[]>;
}
