import { Router } from 'express';
import { healthRoutes } from './health.routes';
import { newsRoutes } from './news.routes';
import { telegramRoutes } from './telegram.routes';

export const routes = Router();

routes.use(healthRoutes);
routes.use(newsRoutes);
routes.use(telegramRoutes);
