import * as fs from 'fs';
import * as path from 'path';
import { pool } from '../config/database';
import { logger } from './logger';

async function runMigrations() {
  const client = await pool.connect();
  try {
    // Buat tabel tracking migrations
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        filename   VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, '../../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT id FROM _migrations WHERE filename = $1',
        [file]
      );
      if (rows.length > 0) {
        logger.debug(`Skipping migration (already applied): ${file}`);
        continue;
      }

      logger.info(`Applying migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        logger.info(`Migration applied: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    logger.info('All migrations complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  logger.error('Migration failed:', err);
  process.exit(1);
});
