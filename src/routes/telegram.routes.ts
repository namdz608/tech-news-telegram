import { Router } from 'express';
import { sendDigest } from '../controllers/telegram.controller';

export const telegramRoutes = Router();
telegramRoutes.post('/telegram/send-digest', sendDigest);
