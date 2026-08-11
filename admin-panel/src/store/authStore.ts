import { create } from 'zustand';
import { authApi } from '../lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(email, password);
      const { access_token, refresh_token, user } = response.data.data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      set({ user, isAuthenticated: true, isLoading: false, error: null });
    } catch (err: any) {
      const msg = err.response?.data?.error?.message ?? err.response?.data?.error ?? 'Login gagal';
      set({ isLoading: false, error: msg, isAuthenticated: false });
      throw err;
    }
  },

  logout: () => {
    authApi.logout();
    set({ user: null, isAuthenticated: false, error: null });
  },

  clearError: () => set({ error: null }),
}));
