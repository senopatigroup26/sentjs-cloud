import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/app';
import { logger } from './utils/logger';
import { errorMiddleware } from './middleware/error.middleware';

import authRoutes       from './routes/auth.routes';
import devicesRoutes    from './routes/devices.routes';
import filesRoutes      from './routes/files.routes';
import migrationRoutes  from './routes/migration.routes';
import permissionsRoutes from './routes/permissions.routes';
import auditRoutes      from './routes/audit.routes';
import adminRoutes      from './routes/admin.routes';
import systemRoutes     from './routes/system.routes';

const app = express();

// ── Security ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.cors.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const publicLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxPublic,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Terlalu banyak request. Coba lagi sebentar.' } },
});

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',        publicLimiter, authRoutes);
app.use('/api/devices',     devicesRoutes);
app.use('/api/files',       filesRoutes);
app.use('/api/migration',   migrationRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/audit',       auditRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/system',      systemRoutes);

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorMiddleware);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  logger.info(`Sentja Cloud API running on port ${config.port} [${config.env}]`);
});

export default app;
