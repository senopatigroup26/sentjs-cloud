/**
 * Seed: buat akun superadmin awal
 * Jalankan: ts-node seeds/001_superadmin.ts
 * ENV: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME (opsional)
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import { pool } from '../src/config/database';
import * as bcrypt from 'bcrypt';

async function seed() {
  const email    = process.env.ADMIN_EMAIL    || 'admin@sentja.internal';
  const password = process.env.ADMIN_PASSWORD || 'Admin@2026!';
  const name     = process.env.ADMIN_NAME     || 'Super Admin';

  const hash = await bcrypt.hash(password, 12);

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    console.log(`Superadmin sudah ada: ${email}`);
    await pool.end();
    return;
  }

  const result = await pool.query(
    `INSERT INTO users (email, name, role, password_hash)
     VALUES ($1, $2, 'superadmin', $3) RETURNING id, email, role`,
    [email, name, hash]
  );

  console.log('Superadmin dibuat:');
  console.table(result.rows);
  console.log(`\nEmail   : ${email}`);
  console.log(`Password: ${password}`);
  console.log('\nSEGERA GANTI PASSWORD setelah login pertama!');

  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
