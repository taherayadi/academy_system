import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: string | number;
  message: string;
  type: ToastType;
  action?: ToastAction;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, opts?: { action?: ToastAction; duration?: number }) => void;
  success: (message: string, opts?: { action?: ToastAction; duration?: number }) => void;
  error: (message: string, opts?: { action?: ToastAction; duration?: number }) => void;
  info: (message: string, opts?: { action?: ToastAction; duration?: number }) => void;
  warning: (message: string, opts?: { action?: ToastAction; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Stable singleton: a fresh object per call would give the fallback a new
// identity every render, spinning any useCallback/useEffect keyed on toast
// (e.g. data-loading effects) into a fetch loop.
const NOOP_TOAST: ToastContextValue = {
  showToast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
  warning: () => {}
};

export function useToast() {
  return useContext(ToastContext) ?? NOOP_TOAST;
}

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-accent-400 shrink-0" />,
  error: <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />,
  warning: <AlertTriangle className="h-5 w-5 text-accent-400 shrink-0" />,
  info: <Info className="h-5 w-5 text-accent-400 shrink-0" />
};

const borderMap: Record<ToastType, string> = {
  success: 'border-accent-500/40',
  error: 'border-red-500/40',
  warning: 'border-accent-500/40',
  info: 'border-accent-500/40'
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const recentToastsRef = React.useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string | number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', opts?: { action?: ToastAction; duration?: number }) => {
    if (!message || typeof message !== 'string') return;
    const cleanMsg = message.trim();
    const key = `${type}:${cleanMsg}`;
    const now = Date.now();
    const lastTime = recentToastsRef.current.get(key) || 0;

    if (now - lastTime < 3000) {
      return;
    }
    recentToastsRef.current.set(key, now);

    if (recentToastsRef.current.size > 50) {
      for (const [k, time] of recentToastsRef.current.entries()) {
        if (now - time > 5000) recentToastsRef.current.delete(k);
      }
    }

    const id = `${now}_${Math.random().toString(36).slice(2, 9)}`;
    setToasts(prev => [...prev.filter(t => t.message !== cleanMsg || t.type !== type), { id: id as any, message: cleanMsg, type, action: opts?.action, duration: opts?.duration }]);
    setTimeout(() => removeToast(id), opts?.duration ?? 4000);
  }, [removeToast]);

  const value: ToastContextValue = useMemo(() => ({
    showToast,
    success: (m, o) => showToast(m, 'success', o),
    error: (m, o) => showToast(m, 'error', o),
    info: (m, o) => showToast(m, 'info', o),
    warning: (m, o) => showToast(m, 'warning', o)
  }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toasts are transient status messages: the container is a polite
          live region (present from mount so it is always announced), and
          errors escalate to role="alert" (WCAG 4.1.3 Status Messages). */}
      <div className="fixed top-4 left-4 z-[100] flex flex-col gap-2 no-print" dir="rtl" aria-live="polite" aria-atomic="false">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              role={t.type === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              className={`bg-slate-900 text-white border ${borderMap[t.type]} rounded-2xl shadow-2xl px-4 py-3 flex items-start gap-3 min-w-[260px] max-w-[360px]`}
            >
              {iconMap[t.type]}
              <p className="text-xs font-bold leading-snug flex-1">{t.message}</p>
              {t.action && (
                <button
                  onClick={() => { t.action?.onClick(); removeToast(t.id); }}
                  className="text-[11px] font-black text-accent-400 hover:text-accent-300 transition cursor-pointer whitespace-nowrap"
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => removeToast(t.id)}
                aria-label="إغلاق"
                className="text-slate-500 hover:text-white transition cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
