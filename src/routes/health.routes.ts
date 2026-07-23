/**
 * Khai báo route kiểm tra tình trạng sống của HTTP service.
 *
 * Luồng: `routes/index.ts` → router này → `getHealth` → JSON `{ status: 'ok' }`.
 */
import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';

/**
 * Router con chứa endpoint health.
 *
 * Được sử dụng tại:
 * - `src/routes/index.ts`: được mount vào router gốc.
 * - Gián tiếp bởi `tests/routes/health.routes.test.ts` qua `createApp()`.
 */
export const healthRoutes = Router();
// Ánh xạ GET /health tới controller không phụ thuộc service bên ngoài.
healthRoutes.get('/health', getHealth);
