/**
 * Biên tập tuần tự các DigestMessage và render lại nội dung từ editorial đã validate.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp { ArticleEditorial } từ `./article-editorial.types` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { ArticleEditorial } from './article-editorial.types';
// Nạp { DigestMessage } từ `./digest.service` để dùng đúng dependency/type thay vì tự triển khai lại.
import type { DigestMessage } from './digest.service';
// Nạp { renderArticleMessage } từ `./digest.service` để dùng đúng dependency/type thay vì tự triển khai lại.
import { renderArticleMessage } from './digest.service';

/**
 * Interface `ArticleEditor` giới hạn hình dạng dữ liệu/dependency mà module chấp nhận, giúp test có thể inject fake đúng contract.
 *
 * Được sử dụng tại:
 * - `src/services/digest-message-editorial.service.ts`
 */
// Mở khai báo `interface ArticleEditor` để compiler kiểm tra contract cho mọi consumer.
interface ArticleEditor {
  editArticle(
    // Gán field `article` từ `DigestMessage['article'],` để object khớp contract.
    article: DigestMessage['article'],
    // Gán field `topic` từ `DigestMessage['topic'],` để object khớp contract.
    topic: DigestMessage['topic'],
  ): Promise<ArticleEditorial>;
}

/**
 * Hàm `editDigestMessages` biên tập nội dung và giữ contract message; kết quả được trả cho caller theo kiểu khai báo.
 *
 * Được sử dụng tại:
 * - `src/controllers/news.controller.ts`
 * - `src/controllers/telegram.controller.ts`
 * - `tests/services/digest-message-editorial.service.test.ts`
 */
// Mở thân hàm `editDigestMessages` với input/output được TypeScript kiểm tra.
export async function editDigestMessages(
  // Gán field `messages` từ `DigestMessage[],` để object khớp contract.
  messages: DigestMessage[],
  // Gán field `editorialService` từ `ArticleEditor,` để object khớp contract.
  editorialService: ArticleEditor,
): Promise<DigestMessage[]> {
  // Trả `Promise.all(` cho caller và kết thúc nhánh hiện tại.
  return Promise.all(
    messages.map(async (message) => ({
      ...message,
      // Gán field `text` từ `renderArticleMessage(` để object khớp contract.
      text: renderArticleMessage(
        message.article,
        message.topic,
        // Chờ `editorialService.editArticle(message.article, message.topic),` hoàn tất để giữ đúng thứ tự side effect.
        await editorialService.editArticle(message.article, message.topic),
      ),
    })),
  );
}
