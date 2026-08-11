import { Router, Request, Response } from 'express';
import { config } from '../config/app';
import { Client } from 'ssh2';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// System status (requires auth)
router.get('/status', authMiddleware, async (_req: Request, res: Response) => {
  const hetznerStatus = await checkHetznerConnection();
  
  res.json({
    success: true,
    data: {
      api: {
        status: 'online',
        version: '1.0.0',
        environment: config.env
      },
      database: {
        status: 'online',
        type: 'PostgreSQL'
      },
      storage: {
        provider: 'Hetzner Storage Box',
        status: hetznerStatus.connected ? 'online' : 'offline',
        host: config.sftp.host,
        base_path: config.sftp.basePath,
        error: hetznerStatus.error
      }
    }
  });
});

async function checkHetznerConnection(): Promise<{ connected: boolean; error?: string }> {
  return new Promise((resolve) => {
    const conn = new Client();
    
    const timeout = setTimeout(() => {
      conn.end();
      resolve({ connected: false, error: 'Connection timeout' });
    }, 5000);
    
    conn.on('ready', () => {
      clearTimeout(timeout);
      conn.end();
      resolve({ connected: true });
    });
    
    conn.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ connected: false, error: err.message });
    });
    
    try {
      conn.connect({
        host: config.sftp.host,
        port: config.sftp.port,
        username: config.sftp.user,
        password: config.sftp.password,
        readyTimeout: 5000
      });
    } catch (err: any) {
      clearTimeout(timeout);
      resolve({ connected: false, error: err.message });
    }
  });
}

export default router;