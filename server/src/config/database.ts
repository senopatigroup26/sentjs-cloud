import { Pool } from 'pg';
import { config } from './app';
import { logger } from '../utils/logger';

export const pool = new Pool({
  connectionString: config.db.url,
  ssl: { rejectUnauthorized: false },
  min: 0,       // serverless: jangan buat koneksi saat startup
  max: 5,       // batasi koneksi untuk serverless
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  logger.error('PostgreSQL pool error:', err);
});

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    logger.warn(`Slow query (${duration}ms): ${text.substring(0, 100)}`);
  }
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

export async function getClient() {
  return pool.connect();
}
