import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { listFiles, listAllFiles, uploadComplete, markDehydrated, markDeleted } from '../services/files.service';

const router = Router();
const wrap = (fn: Function) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Admin: list all files without device_id requirement
router.get('/all', authMiddleware, requireRole('admin', 'superadmin'),
  wrap(async (req: Request, res: Response) => {
    const result = await listAllFiles(req.query);
    res.json({ success: true, data: result.rows, meta: { pagination: result.meta } });
  })
);

router.get('/', authMiddleware,
  wrap(async (req: Request, res: Response) => {
    const result = await listFiles(req.query);
    res.json({ success: true, data: result.rows, meta: { pagination: result.meta } });
  })
);

const uploadCompleteSchema = z.object({
  device_id: z.string().uuid().optional(), // optional - can be extracted from JWT
  file_name: z.string().min(1),
  file_path: z.string().min(1),
  remote_path: z.string().min(1),
  file_size: z.number().int().positive(),
  file_hash: z.string().min(1),
  mime_type: z.string().optional(),
  // legacy field aliases
  local_path: z.string().optional(),
  checksum_sha256: z.string().optional(),
  size_bytes: z.number().optional(),
  last_modified_at: z.string().optional(),
});

router.post('/upload-complete', authMiddleware,
  wrap(async (req: Request, res: Response) => {
    const data = uploadCompleteSchema.parse(req.body);
    
    // Get device_id from request body OR from JWT token
    const deviceId = data.device_id ?? req.user?.device_id;
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'device_id required (in body or JWT token)' });
    }
    
    // normalize field names
    const normalized = {
      device_id: deviceId,
      file_name: data.file_name,
      file_path: data.file_path ?? data.local_path ?? data.file_name,
      remote_path: data.remote_path,
      file_size: data.file_size ?? data.size_bytes ?? 0,
      file_hash: data.file_hash ?? data.checksum_sha256 ?? '',
      mime_type: data.mime_type,
      last_modified_at: data.last_modified_at,
    };
    const result = await uploadComplete(deviceId, normalized, req.ip);
    res.json({ success: true, data: result });
  })
);

router.delete('/:id/local', authMiddleware, requireRole('device'),
  wrap(async (req: Request, res: Response) => {
    const deviceId = req.user!.device_id!;
    const result = await markDehydrated(req.params.id, deviceId, req.ip);
    res.json({ success: true, data: result });
  })
);

// Soft delete: mark file as deleted when removed from local
router.post('/delete-local', authMiddleware,
  wrap(async (req: Request, res: Response) => {
    const { file_name, file_path } = z.object({
      file_name: z.string().optional(),
      file_path: z.string().optional(),
    }).parse(req.body);

    const deviceId = req.user!.device_id!;
    const result = await markDeleted(deviceId, file_name ?? file_path ?? '', req.ip);
    res.json({ success: true, data: result });
  })
);

export default router;

