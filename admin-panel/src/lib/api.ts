import axios, { AxiosError } from 'axios';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

const api = axios.create({ baseURL: BASE });

// ── Request interceptor: attach token ────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor: auto refresh ───────────────────────────────────────
api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const orig = error.config as any;
    if (error.response?.status === 401 && !orig._retry) {
      orig._retry = true;
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          const res = await axios.post(`${BASE}/auth/refresh`, { refresh_token: refresh });
          const { access_token, refresh_token } = res.data.data;
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', refresh_token);
          orig.headers.Authorization = `Bearer ${access_token}`;
          return api(orig);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboardApi = {
  stats: () => api.get('/admin/dashboard'),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/admin/users', { params }),
  create: (data: { email: string; name: string; role: string; password: string }) =>
    api.post('/admin/users', data),
  update: (id: string, data: Partial<{ name: string; role: string; is_active: boolean; password: string }>) =>
    api.put(`/admin/users/${id}`, data),
  deactivate: (id: string) =>
    api.delete(`/admin/users/${id}`),
};

// ── Devices ───────────────────────────────────────────────────────────────────
export const devicesApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/devices', { params }),
  get: (id: string) =>
    api.get(`/devices/${id}`),
  updatePolicy: (id: string, data: { usb_policy?: string; allow_known_devices?: boolean; status?: string }) =>
    api.put(`/admin/devices/${id}/policy`, data),
};

// ── Files ─────────────────────────────────────────────────────────────────────
export const filesApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/admin/files', { params }),
  downloadUrl: (id: string) =>
    `${BASE}/admin/files/${id}/download?token=${localStorage.getItem('access_token')}`,
  dehydrate: (fileId: string, deviceId: string) =>
    api.delete(`/files/${fileId}/local`, { data: { device_id: deviceId } }),
};

// ── Permissions ───────────────────────────────────────────────────────────────
export const permissionsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/admin/permissions', { params }),
  approve: (id: string, data?: { expires_at?: string; max_uses?: number; notes?: string }) =>
    api.put(`/permissions/${id}/approve`, data ?? {}),
  deny: (id: string, reason: string) =>
    api.put(`/permissions/${id}/deny`, { deny_reason: reason }),
};

// ── Audit ─────────────────────────────────────────────────────────────────────
export const auditApi = {
  list: (params?: Record<string, unknown>) =>
    api.get('/audit', { params }),
};

// ── Migration ─────────────────────────────────────────────────────────────────
export const migrationApi = {
  status: (deviceId: string) =>
    api.get(`/migration/${deviceId}/status`),
  config: (data: { device_id: string; folders: { local_path: string }[]; notes?: string }) =>
    api.post('/migration/config', data),
  start: (deviceId: string, configId: string) =>
    api.post(`/migration/${deviceId}/start`, { config_id: configId }),
  progress: (jobId: string) =>
    api.get(`/migration/job/${jobId}/progress`),
};

export default api;
