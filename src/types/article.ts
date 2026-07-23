/**
 * Mô hình dữ liệu chuẩn mà mọi crawler phải trả về.
 *
 * Article đi xuyên suốt luồng crawler → SourceService → article filtering
 * → DigestService → editorial/Telegram.
 *
 * Được sử dụng tại:
 * - `src/crawlers/crawler.types.ts` và bốn crawler implementation.
 * - `src/services/article.service.ts`, `source.service.ts`, `digest.service.ts`.
 * - `src/services/article-editorial.service.ts`.
 * - `tests/services/source.service.test.ts` và các crawler/service tests tạo Article fixture.
 */
import type { TopicKey } from './topic';

/**
 * Một tin công nghệ đã được chuẩn hóa, độc lập với định dạng nguồn ban đầu.
 * Các caller cụ thể được liệt kê trong block cấp file ngay phía trên.
 */
export interface Article {
  // ID duy nhất trong phạm vi nguồn.
  id: string;
  // Khóa và tên nguồn phục vụ dedupe, scoring và hiển thị.
  sourceId: string;
  sourceName: string;
  // Nội dung cốt lõi và URL canonical của bài.
  title: string;
  url: string;
  // Metadata tùy chọn vì không phải nguồn nào cũng cung cấp đủ.
  summary?: string;
  imageUrl?: string;
  author?: string;
  publishedAt?: string;
  // Luôn có thời điểm hệ thống thu thập để fallback khi thiếu publishedAt.
  collectedAt: string;
  // Một bài có thể thuộc nhiều TopicKey.
  topics: TopicKey[];
}
