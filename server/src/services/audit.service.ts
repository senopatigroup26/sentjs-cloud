import { query } from '../config/database';
import { logger } from '../utils/logger';

interface AuditEntry {
  user_id?: string | null;
  device_id?: string | null;
  action: string;
  detail_json?: Record<string, any>;
  ip_address?: string | null;
  user_agent?: string | null;
  severity?: 'info' | 'warning' | 'critical';
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, device_id, action, detail_json, ip_address, user_agent, severity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.user_id ?? null,
        entry.device_id ?? null,
        entry.action,
        entry.detail_json ? JSON.stringify(entry.detail_json) : null,
        entry.ip_address ?? null,
        entry.user_agent ?? null,
        entry.severity ?? 'info',
      ]
    );
  } catch (err) {
    logger.error('Failed to write audit log:', err);
    // Jangan throw — audit log failure tidak boleh gagalkan request utama
  }
}

export async function getAuditLogs(filters: {
  device_id?: string;
  user_id?: string;
  action?: string;
  severity?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}) {
  const conditions: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (filters.device_id) { conditions.push(`al.device_id = $${i++}`); params.push(filters.device_id); }
  if (filters.user_id)   { conditions.push(`al.user_id = $${i++}`);   params.push(filters.user_id); }
  if (filters.action)    { conditions.push(`al.action = $${i++}`);    params.push(filters.action); }
  if (filters.severity)  { conditions.push(`al.severity = $${i++}`);  params.push(filters.severity); }
  if (filters.from)      { conditions.push(`al.created_at >= $${i++}`); params.push(filters.from); }
  if (filters.to)        { conditions.push(`al.created_at <= $${i++}`); params.push(filters.to); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM audit_logs al ${where}`, params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const rows = await query(
    `SELECT al.*, u.name as user_name, d.machine_name
     FROM audit_logs al
     LEFT JOIN users u ON al.user_id = u.id
     LEFT JOIN devices d ON al.device_id = d.id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...params, filters.limit, filters.offset]
  );

  return { rows: rows.rows, total };
}
