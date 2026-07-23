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
 * - `src/crawlers/github-repos.crawler.ts:6`
 * - `src/crawlers/github-repos.crawler.ts:39`
 * - `src/crawlers/html.crawler.ts:9`
 * - `src/crawlers/html.crawler.ts:15`
 * - `src/crawlers/rss.crawler.ts:11`
 * - `src/crawlers/rss.crawler.ts:41`
 * - `src/crawlers/x-search.crawler.ts:7`
 * - `src/crawlers/x-search.crawler.ts:37`
 * - `src/services/source.service.ts:4`
 * - `src/services/source.service.ts:10`
 * - `src/services/source.service.ts:11`
 * - `src/services/source.service.ts:12`
 * - `src/services/source.service.ts:13`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
export interface NewsCrawler<TSource extends SourceConfig = SourceConfig> {
  /**
   * Hàm `crawl` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
   *
   * Được sử dụng tại:
   * - `src/crawlers/github-repos.crawler.ts:49`
   * - `src/crawlers/github-repos.crawler.ts:57`
   * - `src/crawlers/html.crawler.ts:25`
   * - `src/crawlers/rss.crawler.ts:62`
   * - `src/crawlers/x-search.crawler.ts:47`
   * - `src/services/source.service.ts:29`
   * - `src/services/source.service.ts:33`
   * - `src/services/source.service.ts:37`
   * - `src/services/source.service.ts:40`
   * - `src/services/source.service.ts:42`
   * - `tests/crawlers/github-repos.crawler.test.ts:90`
   * - `tests/crawlers/github-repos.crawler.test.ts:145`
   * - `tests/crawlers/github-repos.crawler.test.ts:181`
   * - `tests/crawlers/github-repos.crawler.test.ts:182`
   * - `tests/crawlers/github-repos.crawler.test.ts:183`
   * - `tests/crawlers/html.crawler.test.ts:35`
   * - `tests/crawlers/html.crawler.test.ts:60`
   * - `tests/crawlers/rss.crawler.test.ts:57`
   * - `tests/crawlers/rss.crawler.test.ts:94`
   * - `tests/crawlers/rss.crawler.test.ts:123`
   * - `tests/crawlers/rss.crawler.test.ts:150`
   * - `tests/crawlers/rss.crawler.test.ts:190`
   * - `tests/crawlers/rss.crawler.test.ts:241`
   * - `tests/crawlers/rss.crawler.test.ts:300`
   * - `tests/crawlers/rss.crawler.test.ts:346`
   * - `tests/crawlers/rss.crawler.test.ts:390`
   * - `tests/crawlers/x-search.crawler.test.ts:51`
   * - `tests/crawlers/x-search.crawler.test.ts:94`
   * - `tests/services/source.service.test.ts:38`
   * - `tests/services/source.service.test.ts:39`
   * - `tests/services/source.service.test.ts:40`
   * - `tests/services/source.service.test.ts:85`
   * - `tests/services/source.service.test.ts:86`
   * - `tests/services/source.service.test.ts:87`
   * - `tests/services/source.service.test.ts:124`
   * - `tests/services/source.service.test.ts:125`
   * - `tests/services/source.service.test.ts:126`
   * - `tests/services/source.service.test.ts:171`
   * - `tests/services/source.service.test.ts:172`
   * - `tests/services/source.service.test.ts:173`
   * - `tests/services/source.service.test.ts:209`
   * - `tests/services/source.service.test.ts:210`
   * - `tests/services/source.service.test.ts:211`
   * - `tests/services/source.service.test.ts:243`
   * - `tests/services/source.service.test.ts:244`
   * - `tests/services/source.service.test.ts:245`
   * - `tests/services/source.service.test.ts:246`
   */
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  crawl(source: TSource): Promise<Article[]>;
}
