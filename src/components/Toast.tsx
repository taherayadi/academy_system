import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string | number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
      warning: () => {}
    } as ToastContextValue;
  }
  return ctx;
}

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />,
  error: <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />,
  warning: <AlertTriangle className="h-5 w-5 text-[#3A93A0] shrink-0" />,
  info: <Info className="h-5 w-5 text-sky-400 shrink-0" />
};

const borderMap: Record<ToastType, string> = {
  success: 'border-emerald-500/40',
  error: 'border-red-500/40',
  warning: 'border-[#257C86]/40',
  info: 'border-sky-500/40'
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const recentToastsRef = React.useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string | number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
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
    setToasts(prev => [...prev.filter(t => t.message !== cleanMsg || t.type !== type), { id: id as any, message: cleanMsg, type }]);
    setTimeout(() => removeToast(id), 4000);
  }, [removeToast]);

  const value: ToastContextValue = useMemo(() => ({
    showToast,
    success: (m) => showToast(m, 'success'),
    error: (m) => showToast(m, 'error'),
    info: (m) => showToast(m, 'info'),
    warning: (m) => showToast(m, 'warning')
  }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 left-4 z-[100] flex flex-col gap-2 no-print" dir="rtl">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              className={`bg-slate-900 text-white border ${borderMap[t.type]} rounded-2xl shadow-2xl px-4 py-3 flex items-start gap-3 min-w-[260px] max-w-[360px]`}
            >
              {iconMap[t.type]}
              <p className="text-xs font-bold leading-snug flex-1">{t.message}</p>
              <button
                onClick={() => removeToast(t.id)}
                className="text-slate-500 hover:text-white transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
