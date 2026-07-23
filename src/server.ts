/**
 * Điểm khởi động của tiến trình HTTP.
 *
 * Luồng chính: nạp cấu hình môi trường → tạo Express app trong `src/app.ts`
 * → mở cổng lắng nghe. Đây là entry point được `npm start` chạy trực tiếp,
 * vì vậy không có caller TypeScript nào trong `src/` hoặc `tests/`.
 */
import { createApp } from './app';
import { env } from './config/env';

// Khởi tạo toàn bộ middleware và router trước khi nhận request đầu tiên.
const app = createApp();

// Dùng PORT đã được `env.ts` kiểm tra để mở HTTP server.
app.listen(env.PORT, () => {
  // Ghi cổng thực tế để người vận hành biết tiến trình đã sẵn sàng.
  console.log(`Tech news service listening on port ${env.PORT}`);
});
