import { useEffect } from 'react';
import { create } from 'zustand';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import './Toast.css';

type ToastType = 'success' | 'error' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  add: (type: ToastType, message: string) => void;
  remove: (id: string) => void;
}

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  add: (type, message) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Convenience helpers
export const toast = {
  success: (msg: string) => useToast.getState().add('success', msg),
  error:   (msg: string) => useToast.getState().add('error', msg),
  warning: (msg: string) => useToast.getState().add('warning', msg),
};

export function ToastContainer() {
  const { toasts, remove } = useToast();

  return (
    <div className="toast-container" role="alert" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle size={18} />,
    error:   <XCircle size={18} />,
    warning: <AlertCircle size={18} />,
  };

  return (
    <div className={`toast toast-${t.type}`}>
      <span className="toast-icon">{icons[t.type]}</span>
      <span className="toast-message">{t.message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Close">
        <X size={14} />
      </button>
    </div>
  );
}
