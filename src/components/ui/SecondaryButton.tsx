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
  /** 'neutral' (default) solid fill, or 'dashed' accent outline for create/add affordances. */
  variant?: 'neutral' | 'dashed';
}

const base =
  'inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition cursor-pointer ' +
  'focus-visible:outline-2 focus-visible:outline-accent-500 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const variants = {
  neutral: 'text-slate-600 bg-neutral-100 hover:bg-neutral-200',
  dashed: 'text-accent-600 bg-transparent border border-dashed border-accent-500/50 hover:bg-accent-500/5',
} as const;

/** Secondary / cancel button — neutral-100 fill, used for dismissive actions in forms/modals. */
export function SecondaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
  className = '',
  icon,
  title,
  variant = 'neutral',
}: SecondaryButtonProps) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${variants[variant]} ${className}`}>
      {icon}
      {children}
    </button>
  );
}