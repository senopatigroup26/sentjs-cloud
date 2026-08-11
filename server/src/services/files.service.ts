import { query } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { FileRow } from '../types';
import { writeAuditLog } from './audit.service';
import { parsePagination, buildMeta } from '../utils/pagination';

export async function listFiles(filters: any) {
  const { page, limit, offset } = parsePagination(filters);
  if (!filters.device_id) throw new AppError('BAD_REQUEST', 'device_id wajib diisi.', 400);

  const conditions: string[] = ['f.device_id = $1'];
  const params: any[] = [filters.device_id];
  let i = 2;

  if (filters.status) { conditions.push(`f.status = $${i++}`); params.push(filters.status); }
  if (filters.path)   { conditions.push(`f.local_path LIKE $${i++}`); params.push(filters.path + '%'); }

  const where = 'WHERE ' + conditions.join(' AND ');

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM files f ${where}`, params
  );
  const total = parseInt(countRes.rows[0].count, 10);

  const rows = await query(
    `SELECT *, size_bytes::bigint as size_bytes FROM files f ${where}
     ORDER BY f.file_name ASC
     LIMIT $${i++} OFFSET $${i++}`,
    [...params, limit, offset]
  );

  return { rows: rows.rows, meta: buildMeta(total, page, limit) };
}

export async function listAllFiles(filters: any) {
  const { page, limit, offset } = parsePagination(filters);
  const conditions: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (filters.device_id) { conditions.push(`f.device_id = $${i++}`); params.push(filters.device_id); }
  if (filters.status)    { conditions.push(`f.status = $${i++}`);    params.push(filters.status); }
  if (filters.search)    { conditions.push(`f.file_name ILIKE $${i++}`); params.push(`%${filters.search}%`); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM files f ${where}`, params
  );
  const total = parseInt(countRes.rows[0].count, 10);

  const rows = await query(
    `SELECT f.*, d.machine_name, u.name as user_name
     FROM files f
     JOIN devices d ON f.device_id = d.id
     JOIN users u ON d.user_id = u.id
     ${where}
     ORDER BY f.updated_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...params, limit, offset]
  );

  return { rows: rows.rows, meta: buildMeta(total, page, limit) };
}

export async function uploadComplete(
  deviceId: string,
  data: {
    file_name: string;
    file_path?: string;
    remote_path: string;
    file_hash?: string;
    file_size?: number;
    // legacy
    local_path?: string;
    checksum_sha256?: string;
    size_bytes?: number;
    mime_type?: string;
    last_modified_at?: string;
  },
  ip?: string
) {
  const localPath     = data.file_path ?? data.local_path ?? data.file_name;
  const checksum      = data.file_hash ?? data.checksum_sha256 ?? '';
  const sizeBytes     = data.file_size ?? data.size_bytes ?? 0;

  // Upsert file record
  const result = await query<FileRow>(
    `INSERT INTO files (device_id, remote_path, local_path, file_name, file_extension, checksum_sha256, size_bytes, mime_type, status, last_modified_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'synced', $9)
     ON CONFLICT (device_id, remote_path) DO UPDATE SET
       checksum_sha256 = EXCLUDED.checksum_sha256,
       size_bytes      = EXCLUDED.size_bytes,
       mime_type       = EXCLUDED.mime_type,
       status          = 'synced',
       last_modified_at = EXCLUDED.last_modified_at,
       error_message   = NULL,
       updated_at      = NOW()
     RETURNING *`,
    [
      deviceId,
      data.remote_path,
      localPath,
      data.file_name,
      data.file_name.includes('.') ? data.file_name.split('.').pop() : null,
      checksum,
      sizeBytes,
      data.mime_type ?? null,
      data.last_modified_at ?? null,
    ]
  );

  const file = result.rows[0];

  await writeAuditLog({
    device_id: deviceId,
    action: 'FILE_UPLOADED',
    detail_json: { file_id: file.id, file_name: data.file_name, size_bytes: data.size_bytes, checksum: data.checksum_sha256 },
    ip_address: ip,
  });

  return { file_id: file.id, status: file.status, verified: true };
}

export async function markDehydrated(fileId: string, deviceId: string, ip?: string) {
  const result = await query<FileRow>(
    `UPDATE files
     SET status = 'dehydrated', dehydrated_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND device_id = $2 AND status = 'synced'
     RETURNING *`,
    [fileId, deviceId]
  );

  if (result.rows.length === 0) {
    throw new AppError('FILE_NOT_FOUND', 'File tidak ditemukan atau status tidak valid untuk dehydrate.', 404);
  }

  const file = result.rows[0];
  await writeAuditLog({
    device_id: deviceId,
    action: 'FILE_DEHYDRATED',
    detail_json: { file_id: fileId, file_name: file.file_name },
    ip_address: ip,
  });

  return { file_id: fileId, status: 'dehydrated', dehydrated_at: file.dehydrated_at };
}

export async function markDeleted(deviceId: string, filePath: string, ip?: string) {
  const result = await query<FileRow>(
    `UPDATE files
     SET status = 'deleted', updated_at = NOW()
     WHERE device_id = $1 AND (local_path = $2 OR file_name = $2)
     RETURNING *`,
    [deviceId, filePath]
  );

  if (result.rows.length === 0) {
    throw new AppError('FILE_NOT_FOUND', 'File tidak ditemukan.', 404);
  }

  const file = result.rows[0];
  await writeAuditLog({
    device_id: deviceId,
    action: 'FILE_DELETED_LOCAL',
    detail_json: { file_id: file.id, file_name: file.file_name, file_path: filePath },
    ip_address: ip,
  });

  return { file_id: file.id, status: 'deleted' };
}


