/**
 * Khai báo endpoint kích hoạt gửi bản tin Telegram theo yêu cầu.
 *
 * Luồng: POST request → `sendDigest` / `sendJobs` controller → thu thập tin →
 * dựng/biên tập message → `TelegramService` gửi separator và từng bài tới chat cấu hình.
 */
import { Router } from 'express';
import { sendDigest, sendGadgets, sendGoldPolitics, sendHealth, sendJobs } from '../controllers/telegram.controller';

/**
 * Router con cho tác vụ Telegram.
 *
 * Được sử dụng tại:
 * - `src/routes/index.ts`: mount vào router gốc.
 */
export const telegramRoutes = Router();
// Endpoint có side effect gửi tin, vì vậy dùng POST thay cho GET.
telegramRoutes.post('/telegram/send-digest', sendDigest);
telegramRoutes.post('/telegram/send-gadgets', sendGadgets);
telegramRoutes.post('/telegram/send-health', sendHealth);
telegramRoutes.post('/telegram/send-gold-politics', sendGoldPolitics);
// Endpoint riêng cho tin tuyển dụng VN; không trộn vào digest tech.
telegramRoutes.post('/telegram/send-jobs', sendJobs);
