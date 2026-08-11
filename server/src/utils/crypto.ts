import * as crypto from 'crypto';

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function generateUuid(): string {
  return crypto.randomUUID();
}
