import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { getAuditLogs, writeAuditLog } from '../services/audit.service';
import { parsePagination, buildMeta } from '../utils/pagination';

const router = Router();
const wrap = (fn: Function) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const { page, limit, offset } = parsePagination(req.query);
    const result = await getAuditLogs({ ...req.query as any, limit, offset });
    res.json({ success: true, data: result.rows, meta: { pagination: buildMeta(result.total, page, limit) } });
  })
);

router.post('/log', authMiddleware, requireRole('device'),
  wrap(async (req: Request, res: Response) => {
    const schema = z.object({
      action: z.string().min(1),
      severity: z.enum(['info', 'warning', 'critical']).optional(),
      detail_json: z.record(z.any()).optional(),
      ip_address: z.string().optional(),
      occurred_at: z.string().optional(),
    });
    const data = schema.parse(req.body);
    await writeAuditLog({
      device_id: req.user!.device_id,
      user_id: req.user!.sub,
      action: data.action,
      detail_json: data.detail_json,
      ip_address: data.ip_address ?? req.ip,
      severity: data.severity ?? 'info',
    });
    res.status(201).json({ success: true, data: { logged: true } });
  })
);

export default router;
