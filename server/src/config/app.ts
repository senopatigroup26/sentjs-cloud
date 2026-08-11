import dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-prod',
    accessExpiresIn: parseInt(process.env.JWT_ACCESS_EXPIRES_IN || '3600', 10),
    deviceExpiresIn: parseInt(process.env.JWT_DEVICE_EXPIRES_IN || '900', 10),
    refreshUserExpiresIn: parseInt(process.env.JWT_REFRESH_USER_EXPIRES_IN || '604800', 10),
    refreshDeviceExpiresIn: parseInt(process.env.JWT_REFRESH_DEVICE_EXPIRES_IN || '2592000', 10),
  },

  db: {
    url: process.env.DATABASE_URL || 'postgresql://sentja_user:password@localhost:5432/sentja_db',
  },

  sftp: {
    host: process.env.HETZNER_SFTP_HOST || '',
    port: parseInt(process.env.HETZNER_SFTP_PORT || '23', 10),
    user: process.env.HETZNER_SFTP_USER || '',
    password: process.env.HETZNER_SFTP_PASSWORD || '',
    basePath: process.env.HETZNER_BASE_PATH || '/sentja',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxPublic: parseInt(process.env.RATE_LIMIT_MAX_PUBLIC || '100', 10),
    maxDevice: parseInt(process.env.RATE_LIMIT_MAX_DEVICE || '1000', 10),
  },

  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(','),
  },
};
