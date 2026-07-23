/**
 * Middleware quan sát request ở đầu pipeline Express.
 *
 * Nó không thay đổi request/response; chỉ log method/path rồi gọi `next()`.
 */
import type { NextFunction, Request, Response } from 'express';

/**
 * Ghi một dòng log cho mỗi request và chuyển sang middleware kế tiếp.
 *
 * Được sử dụng tại:
 * - `src/app.ts`: được mount sau JSON parser và trước router.
 */
export function requestLogMiddleware(req: Request, _res: Response, next: NextFunction) {
  // Chỉ log method/path để tránh vô tình ghi body hoặc credential nhạy cảm.
  console.log(`${req.method} ${req.path}`);
  // Bắt buộc gọi `next` để request tiếp tục tới router; không tự tạo response.
  next();
}
