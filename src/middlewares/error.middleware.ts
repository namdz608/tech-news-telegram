/**
 * Error-handling middleware cuối pipeline Express.
 *
 * Nhận lỗi được middleware/controller phía trước chuyển tới, ghi log nội bộ
 * và trả thông báo chung để không làm lộ stack trace cho client.
 */
import type { NextFunction, Request, Response } from 'express';

/**
 * Chuyển mọi lỗi chưa xử lý thành HTTP 500.
 *
 * Được sử dụng tại:
 * - `src/app.ts`: được mount sau router để nhận lỗi từ toàn bộ endpoint.
 */
export function errorMiddleware(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Ghi object lỗi đầy đủ ở server để phục vụ chẩn đoán.
  console.error(error);
  // Trả payload ổn định và cố ý không đưa chi tiết lỗi ra ngoài.
  res.status(500).json({ error: 'Internal server error' });
}
