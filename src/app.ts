import cors from 'cors';
import express from 'express';
import routes from './routes';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFound';
import { nowIso } from './utils/time';

export const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Backend is running',
    timestamp: nowIso()
  });
});

app.use('/api/v1', routes);

app.use(notFoundHandler);
app.use(errorHandler);
