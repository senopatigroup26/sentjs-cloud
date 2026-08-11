import { query } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { writeAuditLog } from './audit.service';
import { parsePagination, buildMeta } from '../utils/pagination';

export async function requestPermission(
  deviceId: string,
  userId: string,
  data: { action: string; file_id?: string; request_reason?: string },
  ip?: string
) {
  const result = await query(
    `INSERT INTO permissions (user_id, device_id, file_id, action, request_reason)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, deviceId, data.file_id ?? null, data.action, data.request_reason ?? null]
  );

  const permId = result.rows[0].id;
  await writeAuditLog({
    user_id: userId, device_id: deviceId,
    action: 'PERMISSION_REQUESTED',
    detail_json: { permission_id: permId, action: data.action, file_id: data.file_id },
    ip_address: ip,
  });

  return { permission_id: permId, status: 'pending', message: 'Permintaan dikirim ke admin.' };
}

export async function getPendingPermissions(filters: any) {
  const { page, limit, offset } = parsePagination(filters);
  const conditions = ['p.status = \'pending\''];
  const params: any[] = [];
  let i = 1;

  if (filters.device_id) { conditions.push(`p.device_id = $${i++}`); params.push(filters.device_id); }
  if (filters.action)    { conditions.push(`p.action = $${i++}`);    params.push(filters.action); }

  const where = 'WHERE ' + conditions.join(' AND ');
  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM permissions p ${where}`, params
  );
  const total = parseInt(countRes.rows[0].count, 10);

  const rows = await query(
    `SELECT p.*,
            u.name as user_name, u.email as user_email,
            d.machine_name,
            f.file_name, f.local_path as file_path
     FROM permissions p
     JOIN users u ON p.user_id = u.id
     JOIN devices d ON p.device_id = d.id
     LEFT JOIN files f ON p.file_id = f.id
     ${where}
     ORDER BY p.requested_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...params, limit, offset]
  );

  return { rows: rows.rows, meta: buildMeta(total, page, limit) };
}

export async function approvePermission(
  permId: string,
  adminId: string,
  data: { expires_at?: string; max_uses?: number; notes?: string },
  ip?: string
) {
  const result = await query(
    `UPDATE permissions SET
       status = 'approved', granted_by = $1, reviewed_at = NOW(),
       expires_at = $2, max_uses = $3, updated_at = NOW()
     WHERE id = $4 AND status = 'pending'
     RETURNING *`,
    [adminId, data.expires_at ?? null, data.max_uses ?? null, permId]
  );

  if (result.rows.length === 0)
    throw new AppError('PERMISSION_NOT_FOUND', 'Permission request tidak ditemukan atau sudah diproses.', 404);

  const p = result.rows[0];
  await writeAuditLog({
    user_id: adminId, device_id: p.device_id,
    action: 'PERMISSION_APPROVED',
    detail_json: { permission_id: permId, action: p.action, expires_at: data.expires_at },
    ip_address: ip,
  });

  return { permission_id: permId, status: 'approved', expires_at: p.expires_at, max_uses: p.max_uses };
}

export async function denyPermission(
  permId: string,
  adminId: string,
  data: { deny_reason?: string },
  ip?: string
) {
  const result = await query(
    `UPDATE permissions SET
       status = 'denied', granted_by = $1, deny_reason = $2, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $3 AND status = 'pending' RETURNING *`,
    [adminId, data.deny_reason ?? null, permId]
  );

  if (result.rows.length === 0)
    throw new AppError('PERMISSION_NOT_FOUND', 'Permission request tidak ditemukan.', 404);

  const p = result.rows[0];
  await writeAuditLog({
    user_id: adminId, device_id: p.device_id,
    action: 'PERMISSION_DENIED',
    detail_json: { permission_id: permId, reason: data.deny_reason },
    ip_address: ip, severity: 'warning',
  });

  return { permission_id: permId, status: 'denied' };
}

export async function checkPermission(deviceId: string, action: string, fileId?: string) {
  const rows = await query(
    `SELECT * FROM permissions
     WHERE device_id = $1 AND action = $2
       AND status = 'approved'
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR used_count < max_uses)
       AND (file_id IS NULL OR file_id = $3)
     ORDER BY requested_at DESC LIMIT 1`,
    [deviceId, action, fileId ?? null]
  );

  if (rows.rows.length === 0) {
    return { granted: false, reason: 'Tidak ada permission aktif untuk action ini.' };
  }

  const p = rows.rows[0];
  return {
    granted: true,
    permission_id: p.id,
    expires_at: p.expires_at,
    remaining_uses: p.max_uses ? p.max_uses - p.used_count : null,
  };
}
