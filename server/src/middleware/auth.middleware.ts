import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { config } from '../config/app';
import { AppError } from './error.middleware';
import { JwtPayload, UserRole } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'Token autentikasi diperlukan.', 401);
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    throw new AppError('INVALID_TOKEN', 'Token tidak valid atau sudah expired.', 401);
  }
}

export function requireRole(...roles: (UserRole | 'device')[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new AppError('UNAUTHORIZED', 'Token diperlukan.', 401);
    if (!roles.includes(req.user.role)) {
      throw new AppError('FORBIDDEN', 'Anda tidak memiliki akses untuk aksi ini.', 403);
    }
    next();
  };
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  authMiddleware(req, res, () => requireRole('admin', 'superadmin')(req, res, next));
}
