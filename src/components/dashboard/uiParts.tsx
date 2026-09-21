import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { PAGE_SIZE, pageNumbers } from './constants';

function Pagination({ page, totalPages, total, onChange, size = PAGE_SIZE }: {
  page: number; totalPages: number; total: number; onChange: (page: number) => void; size?: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap rounded-3xl bg-white border border-slate-200 shadow-sm px-5 py-3">
      <span className="text-xs font-bold text-slate-500">
        {(page - 1) * size + 1}–{Math.min(page * size, total)} من {total}
      </span>
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1}
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-accent-500/40 hover:text-accent-500 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          aria-label="الصفحة السابقة">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        {pageNumbers(page, totalPages).map((p, i) => p === '…' ? (
          <span key={`gap-${i}`} className="h-9 min-w-6 flex items-center justify-center text-xs font-black text-slate-400">…</span>
        ) : (
          <button key={p} onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined}
            className={`h-9 min-w-9 px-2 rounded-xl text-xs font-black transition cursor-pointer ${
              p === page
                ? 'bg-accent-500 text-white shadow-sm shadow-accent-500/20'
                : 'border border-slate-200 text-slate-500 hover:border-accent-500/40 hover:text-accent-500'
            }`}>
            {p}
          </button>
        ))}
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages}
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-accent-500/40 hover:text-accent-500 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          aria-label="الصفحة التالية">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  options, value, onChange
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center p-1 bg-white border border-slate-200 rounded-2xl shadow-sm">
      {options.map(o => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black whitespace-nowrap transition-all cursor-pointer ${
              active
                ? 'bg-accent-500 text-white shadow-sm shadow-accent-500/20'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Dismissible notice dialog (duplicate name/slug/email, etc.) ───────────
function NoticeDialog({ notice, onDismiss }: {
  notice: { title: string; message: string } | null;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {notice && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onDismiss}>
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200/80"
          >
            <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500">
                  <AlertTriangle aria-hidden="true" className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-black text-sm">{notice.title}</h3>
              </div>
              <button onClick={onDismiss} aria-label="إغلاق" className="p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center">
                <X className="h-5 w-5 text-white/70" aria-hidden="true" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm font-semibold text-slate-600 leading-relaxed">{notice.message}</p>
              <div className="mt-6 flex justify-end">
                <button onClick={onDismiss}
                  className="px-6 py-2.5 bg-accent-500 text-white font-black text-sm rounded-xl hover:bg-accent-700 transition cursor-pointer shadow-sm shadow-accent-500/20">
                  Compris
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export { Pagination, Segmented, NoticeDialog };
