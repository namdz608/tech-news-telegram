/**
 * Ghép các thành phần Express thành một ứng dụng có thể chạy thật hoặc test.
 *
 * Luồng request: JSON parser → request logger → router nghiệp vụ → error handler.
 * File này nhận router/middleware từ các module con và trả Express app cho
 * `src/server.ts` hoặc các integration test dùng Supertest.
 */
import express from 'express';
import { errorMiddleware } from './middlewares/error.middleware';
import { requestLogMiddleware } from './middlewares/request-log.middleware';
import { routes } from './routes';

/**
 * Tạo một Express application mới với thứ tự middleware cố định.
 *
 * @returns Express app đã gắn parser, logger, routes và error handler.
 * @remarks Không mở cổng mạng; việc lắng nghe thuộc trách nhiệm của `server.ts`.
 *
 * Được sử dụng tại:
 * - `src/server.ts`: tạo app production trước khi gọi `listen`.
 * - `tests/routes/health.routes.test.ts`: tạo app cô lập để test `/health`.
 * - `tests/routes/news.routes.test.ts`: tạo app cô lập để test news routes.
 */
export function createApp() {
  // Mỗi lần gọi trả một instance riêng, giúp các test không chia sẻ Express state.
  const app = express();

  // Parse request body JSON trước khi controller nghiệp vụ đọc dữ liệu.
  app.use(express.json());
  // Ghi method/path của mọi request rồi chuyển quyền xử lý cho middleware sau.
  app.use(requestLogMiddleware);
  // Chuyển request tới health, news hoặc Telegram router phù hợp.
  app.use(routes);
  // Đặt error handler cuối cùng để nhận lỗi được `next(error)` truyền xuống.
  app.use(errorMiddleware);

  // Trả app đã cấu hình; caller tự quyết định listen hoặc truyền cho Supertest.
  return app;
}
