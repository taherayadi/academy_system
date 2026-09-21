import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Dialog a11y floor: initial focus + restore, Escape closes, Tab trapped.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); return; }
      if (e.key !== 'Tab') return;
      const card = cardRef.current;
      if (!card) return;
      const els = Array.from(card.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      const active = document.activeElement as HTMLElement | null;
      if (els.length === 0) { e.preventDefault(); card.focus(); return; }
      const first = els[0];
      const last = els[els.length - 1];
      if (!active || !card.contains(active)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && (active === first || active === card)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 no-print"
          role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
          <motion.div
            ref={cardRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden my-8 border border-slate-200/80 outline-none"
          >
            {/* Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${danger ? 'bg-red-500' : 'bg-accent-500'}`}>
                  <AlertTriangle className="h-5 w-5 text-white" />
                </div>
                <h3 id="confirm-dialog-title" className="text-base font-black">{title}</h3>
              </div>

              <button
                onClick={onCancel}
                aria-label="إغلاق"
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="text-sm text-slate-600 font-semibold leading-relaxed">{message}</div>

              {/* Footer actions */}
              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  onClick={onCancel}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={onConfirm}
                  className={`px-5 py-2.5 text-white font-black text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5 ${
                    danger
                      ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                      : 'bg-accent-500 hover:bg-accent-600 shadow-accent-500/20'
                  }`}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
