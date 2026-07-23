/**
 * Định nghĩa contract chung mà mọi crawler phải triển khai để chuyển cấu hình nguồn thành Article[].
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp { Article } từ `../types/article` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { Article } from '../types/article';
// Nạp { SourceConfig } từ `../types/source` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { SourceConfig } from '../types/source';

/**
 * Interface `NewsCrawler` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/crawlers/github-repos.crawler.ts`
 * - `src/crawlers/html.crawler.ts`
 * - `src/crawlers/rss.crawler.ts`
 * - `src/crawlers/x-search.crawler.ts`
 * - `src/services/source.service.ts`
 */
// Mở khai báo `export interface NewsCrawler<TSource extends SourceConfig` để compiler kiểm tra contract cho mọi consumer.
export interface NewsCrawler<TSource extends SourceConfig = SourceConfig> {
  // Gán field `crawl(source` từ `TSource): Promise<Article[]>;` để object khớp contract.
  crawl(source: TSource): Promise<Article[]>;
}
