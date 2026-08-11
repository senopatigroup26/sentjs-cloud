import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as bcrypt from 'bcrypt';
import { login, registerDevice, refreshAccessToken } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { query } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { writeAuditLog } from '../services/audit.service';

const router = Router();
const wrap = (fn: Function) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const deviceRegisterSchema = z.object({
  machine_name: z.string().min(1),
  machine_id: z.string().min(1),
  os_version: z.string().optional(),
  client_version: z.string().optional(),
  ip_address: z.string().optional(),
  hardware_snapshot: z.object({
    cpu_id: z.string().optional(),
    cpu_name: z.string().optional(),
    motherboard_serial: z.string().optional(),
    motherboard_manufacturer: z.string().optional(),
    motherboard_product: z.string().optional(),
    bios_serial: z.string().optional(),
    bios_version: z.string().optional(),
    disk_serial: z.string().optional(),
    mac_addresses: z.array(z.string()).optional(),
    total_ram_mb: z.number().optional(),
    os_install_date: z.string().optional(),
  }).optional(),
});

router.post('/register', wrap(async (req: Request, res: Response) => {
  const data = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1),
  }).parse(req.body);
  
  const ip = req.ip;
  
  // Check if user already exists
  const existing = await query('SELECT id FROM users WHERE email = $1', [data.email]);
  if (existing.rows.length > 0) {
    throw new AppError('USER_EXISTS', 'Email sudah terdaftar.', 409);
  }
  
  // Create user
  const hash = await bcrypt.hash(data.password, 12);
  const result = await query(
    `INSERT INTO users (email, name, role, password_hash)
     VALUES ($1, $2, 'user', $3) RETURNING id, email, name, role`,
    [data.email, data.name, hash]
  );
  
  const user = result.rows[0];
  await writeAuditLog({ user_id: user.id, action: 'USER_REGISTERED', ip_address: ip });
  
  res.status(201).json({ 
    success: true, 
    data: { 
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    }
  });
}));

router.post('/login', wrap(async (req: Request, res: Response) => {
  const data = loginSchema.parse(req.body);
  const ip = req.ip;
  const result = await login(data.email, data.password, ip);
  res.json({ success: true, data: result });
}));

router.post('/device-register', authMiddleware, wrap(async (req: Request, res: Response) => {
  const data = deviceRegisterSchema.parse(req.body);
  const userId = req.user!.sub;
  const result = await registerDevice(userId, data, req.ip);
  res.status(201).json({ success: true, data: result });
}));

// Public device registration endpoint (no auth required)
router.post('/device-auto-register', wrap(async (req: Request, res: Response) => {
  const data = deviceRegisterSchema.parse(req.body);
  
  // Get system user ID
  const systemUser = await query('SELECT id FROM users WHERE email = $1', ['system@sentja.internal']);
  if (systemUser.rows.length === 0) {
    throw new AppError('SYSTEM_USER_NOT_FOUND', 'System user tidak ditemukan. Jalankan setup database.', 500);
  }
  
  const userId = systemUser.rows[0].id;
  const result = await registerDevice(userId, data, req.ip);
  res.status(201).json({ success: true, data: result });
}));

router.post('/refresh', wrap(async (req: Request, res: Response) => {
  const { refresh_token } = z.object({ refresh_token: z.string() }).parse(req.body);
  const result = await refreshAccessToken(refresh_token, req.ip);
  res.json({ success: true, data: result });
}));

export default router;
