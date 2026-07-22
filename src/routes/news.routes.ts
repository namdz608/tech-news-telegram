import { Router } from 'express';
import { createDigest, getLatestNews, listSources } from '../controllers/news.controller';

export const newsRoutes = Router();
newsRoutes.get('/news/sources', listSources);
newsRoutes.get('/news/latest', getLatestNews);
newsRoutes.post('/news/digest', createDigest);
