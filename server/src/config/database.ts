import { Pool } from 'pg';
import { config } from './app';
import { logger } from '../utils/logger';

export const pool = new Pool({
  connectionString: config.db.url,
  min: 2,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
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
