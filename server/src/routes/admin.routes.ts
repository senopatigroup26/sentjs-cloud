import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { query } from '../config/database';
import { hashPassword } from '../services/auth.service';
import { writeAuditLog } from '../services/audit.service';
import { parsePagination, buildMeta } from '../utils/pagination';
import { downloadBuffer } from '../services/sftp.service';

const router = Router();
const wrap = (fn: Function) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ── Dashboard Stats ───────────────────────────────────────────────────────────
router.get('/dashboard', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (_req: Request, res: Response) => {
    const [users, devices, files, migrations, permissions, usbBlocks, recentLogs] = await Promise.all([
      query<{ count: string }>('SELECT COUNT(*) as count FROM users WHERE is_active = true'),
      query<{ status: string; count: string }>('SELECT status, COUNT(*) as count FROM devices GROUP BY status'),
      query<{ count: string; total_bytes: string }>(
        "SELECT COUNT(*) as count, COALESCE(SUM(size_bytes),0) as total_bytes FROM files WHERE status = 'synced'"
      ),
      query<{ count: string }>(
        "SELECT COUNT(*) as count FROM migration_jobs WHERE current_phase NOT IN ('completed','failed','idle')"
      ),
      query<{ count: string }>("SELECT COUNT(*) as count FROM permissions WHERE status = 'pending'"),
      query<{ count: string }>(
        "SELECT COUNT(*) as count FROM audit_logs WHERE action = 'USB_BLOCKED' AND created_at >= NOW() - INTERVAL '1 day'"
      ),
      query(
        `SELECT al.action, al.severity, al.created_at, al.ip_address,
                u.name as user_name, d.machine_name
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         LEFT JOIN devices d ON al.device_id = d.id
         ORDER BY al.created_at DESC LIMIT 10`
      ),
    ]);

    const devicesByStatus: Record<string, number> = {};
    devices.rows.forEach(r => { devicesByStatus[r.status] = parseInt(r.count, 10); });

    res.json({
      success: true,
      data: {
        total_users: parseInt(users.rows[0].count, 10),
        total_devices: Object.values(devicesByStatus).reduce((a, b) => a + b, 0),
        devices_by_status: devicesByStatus,
        total_files_synced: parseInt(files.rows[0].count, 10),
        total_storage_bytes: parseInt(files.rows[0].total_bytes, 10),
        active_migrations: parseInt(migrations.rows[0].count, 10),
        pending_permissions: parseInt(permissions.rows[0].count, 10),
        usb_blocks_today: parseInt(usbBlocks.rows[0].count, 10),
        recent_logs: recentLogs.rows,
      },
    });
  })
);

// ── Users CRUD ────────────────────────────────────────────────────────────────
router.get('/users', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const { page, limit, offset } = parsePagination(req.query);
    const { role, is_active, search } = req.query as any;

    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (role)      { conditions.push(`u.role = $${i++}`);      params.push(role); }
    if (is_active !== undefined) { conditions.push(`u.is_active = $${i++}`); params.push(is_active === 'true'); }
    if (search)    { conditions.push(`(u.name ILIKE $${i++} OR u.email ILIKE $${i++})`); params.push(`%${search}%`); params.push(`%${search}%`); i++; }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM users u ${where}`, params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const rows = await query(
      `SELECT u.id, u.email, u.name, u.role, u.is_active, u.last_login_at, u.created_at,
              COUNT(d.id) as device_count
       FROM users u
       LEFT JOIN devices d ON d.user_id = u.id
       ${where}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: rows.rows, meta: { pagination: buildMeta(total, page, limit) } });
  })
);

router.post('/users', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const schema = z.object({
      email: z.string().email(),
      name: z.string().min(1),
      role: z.enum(['user', 'admin']),
      password: z.string().min(8),
    });
    const data = schema.parse(req.body);

    const existing = await query('SELECT id FROM users WHERE email = $1', [data.email]);
    if (existing.rows.length > 0) {
      res.status(409).json({ success: false, error: { code: 'EMAIL_EXISTS', message: 'Email sudah terdaftar.' } });
      return;
    }

    const hash = await hashPassword(data.password);
    const result = await query(
      `INSERT INTO users (email, name, role, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, is_active, created_at`,
      [data.email, data.name, data.role, hash]
    );

    await writeAuditLog({
      user_id: req.user!.sub,
      action: 'ADMIN_USER_CREATED',
      detail_json: { new_user_id: result.rows[0].id, email: data.email, role: data.role },
      ip_address: req.ip,
      severity: 'warning',
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  })
);

router.put('/users/:id', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const schema = z.object({
      name: z.string().min(1).optional(),
      role: z.enum(['user', 'admin']).optional(),
      is_active: z.boolean().optional(),
      password: z.string().min(8).optional(),
    });
    const data = schema.parse(req.body);

    const sets: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (data.name      !== undefined) { sets.push(`name = $${i++}`);      params.push(data.name); }
    if (data.role      !== undefined) { sets.push(`role = $${i++}`);      params.push(data.role); }
    if (data.is_active !== undefined) { sets.push(`is_active = $${i++}`); params.push(data.is_active); }
    if (data.password  !== undefined) {
      const hash = await hashPassword(data.password);
      sets.push(`password_hash = $${i++}`);
      params.push(hash);
    }
    sets.push('updated_at = NOW()');
    params.push(req.params.id);

    if (sets.length === 1) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Tidak ada field yang diupdate.' } });
      return;
    }

    const result = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, email, name, role, is_active, updated_at`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User tidak ditemukan.' } });
      return;
    }

    await writeAuditLog({
      user_id: req.user!.sub, action: 'ADMIN_USER_UPDATED',
      detail_json: { target_user_id: req.params.id, changes: { ...data, password: data.password ? '[changed]' : undefined } },
      ip_address: req.ip, severity: 'warning',
    });

    res.json({ success: true, data: result.rows[0] });
  })
);

router.delete('/users/:id', authMiddleware, requireRole('superadmin'),
  wrap(async (req: Request, res: Response) => {
    if (req.params.id === req.user!.sub) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Tidak bisa menghapus akun sendiri.' } });
      return;
    }

    const result = await query(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, email`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User tidak ditemukan.' } });
      return;
    }

    await writeAuditLog({
      user_id: req.user!.sub, action: 'ADMIN_USER_DEACTIVATED',
      detail_json: { target_user_id: req.params.id },
      ip_address: req.ip, severity: 'warning',
    });

    res.json({ success: true, data: { id: req.params.id, deactivated: true } });
  })
);

// ── Device Policy ─────────────────────────────────────────────────────────────
router.put('/devices/:id/policy', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const schema = z.object({
      usb_policy: z.enum(['allow', 'block', 'ask']).optional(),
      allow_known_devices: z.boolean().optional(),
      status: z.enum(['active', 'suspended', 'decommissioned', 'pending']).optional(),
    });
    const data = schema.parse(req.body);

    if (data.usb_policy !== undefined || data.allow_known_devices !== undefined) {
      await query(
        `INSERT INTO usb_policies (device_id, policy, allow_known_devices, updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (device_id) DO UPDATE
           SET policy = COALESCE($2, usb_policies.policy),
               allow_known_devices = COALESCE($3, usb_policies.allow_known_devices),
               updated_by = $4,
               updated_at = NOW()`,
        [req.params.id, data.usb_policy ?? null, data.allow_known_devices ?? null, req.user!.sub]
      );
    }

    if (data.status !== undefined) {
      await query(
        `UPDATE devices SET status = $1, updated_at = NOW() WHERE id = $2`,
        [data.status, req.params.id]
      );
    }

    await writeAuditLog({
      user_id: req.user!.sub, device_id: req.params.id,
      action: 'DEVICE_POLICY_UPDATED',
      detail_json: data,
      ip_address: req.ip, severity: 'warning',
    });

    res.json({ success: true, data: { device_id: req.params.id, ...data } });
  })
);

// ── Files admin: list all + download ─────────────────────────────────────────
router.get('/files', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const { page, limit, offset } = parsePagination(req.query);
    const { device_id, status, search } = req.query as any;

    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (device_id) { conditions.push(`f.device_id = $${i++}`); params.push(device_id); }
    if (status)    { conditions.push(`f.status = $${i++}`);    params.push(status); }
    if (search)    { conditions.push(`f.file_name ILIKE $${i++}`); params.push(`%${search}%`); }

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

    res.json({ success: true, data: rows.rows, meta: { pagination: buildMeta(total, page, limit) } });
  })
);

router.get('/files/:id/download', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const fileRes = await query('SELECT * FROM files WHERE id = $1', [req.params.id]);
    if (fileRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File tidak ditemukan.' } });
      return;
    }

    const file = fileRes.rows[0];
    const buffer = await downloadBuffer(file.remote_path);

    await writeAuditLog({
      user_id: req.user!.sub, device_id: file.device_id,
      action: 'ADMIN_FILE_DOWNLOAD',
      detail_json: { file_id: file.id, file_name: file.file_name },
      ip_address: req.ip, severity: 'warning',
    });

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.file_name)}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.send(buffer);
  })
);

// ── Permissions list (all) ────────────────────────────────────────────────────
router.get('/permissions', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const { page, limit, offset } = parsePagination(req.query);
    const { status, action, device_id } = req.query as any;

    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (status)    { conditions.push(`p.status = $${i++}`);    params.push(status); }
    if (action)    { conditions.push(`p.action = $${i++}`);    params.push(action); }
    if (device_id) { conditions.push(`p.device_id = $${i++}`); params.push(device_id); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM permissions p ${where}`, params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const rows = await query(
      `SELECT p.*, u.name as user_name, u.email as user_email,
              d.machine_name, f.file_name, f.local_path
       FROM permissions p
       JOIN users u ON p.user_id = u.id
       JOIN devices d ON p.device_id = d.id
       LEFT JOIN files f ON p.file_id = f.id
       ${where}
       ORDER BY p.requested_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: rows.rows, meta: { pagination: buildMeta(total, page, limit) } });
  })
);

export default router;