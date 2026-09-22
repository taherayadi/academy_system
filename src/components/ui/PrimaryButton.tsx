import React, { ReactNode } from 'react';

interface PrimaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  /** Optional leading icon node (e.g. a lucide icon). */
  icon?: ReactNode;
  title?: string;
}

const base =
  'inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-black text-white ' +
  'bg-accent-500 rounded-xl shadow-sm shadow-accent-500/25 transition ' +
  'hover:bg-accent-600 hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent-500 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer';

/** Primary action button — brand fill (accent-500), used for the main CTA in forms/modals. */
export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
  loading,
  className = '',
  icon,
  title,
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={`${base} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}