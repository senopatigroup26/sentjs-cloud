import { query } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { DeviceRow } from '../types';
import { writeAuditLog } from './audit.service';
import { parsePagination, buildMeta } from '../utils/pagination';

export async function listDevices(filters: any) {
  const { page, limit, offset } = parsePagination(filters);
  const conditions: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (filters.status)  { conditions.push(`d.status = $${i++}`);   params.push(filters.status); }
  if (filters.user_id) { conditions.push(`d.user_id = $${i++}`);  params.push(filters.user_id); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM devices d ${where}`, params
  );
  const total = parseInt(countRes.rows[0].count, 10);

  const rows = await query(
    `SELECT d.*, u.name as user_name, u.email as user_email,
            up.policy as usb_policy
     FROM devices d
     LEFT JOIN users u ON d.user_id = u.id
     LEFT JOIN usb_policies up ON up.device_id = d.id
     ${where}
     ORDER BY d.registered_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...params, limit, offset]
  );

  return { rows: rows.rows, meta: buildMeta(total, page, limit) };
}

export async function getDevice(id: string, requestingUserId: string, requestingRole: string) {
  const result = await query(
    `SELECT d.*, u.name as user_name, u.email as user_email,
            up.policy as usb_policy, up.allow_known_devices,
            (SELECT COUNT(*) FROM files f WHERE f.device_id = d.id) as total_files,
            (SELECT COUNT(*) FROM files f WHERE f.device_id = d.id AND f.status = 'synced') as synced_files,
            mj.current_phase as migration_phase,
            mj.uploaded_count::float / NULLIF(mj.total_files, 0) * 100 as migration_progress
     FROM devices d
     LEFT JOIN users u ON d.user_id = u.id
     LEFT JOIN usb_policies up ON up.device_id = d.id
     LEFT JOIN migration_jobs mj ON mj.device_id = d.id AND mj.current_phase NOT IN ('completed','failed')
     WHERE d.id = $1`,
    [id]
  );

  const device = result.rows[0];
  if (!device) throw new AppError('DEVICE_NOT_FOUND', 'Perangkat tidak ditemukan.', 404);

  if (requestingRole === 'user' && device.user_id !== requestingUserId) {
    throw new AppError('FORBIDDEN', 'Anda tidak memiliki akses ke perangkat ini.', 403);
  }

  return device;
}

export async function updateDevicePolicy(
  id: string,
  data: { status: string; reason?: string },
  adminId: string,
  ip?: string
) {
  const result = await query<DeviceRow>(
    `UPDATE devices SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [data.status, id]
  );

  if (result.rows.length === 0) {
    throw new AppError('DEVICE_NOT_FOUND', 'Perangkat tidak ditemukan.', 404);
  }

  await writeAuditLog({
    user_id: adminId,
    device_id: id,
    action: data.status === 'suspended' ? 'DEVICE_SUSPENDED' : 'DEVICE_STATUS_CHANGED',
    detail_json: { new_status: data.status, reason: data.reason },
    ip_address: ip,
    severity: data.status === 'suspended' ? 'warning' : 'info',
  });

  return result.rows[0];
}

export async function deviceHeartbeat(
  deviceId: string,
  userId: string,
  ip?: string
) {
  const result = await query<DeviceRow>(
    `UPDATE devices SET last_seen_at = NOW(), last_ip = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING status`,
    [ip ?? null, deviceId]
  );

  if (result.rows.length === 0) {
    throw new AppError('DEVICE_NOT_FOUND', 'Perangkat tidak ditemukan.', 404);
  }

  const device = result.rows[0];
  if (device.status === 'suspended') {
    throw new AppError('DEVICE_SUSPENDED', 'Perangkat ini telah dinonaktifkan oleh admin.', 403);
  }
  if (device.status === 'decommissioned') {
    throw new AppError('DEVICE_DECOMMISSIONED', 'Perangkat ini telah dinonaktifkan permanen.', 403);
  }

  // Ambil info tambahan untuk client
  const usbPolicyRes = await query(
    'SELECT policy FROM usb_policies WHERE device_id = $1',
    [deviceId]
  );
  const migrationRes = await query(
    `SELECT current_phase FROM migration_jobs
     WHERE device_id = $1 AND current_phase NOT IN ('completed','failed','idle')
     LIMIT 1`,
    [deviceId]
  );

  return {
    device_status: device.status,
    usb_policy: usbPolicyRes.rows[0]?.policy ?? 'block',
    has_pending_migration: migrationRes.rows.length > 0,
    server_time: new Date().toISOString(),
  };
}
