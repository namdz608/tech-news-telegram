/**
 * Khai báo các HTTP endpoint phục vụ dữ liệu nguồn tin và digest.
 *
 * Router chỉ ánh xạ method/path sang controller; toàn bộ thu thập, lọc,
 * biên tập và dịch nằm trong service được `news.controller.ts` điều phối.
 */
import { Router } from 'express';
import { createDigest, getLatestNews, listSources } from '../controllers/news.controller';

/**
 * Router con cho nhóm `/news`.
 *
 * Được sử dụng tại:
 * - `src/routes/index.ts`: mount vào router gốc.
 * - Gián tiếp bởi `tests/routes/news.routes.test.ts` qua `createApp()`.
 */
export const newsRoutes = Router();
// Trả cấu hình nguồn tin hiện có mà không thực hiện crawl.
newsRoutes.get('/news/sources', listSources);
// Crawl các nguồn đang bật rồi trả danh sách Article đã lọc.
newsRoutes.get('/news/latest', getLatestNews);
// Crawl, dựng digest, dịch và biên tập message trong một request.
newsRoutes.post('/news/digest', createDigest);
