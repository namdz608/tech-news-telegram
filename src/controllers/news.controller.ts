/**
 * Điều phối các use case HTTP liên quan tới nguồn tin và digest.
 *
 * Luồng đầy đủ: cấu hình/crawler → `SourceService` → `Article[]`
 * → `DigestService` → dịch digest + biên tập từng message → JSON response.
 */
import type { Request, Response } from 'express';
import { sources } from '../config/sources';
import { ArticleEditorialService } from '../services/article-editorial.service';
import { DigestService } from '../services/digest.service';
import { editDigestMessages } from '../services/digest-message-editorial.service';
import { SourceService } from '../services/source.service';
import { TranslationService } from '../services/translation.service';

// Dùng một SourceService dùng chung cho các request để tái sử dụng cấu hình/crawler.
const sourceService = new SourceService();
// Dùng một DigestService stateless để dựng digest text và message theo bài.
const digestService = new DigestService();
// Chọn translator theo cấu hình môi trường và cung cấp fallback khi dịch lỗi.
const translationService = new TranslationService();
// Chọn provider biên tập và chuẩn hóa editorial cho từng Article.
const articleEditorialService = new ArticleEditorialService();

/**
 * Trả danh sách cấu hình nguồn tin mà service biết tới.
 *
 * Được sử dụng tại:
 * - `src/routes/news.routes.ts`: handler của `GET /news/sources`.
 * - Gián tiếp bởi `tests/routes/news.routes.test.ts`.
 */
export function listSources(_req: Request, res: Response) {
  // Trả cấu hình tĩnh; endpoint này không gọi mạng và không crawl.
  res.json({ sources });
}

/**
 * Thu thập và trả các bài mới nhất đã lọc/dedupe.
 *
 * Được sử dụng tại:
 * - `src/routes/news.routes.ts`: handler của `GET /news/latest`.
 */
export async function getLatestNews(_req: Request, res: Response) {
  // Chờ tất cả crawler đang bật hoàn tất rồi nhận danh sách Article chuẩn hóa.
  const articles = await sourceService.collectLatest();
  // Trả nguyên Article[] để client tự hiển thị hoặc xử lý tiếp.
  res.json({ articles });
}

/**
 * Tạo cả digest text lẫn message theo bài, sau đó trả bản raw và bản tiếng Việt.
 *
 * Được sử dụng tại:
 * - `src/routes/news.routes.ts`: handler của `POST /news/digest`.
 */
export async function createDigest(_req: Request, res: Response) {
  // Bước 1: crawl, lọc tuổi/link và loại bài trùng từ mọi nguồn đang bật.
  const articles = await sourceService.collectLatest();
  // Bước 2a: dựng một digest text tổng hợp để phục vụ API tương thích cũ.
  const digest = digestService.buildDigest(articles);
  // Bước 2b: dựng danh sách message giàu cấu trúc, một message cho mỗi bài.
  const messages = digestService.buildDigestMessages(articles);
  // Bước 3a: dịch digest text sang ngôn ngữ đích; service tự fallback khi lỗi.
  const translatedDigest = await translationService.translateDigest(digest);
  // Bước 3b: biên tập/chuẩn hóa từng message qua provider được cấu hình.
  const editedMessages = await editDigestMessages(messages, articleEditorialService);

  // Trả đồng thời bản đã xử lý và raw để client so sánh hoặc debug pipeline.
  res.json({
    // Digest text sau dịch, dự kiến là tiếng Việt.
    digest: translatedDigest,
    // Digest gốc trước dịch.
    rawDigest: digest,
    // Các message đã biên tập, sẵn sàng cho Telegram/UI.
    messages: editedMessages,
    // Các message deterministic trước khi gọi provider biên tập.
    rawMessages: messages,
    // Số Article sống sót sau bước thu thập và lọc.
    articleCount: articles.length,
    // Số message thực tế trả về sau biên tập.
    messageCount: editedMessages.length,
    // Metadata giúp client biết ngôn ngữ đầu ra mong đợi.
    language: 'vi',
  });
}
