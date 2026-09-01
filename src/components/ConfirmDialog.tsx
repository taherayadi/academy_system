import React from 'react';
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
  confirmLabel = 'تأكيد الحذف',
  cancelLabel = 'إلغاء',
  danger = true,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 no-print">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden my-8 border border-slate-200/80"
          >
            {/* Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${danger ? 'bg-red-500' : 'bg-[#257C86]'}`}>
                  <AlertTriangle className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-base font-black">{title}</h3>
              </div>

              <button
                onClick={onCancel}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
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
                      : 'bg-[#257C86] hover:bg-[#1E6A73] shadow-[#257C86]/20'
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
