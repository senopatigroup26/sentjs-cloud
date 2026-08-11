export type UserRole = 'superadmin' | 'admin' | 'user';
export type TokenRole = UserRole | 'device';

export interface JwtPayload {
  sub: string;           // user_id
  device_id?: string;    // hanya untuk device token
  role: TokenRole;
  jti: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Express.Request {
  user?: JwtPayload;
}

// Database row types
export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  password_hash: string;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DeviceRow {
  id: string;
  user_id: string;
  machine_name: string;
  machine_id: string;
  os_version: string | null;
  client_version: string | null;
  status: 'pending' | 'active' | 'suspended' | 'decommissioned';
  last_seen_at: Date | null;
  last_ip: string | null;
  registered_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface FileRow {
  id: string;
  device_id: string;
  remote_path: string;
  local_path: string;
  file_name: string;
  file_extension: string | null;
  checksum_sha256: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  status: 'pending' | 'uploading' | 'uploaded' | 'synced' | 'cached' | 'dehydrated' | 'error';
  last_accessed_at: Date | null;
  last_modified_at: Date | null;
  dehydrated_at: Date | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PermissionRow {
  id: string;
  user_id: string;
  device_id: string;
  file_id: string | null;
  action: 'export' | 'copy' | 'usb' | 'print' | 'screenshot';
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'revoked';
  request_reason: string | null;
  granted_by: string | null;
  deny_reason: string | null;
  requested_at: Date;
  reviewed_at: Date | null;
  expires_at: Date | null;
  used_at: Date | null;
  used_count: number;
  max_uses: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  device_id: string | null;
  action: string;
  detail_json: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  severity: 'info' | 'warning' | 'critical';
  created_at: Date;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  device_id: string | null;
  token_hash: string;
  is_revoked: boolean;
  expires_at: Date;
  last_used_at: Date | null;
  ip_address: string | null;
  created_at: Date;
}
