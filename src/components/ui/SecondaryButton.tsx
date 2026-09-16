import React, { ReactNode } from 'react';

interface SecondaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  className?: string;
  /** Optional leading icon node (e.g. a lucide icon). */
  icon?: ReactNode;
  title?: string;
}

const base =
  'inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-slate-600 ' +
  'bg-neutral-100 rounded-xl transition hover:bg-neutral-200 cursor-pointer ' +
  'focus-visible:outline-2 focus-visible:outline-brand-500 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

/** Secondary / cancel button — neutral-100 fill, used for dismissive actions in forms/modals. */
export function SecondaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
  className = '',
  icon,
  title,
}: SecondaryButtonProps) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${className}`}>
      {icon}
      {children}
    </button>
  );
}