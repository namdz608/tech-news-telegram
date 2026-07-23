/**
 * Điều phối use case thu thập tin và gửi trực tiếp lên Telegram.
 *
 * Khác `news.controller.ts`, controller này tạo side effect bên ngoài:
 * sau khi dựng/biên tập message, nó gọi Telegram API trước khi trả JSON.
 */
import type { Request, Response } from 'express';
import { ArticleEditorialService } from '../services/article-editorial.service';
import { DigestService } from '../services/digest.service';
import { editDigestMessages } from '../services/digest-message-editorial.service';
import { SourceService } from '../services/source.service';
import { TelegramService } from '../services/telegram.service';

// Thu thập Article từ toàn bộ nguồn được bật trong cấu hình.
const sourceService = new SourceService();
// Chuyển Article[] thành DigestMessage[] theo topic và độ ưu tiên.
const digestService = new DigestService();
// Bao bọc Telegram client, chunking, ảnh và các nhánh fallback.
const telegramService = new TelegramService();
// Biên tập nội dung từng bài trước khi gửi ra ngoài.
const articleEditorialService = new ArticleEditorialService();

/**
 * Thu thập, biên tập và gửi một đợt message Telegram.
 *
 * Được sử dụng tại:
 * - `src/routes/telegram.routes.ts`: handler của `POST /telegram/send-digest`.
 */
export async function sendDigest(_req: Request, res: Response) {
  // Bước 1: crawl và chuẩn hóa nguồn thành Article[] đã lọc.
  const articles = await sourceService.collectLatest();
  // Bước 2: chọn bài cân bằng theo topic rồi render message cơ sở.
  const messages = digestService.buildDigestMessages(articles);
  // Bước 3: tạo editorial tiếng Việt/structured cho từng message.
  const editedMessages = await editDigestMessages(messages, articleEditorialService);
  // Bước 4: gửi separator và từng message; chỉ trả response sau khi gửi xong.
  await telegramService.sendMessages(editedMessages);

  // Xác nhận request đã hoàn tất side effect và cung cấp số liệu đợt gửi.
  res.json({
    // Cờ thành công chỉ được trả sau khi `sendMessages` resolve.
    sent: true,
    // Tổng bài thu thập được sau lọc.
    articleCount: articles.length,
    // Tổng message đã biên tập và chuyển cho TelegramService.
    messageCount: editedMessages.length,
    // Ngôn ngữ đầu ra theo contract hiện tại.
    language: 'vi',
  });
}
