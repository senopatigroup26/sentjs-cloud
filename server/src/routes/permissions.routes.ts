import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import {
  requestPermission, getPendingPermissions,
  approvePermission, denyPermission, checkPermission,
} from '../services/permissions.service';

const router = Router();
const wrap = (fn: Function) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.post('/request', authMiddleware, requireRole('device'),
  wrap(async (req: Request, res: Response) => {
    const schema = z.object({
      device_id: z.string().uuid(),
      action: z.enum(['export', 'copy', 'usb', 'print', 'screenshot']),
      file_id: z.string().uuid().optional(),
      request_reason: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const userId = req.user!.sub;
    const result = await requestPermission(data.device_id, userId, data, req.ip);
    res.status(201).json({ success: true, data: result });
  })
);

router.get('/pending', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const result = await getPendingPermissions(req.query);
    res.json({ success: true, data: result.rows, meta: { pagination: result.meta } });
  })
);

router.get('/check', authMiddleware, requireRole('device'),
  wrap(async (req: Request, res: Response) => {
    const { device_id, action, file_id } = req.query as any;
    if (!device_id || !action) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'device_id dan action wajib diisi.' } });
      return;
    }
    const result = await checkPermission(device_id, action, file_id);
    res.json({ success: true, data: result });
  })
);

router.put('/:id/approve', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const schema = z.object({
      expires_at: z.string().optional(),
      max_uses: z.number().int().positive().optional(),
      notes: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const result = await approvePermission(req.params.id, req.user!.sub, data, req.ip);
    res.json({ success: true, data: result });
  })
);

router.put('/:id/deny', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const schema = z.object({ deny_reason: z.string().optional() });
    const data = schema.parse(req.body);
    const result = await denyPermission(req.params.id, req.user!.sub, data, req.ip);
    res.json({ success: true, data: result });
  })
);

export default router;
