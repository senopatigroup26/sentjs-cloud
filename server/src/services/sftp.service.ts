import * as ssh2 from 'ssh2';
import * as crypto from 'crypto';
import { config } from '../config/app';
import { logger } from '../utils/logger';

function createClient(): Promise<ssh2.SFTPWrapper> {
  return new Promise((resolve, reject) => {
    const conn = new ssh2.Client();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }
        (sftp as any)._conn = conn;
        resolve(sftp);
      });
    });
    conn.on('error', reject);
    conn.connect({
      host: config.sftp.host,
      port: config.sftp.port,
      username: config.sftp.user,
      password: config.sftp.password,
      readyTimeout: 15000,
    });
  });
}

function closeClient(sftp: ssh2.SFTPWrapper): void {
  try { (sftp as any)._conn?.end(); } catch { /* ignore */ }
}

export async function ensureDirectory(remotePath: string, deviceId?: string): Promise<void> {
  const sftp = await createClient();
  try {
    // Build path with device-specific folder if deviceId provided
    const basePath = config.sftp.basePath;
    const fullPath = deviceId ? `${basePath}/devices/${deviceId}/${remotePath}` : `${basePath}/${remotePath}`;
    
    const parts = fullPath.replace(/\\/g, '/').split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      await new Promise<void>((resolve) => {
        sftp.mkdir(current, (err) => {
          // Ignore EEXIST
          if (err && (err as any).code !== 4) logger.debug(`mkdir ${current}: ${err.message}`);
          resolve();
        });
      });
    }
  } finally {
    closeClient(sftp);
  }
}

export async function uploadBuffer(remotePath: string, data: Buffer, deviceId?: string): Promise<void> {
  const sftp = await createClient();
  try {
    const basePath = config.sftp.basePath;
    const fullPath = deviceId ? `${basePath}/devices/${deviceId}/${remotePath}` : `${basePath}/${remotePath}`;
    
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    await ensureDirectory(dir, deviceId);
    await new Promise<void>((resolve, reject) => {
      const stream = sftp.createWriteStream(fullPath);
      stream.on('close', resolve);
      stream.on('error', reject);
      stream.end(data);
    });
  } finally {
    closeClient(sftp);
  }
}

export async function downloadBuffer(remotePath: string): Promise<Buffer> {
  const sftp = await createClient();
  try {
    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = sftp.createReadStream(remotePath);
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  } finally {
    closeClient(sftp);
  }
}

export async function getRemoteChecksum(remotePath: string): Promise<string> {
  const data = await downloadBuffer(remotePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

export async function deleteRemote(remotePath: string): Promise<void> {
  const sftp = await createClient();
  try {
    await new Promise<void>((resolve, reject) => {
      sftp.unlink(remotePath, (err) => err ? reject(err) : resolve());
    });
  } finally {
    closeClient(sftp);
  }
}

export async function listRemoteDirectory(remotePath: string): Promise<ssh2.FileEntry[]> {
  const sftp = await createClient();
  try {
    return await new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err, list) => err ? reject(err) : resolve(list));
    });
  } finally {
    closeClient(sftp);
  }
}

export function buildRemotePath(orgId: string, deviceId: string, localRelativePath: string): string {
  const normalized = localRelativePath.replace(/\\/g, '/');
  return `${config.sftp.basePath}/${orgId}/${deviceId}/${normalized}`;
}
