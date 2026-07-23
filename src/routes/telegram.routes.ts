/**
 * Khai báo endpoint kích hoạt gửi bản tin Telegram theo yêu cầu.
 *
 * Luồng: POST request → `sendDigest` controller → thu thập tin → dựng/biên tập
 * message → `TelegramService` gửi separator và từng bài tới chat cấu hình.
 */
import { Router } from 'express';
import { sendDigest } from '../controllers/telegram.controller';

/**
 * Router con cho tác vụ Telegram.
 *
 * Được sử dụng tại:
 * - `src/routes/index.ts`: mount vào router gốc.
 */
export const telegramRoutes = Router();
// Endpoint có side effect gửi tin, vì vậy dùng POST thay cho GET.
telegramRoutes.post('/telegram/send-digest', sendDigest);
