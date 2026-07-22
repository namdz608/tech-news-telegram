import express from 'express';
import { errorMiddleware } from './middlewares/error.middleware';
import { requestLogMiddleware } from './middlewares/request-log.middleware';
import { routes } from './routes';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(requestLogMiddleware);
  app.use(routes);
  app.use(errorMiddleware);

  return app;
}
