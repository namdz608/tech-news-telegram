/**
 * Controller health tối giản, dùng để xác nhận tiến trình Express còn phản hồi.
 *
 * Không gọi database, crawler hay API ngoài nên endpoint phản ánh liveness,
 * không phải readiness của toàn bộ dependency.
 */
import type { Request, Response } from 'express';

/**
 * Trả HTTP 200 cùng payload trạng thái cố định.
 *
 * @param _req Request không được đọc; tên `_req` thể hiện chủ ý bỏ qua.
 * @param res Response dùng để kết thúc request bằng JSON.
 *
 * Được sử dụng tại:
 * - `src/routes/health.routes.ts`: handler của `GET /health`.
 * - Gián tiếp bởi `tests/routes/health.routes.test.ts`.
 */
export function getHealth(_req: Request, res: Response) {
  // `res.json` vừa serialize payload vừa kết thúc response với status mặc định 200.
  res.json({ status: 'ok' });
}
