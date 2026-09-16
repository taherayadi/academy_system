import React from 'react';

export type StatusTone = 'brand' | 'success' | 'warning' | 'error' | 'neutral' | 'info';

const TONE_CLASSES: Record<StatusTone, string> = {
  brand: 'bg-brand-50 text-brand-700 border border-brand-200',
  success: 'bg-success-50 text-success-700 border border-success-200',
  warning: 'bg-warning-50 text-warning-700 border border-warning-200',
  error: 'bg-error-50 text-error-700 border border-error-200',
  neutral: 'bg-neutral-100 text-neutral-600 border border-neutral-200',
  info: 'bg-info-50 text-info-700 border border-info-200',
};

interface StatusBadgeProps {
  /** Visual tone — maps to the semantic token families. */
  tone?: StatusTone;
  /** Badge text. */
  label: string;
  className?: string;
}

/**
 * Standardized status indicator.
 *
 * Replaces the repeated inline `STATUS_BADGE`-style maps with a single
 * component mapping a semantic tone to token-based classes (brand/success/
 * warning/error/neutral/info from the `@theme` in index.css).
 */
export function StatusBadge({ tone = 'neutral', label, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${TONE_CLASSES[tone]} ${className}`}
    >
      {label}
    </span>
  );
}