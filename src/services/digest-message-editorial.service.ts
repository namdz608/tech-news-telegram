/**
 * Biên tập tuần tự các DigestMessage và render lại nội dung từ editorial đã validate.
 *
 * Comment trong file mô tả từng bước biến đổi dữ liệu, nhánh lỗi/fallback
 * và nơi các class/hàm hiện được tham chiếu trong `src/` cùng `tests/`.
 */
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { ArticleEditorial } from './article-editorial.types';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import type { DigestMessage } from './digest.service';
// Nạp dependency hoặc type cần cho bước xử lý bên dưới.
import { renderArticleMessage } from './digest.service';

/**
 * Interface `ArticleEditor` mô tả contract dữ liệu/dependency tại bước này.
 *
 * Được sử dụng tại:
 * - `src/services/digest-message-editorial.service.ts`
 */
// Khai báo contract có kiểu để các caller dùng nhất quán.
interface ArticleEditor {
  // Bắt đầu method xử lý một trách nhiệm cục bộ của class.
  editArticle(
    // Gán field cấu trúc để tạo object đúng contract.
    article: DigestMessage['article'],
    // Gán field cấu trúc để tạo object đúng contract.
    topic: DigestMessage['topic'],
  // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
  ): Promise<ArticleEditorial>;
}

/**
 * Hàm `editDigestMessages` thực hiện bước xử lý được mô tả bởi tên và kiểu trả về.
 *
 * Được sử dụng tại:
 * - `src/controllers/news.controller.ts`
 * - `src/controllers/telegram.controller.ts`
 * - `tests/services/digest-message-editorial.service.test.ts`
 */
// Bắt đầu hàm và xác định rõ input/output qua TypeScript.
export async function editDigestMessages(
  // Gán field cấu trúc để tạo object đúng contract.
  messages: DigestMessage[],
  // Gán field cấu trúc để tạo object đúng contract.
  editorialService: ArticleEditor,
// Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
): Promise<DigestMessage[]> {
  // Kết thúc nhánh hiện tại và trả kết quả đã chuẩn hóa cho caller.
  return Promise.all(
    // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
    messages.map(async (message) => ({
      // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
      ...message,
      // Gán field cấu trúc để tạo object đúng contract.
      text: renderArticleMessage(
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        message.article,
        // Thực hiện bước biến đổi hoặc chuẩn bị dữ liệu cho câu lệnh kế tiếp.
        message.topic,
        // Chờ side effect bất đồng bộ hoàn tất trước khi tiếp tục.
        await editorialService.editArticle(message.article, message.topic),
      ),
    })),
  );
}
