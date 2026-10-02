import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { swaggerSpec } from './config/swagger';
import { authRouter } from './routes/auth';
import { incidentRouter } from './routes/incidents';
import { reviewRouter } from './routes/reviews';
import { stationRouter } from './routes/stations';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Verifica se a API está online
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API online
 */
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'AcessaMetrô API online',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRouter);
app.use('/api/stations', stationRouter);
app.use('/api/incidents', incidentRouter);
app.use('/api/reviews', reviewRouter);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
