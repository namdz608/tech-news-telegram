/**
 * Router tổng hợp của ứng dụng.
 *
 * Đây là cầu nối giữa `createApp()` và ba nhóm endpoint health/news/Telegram.
 * Router này không xử lý nghiệp vụ; nó chỉ giữ thứ tự mount các router con.
 */
import { Router } from 'express';
import { healthRoutes } from './health.routes';
import { newsRoutes } from './news.routes';
import { telegramRoutes } from './telegram.routes';

/**
 * Router gốc được mount trực tiếp trong `src/app.ts`.
 *
 * Được sử dụng tại:
 * - `src/app.ts`: `app.use(routes)` chuyển mọi request vào router này.
 */
export const routes = Router();

// Đăng ký endpoint kiểm tra sức khỏe trước các endpoint nghiệp vụ.
routes.use(healthRoutes);
// Đăng ký các endpoint đọc nguồn tin, lấy bài mới và dựng digest.
routes.use(newsRoutes);
// Đăng ký endpoint kích hoạt thu thập và gửi digest lên Telegram.
routes.use(telegramRoutes);
