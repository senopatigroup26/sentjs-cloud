import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../config/database';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import {
  listDevices, getDevice, updateDevicePolicy, deviceHeartbeat
} from '../services/devices.service';

const router = Router();
const wrap = (fn: Function) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const result = await listDevices(req.query);
    res.json({ success: true, data: result.rows, meta: { pagination: result.meta } });
  })
);

router.get('/:id', authMiddleware,
  wrap(async (req: Request, res: Response) => {
    const device = await getDevice(req.params.id, req.user!.sub, req.user!.role);
    res.json({ success: true, data: device });
  })
);

router.put('/:id/policy', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const schema = z.object({
      status: z.enum(['active', 'suspended', 'decommissioned', 'pending']),
      reason: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const result = await updateDevicePolicy(req.params.id, data, req.user!.sub, req.ip);
    res.json({ success: true, data: result });
  })
);

router.post('/heartbeat', authMiddleware,
  wrap(async (req: Request, res: Response) => {
    // Extract device_id from token (from device registration)
    const userId = req.user!.sub;
    const { status } = req.body;
    
    // Get device for this user (assume 1 device per user for now, or get from request)
    const deviceResult = await query(
      'SELECT id FROM devices WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    
    const deviceId = deviceResult.rows[0].id;
    const result = await deviceHeartbeat(deviceId, userId, req.ip);
    res.json({ success: true, data: result });
  })
);

router.get('/:id/status', authMiddleware, requireRole('device'),
  wrap(async (req: Request, res: Response) => {
    const result = await deviceHeartbeat(req.params.id, req.user!.sub, req.ip);
    res.json({ success: true, data: result });
  })
);

export default router;
