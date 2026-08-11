import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { query } from '../config/database';
import { config } from '../config/app';
import { AppError } from '../middleware/error.middleware';
import { generateToken, hashToken } from '../utils/crypto';
import { UserRow, DeviceRow, JwtPayload } from '../types';
import { writeAuditLog } from './audit.service';

const BCRYPT_ROUNDS = 12;

export async function login(email: string, password: string, ip?: string) {
  const result = await query<UserRow>(
    'SELECT * FROM users WHERE email = $1 AND is_active = true',
    [email]
  );
  const user = result.rows[0];

  if (!user) {
    await writeAuditLog({ action: 'USER_LOGIN_FAILED', detail_json: { email }, ip_address: ip, severity: 'warning' });
    throw new AppError('INVALID_CREDENTIALS', 'Email atau password salah.', 401);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await writeAuditLog({ user_id: user.id, action: 'USER_LOGIN_FAILED', detail_json: { reason: 'wrong_password' }, ip_address: ip, severity: 'warning' });
    throw new AppError('INVALID_CREDENTIALS', 'Email atau password salah.', 401);
  }

  await query(
    `UPDATE refresh_tokens SET is_revoked = true WHERE user_id = $1 AND device_id IS NULL AND is_revoked = false`,
    [user.id]
  );

  const { accessToken, refreshToken } = await createTokenPair(user.id, null, user.role);
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  await writeAuditLog({ user_id: user.id, action: 'USER_LOGIN', ip_address: ip });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: config.jwt.accessExpiresIn,
    token_type: 'Bearer',
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

export async function registerDevice(
  userId: string,
  data: {
    machine_name: string;
    machine_id: string;
    os_version?: string;
    client_version?: string;
    hardware_snapshot?: any;
  },
  ip?: string
) {
  let hardwareFingerprint: string | null = null;
  if (data.hardware_snapshot) {
    hardwareFingerprint = generateHardwareFingerprint(data.hardware_snapshot);

    // If same hardware already registered - return existing device token (no error!)
    const existing = await query<DeviceRow>(
      'SELECT * FROM devices WHERE hardware_fingerprint = $1',
      [hardwareFingerprint]
    );
    if (existing.rows.length > 0) {
      const device = existing.rows[0];
      const { accessToken } = await createTokenPair(device.user_id, device.id, 'device');
      return {
        device_id: device.id,
        device_token: accessToken,
        hardware_fingerprint: hardwareFingerprint,
        status: device.status,
        message: 'Perangkat sudah terdaftar.',
      };
    }
  }

  // Fallback: check by machine_id
  const existingById = await query<DeviceRow>(
    'SELECT * FROM devices WHERE machine_id = $1',
    [data.machine_id]
  );
  if (existingById.rows.length > 0) {
    const device = existingById.rows[0];
    const { accessToken } = await createTokenPair(device.user_id, device.id, 'device');
    return {
      device_id: device.id,
      device_token: accessToken,
      hardware_fingerprint: hardwareFingerprint,
      status: device.status,
      message: 'Perangkat sudah terdaftar.',
    };
  }

  // New device - insert
  const result = await query<DeviceRow>(
    `INSERT INTO devices (user_id, machine_name, machine_id, os_version, client_version, hardware_fingerprint, hardware_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      userId,
      data.machine_name,
      data.machine_id,
      data.os_version ?? null,
      data.client_version ?? null,
      hardwareFingerprint,
      data.hardware_snapshot ? JSON.stringify(data.hardware_snapshot) : null,
    ]
  );
  const device = result.rows[0];
  const { accessToken } = await createTokenPair(userId, device.id, 'device');

  await writeAuditLog({
    user_id: userId,
    device_id: device.id,
    action: 'DEVICE_REGISTERED',
    detail_json: { machine_name: data.machine_name, hardware_fingerprint: hardwareFingerprint },
    ip_address: ip,
  });

  return {
    device_id: device.id,
    device_token: accessToken,
    hardware_fingerprint: hardwareFingerprint,
    status: device.status,
    message: 'Perangkat berhasil didaftarkan.',
  };
}

function generateHardwareFingerprint(snapshot: any): string {
  const components = [
    snapshot.cpu_id || '',
    snapshot.motherboard_serial || '',
    snapshot.bios_serial || '',
    snapshot.disk_serial || '',
    (snapshot.mac_addresses || []).join(','),
  ].filter((c) => c.trim().length > 0);
  return crypto.createHash('sha256').update(components.join('|')).digest('hex');
}

export async function refreshAccessToken(token: string, ip?: string) {
  const tokenHash = hashToken(token);
  const result = await query(
    `SELECT rt.*, u.role FROM refresh_tokens rt
     JOIN users u ON rt.user_id = u.id
     WHERE rt.token_hash = $1 AND rt.is_revoked = false AND rt.expires_at > NOW()`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    throw new AppError('INVALID_REFRESH_TOKEN', 'Refresh token tidak valid atau sudah expired.', 401);
  }

  const rt = result.rows[0];
  const role = rt.device_id ? 'device' : rt.role;
  const accessToken = signAccessToken(rt.user_id, rt.device_id, role, rt.device_id ? config.jwt.deviceExpiresIn : config.jwt.accessExpiresIn);
  await query('UPDATE refresh_tokens SET last_used_at = NOW() WHERE id = $1', [rt.id]);

  return { access_token: accessToken, expires_in: config.jwt.accessExpiresIn };
}

async function createTokenPair(userId: string, deviceId: string | null, role: string) {
  const expiresIn = deviceId ? config.jwt.deviceExpiresIn : config.jwt.accessExpiresIn;
  const refreshExpiresIn = deviceId ? config.jwt.refreshDeviceExpiresIn : config.jwt.refreshUserExpiresIn;

  const accessToken = signAccessToken(userId, deviceId, role, expiresIn);
  const refreshToken = generateToken(48);
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + refreshExpiresIn * 1000);

  await query(
    `INSERT INTO refresh_tokens (user_id, device_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [userId, deviceId, tokenHash, expiresAt]
  );

  return { accessToken, refreshToken };
}

function signAccessToken(userId: string, deviceId: string | null, role: string, expiresIn: number) {
  const payload: any = { sub: userId, role, jti: generateToken(16) };
  if (deviceId) payload.device_id = deviceId;
  return jwt.sign(payload, config.jwt.secret, { expiresIn });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
