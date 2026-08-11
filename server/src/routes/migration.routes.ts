import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { query } from '../config/database';
import { writeAuditLog } from '../services/audit.service';

const router = Router();
const wrap = (fn: Function) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const folderSchema = z.object({
  local_path: z.string().min(1),
  include_extensions: z.array(z.string()).default(['*']),
  exclude_patterns: z.array(z.string()).default([]),
});

router.post('/config', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const schema = z.object({
      device_id: z.string().uuid(),
      folders: z.array(folderSchema).min(1),
      schedule: z.object({ type: z.enum(['immediate', 'scheduled']), run_at: z.string().optional() }).optional(),
      notes: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const result = await query(
      `INSERT INTO migration_configs (device_id, created_by, folders, schedule, status, notes)
       VALUES ($1, $2, $3, $4, 'active', $5) RETURNING id, device_id, status, created_at`,
      [data.device_id, req.user!.sub, JSON.stringify(data.folders), data.schedule ? JSON.stringify(data.schedule) : null, data.notes ?? null]
    );

    await writeAuditLog({
      user_id: req.user!.sub, device_id: data.device_id,
      action: 'MIGRATION_CONFIG_CREATED',
      detail_json: { config_id: result.rows[0].id, folder_count: data.folders.length },
      ip_address: req.ip,
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  })
);

router.get('/:device_id/status', authMiddleware,
  wrap(async (req: Request, res: Response) => {
    const { device_id } = req.params;

    const configRes = await query(
      `SELECT mc.id, mc.status, mj.id as job_id, mj.current_phase, mj.total_files,
              mj.uploaded_count, mj.verified_count, mj.dehydrated_count, mj.failed_count,
              mj.started_at, mj.last_progress_at,
              CASE WHEN mj.total_files > 0
                   THEN ROUND((mj.uploaded_count::float / mj.total_files) * 100)
                   ELSE 0 END as progress_percent
       FROM migration_configs mc
       LEFT JOIN migration_jobs mj ON mj.config_id = mc.id
         AND mj.current_phase NOT IN ('completed','failed')
       WHERE mc.device_id = $1 AND mc.status = 'active'
       ORDER BY mc.created_at DESC LIMIT 1`,
      [device_id]
    );

    res.json({
      success: true,
      data: {
        device_id,
        has_active_config: configRes.rows.length > 0,
        ...(configRes.rows[0] ?? {}),
      },
    });
  })
);

router.post('/:device_id/start', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const { device_id } = req.params;
    const { config_id } = z.object({ config_id: z.string().uuid() }).parse(req.body);

    const jobRes = await query(
      `INSERT INTO migration_jobs (config_id, device_id, current_phase, started_at)
       VALUES ($1, $2, 'scanning', NOW())
       RETURNING id`,
      [config_id, device_id]
    );

    await writeAuditLog({
      user_id: req.user!.sub, device_id,
      action: 'MIGRATION_STARTED',
      detail_json: { config_id, job_id: jobRes.rows[0].id },
      ip_address: req.ip,
    });

    res.json({ success: true, data: { job_id: jobRes.rows[0].id, status: 'started' } });
  })
);

router.get('/job/:job_id/progress', authMiddleware,
  wrap(async (req: Request, res: Response) => {
    const { job_id } = req.params;
    const result = await query(
      `SELECT mj.*, mc.folders FROM migration_jobs mj
       JOIN migration_configs mc ON mj.config_id = mc.id
       WHERE mj.id = $1`,
      [job_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job tidak ditemukan.' } });
      return;
    }

    const job = result.rows[0];
    const progress = job.total_files > 0
      ? Math.round((job.uploaded_count / job.total_files) * 100)
      : 0;

    res.json({ success: true, data: { ...job, progress_percent: progress } });
  })
);

export default router;
