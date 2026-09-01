import React, { useRef } from 'react';
import { Calendar } from 'lucide-react';

interface DateFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  className?: string;
}

export default function DateField({ value, onChange, className = '', ...rest }: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = (e: React.MouseEvent) => {
    // Prevent the native input's own picker toggle, then force it open so the
    // calendar shows when clicking anywhere on the field, not just the icon.
    e.preventDefault();
    const el = inputRef.current;
    if (!el) return;
    const withPicker = el as HTMLInputElement & { showPicker?: () => void };
    try {
      if (typeof withPicker.showPicker === 'function') {
        withPicker.showPicker();
        return;
      }
    } catch {
      /* native picker unavailable — fall back to focusing */
    }
    el.focus();
    try { el.click(); } catch { /* ignore */ }
  };

  const raw = value && typeof value === 'string' ? value : '';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const empty = !m;
  const display = m ? `${m[3]}/${m[2]}/${m[1]}` : 'jj/mm/aaaa';

  return (
    <div className="relative cursor-pointer" onClick={openPicker}>
      <div
        className={`flex items-center gap-2 pointer-events-none ${className}`}
        style={{ color: empty ? '#94a3b8' : undefined }}
      >
        <Calendar className="h-4 w-4 shrink-0 text-slate-500" />
        <span className="flex-1 text-right">{display}</span>
      </div>
      <input
        ref={inputRef}
        type="date"
        value={raw}
        onChange={onChange}
        {...rest}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </div>
  );
}
