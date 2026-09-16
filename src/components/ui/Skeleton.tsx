import React from 'react';

/* ── Base primitive ──────────────────────────────────────────────────────── */

interface SkeletonProps {
  className?: string;
}

/**
 * Minimal animated placeholder — a rounded rectangle with a neutral shimmer.
 * All spacing/sizing is controlled by the consumer via Tailwind classes.
 */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-neutral-200 ${className}`}
      aria-hidden
    />
  );
}

/* ── Card skeleton (center / invoice / request card) ────────────────────── */

interface SkeletonCardProps {
  /** Number of text lines under the title. */
  lines?: number;
  /** Show an avatar / icon placeholder on the left. */
  avatar?: boolean;
  /** Show a badge placeholder on the right. */
  badge?: boolean;
  className?: string;
}

export function SkeletonCard({ lines = 2, avatar = false, badge = false, className = '' }: SkeletonCardProps) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex items-start gap-3">
        {avatar && <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-1/3 rounded-lg" />
            {badge && <Skeleton className="h-5 w-14 rounded-full" />}
          </div>
          {Array.from({ length: lines }).map((_, i) => (
            <Skeleton
              key={i}
              className={`h-3.5 rounded-lg ${i === lines - 1 ? 'w-2/5' : 'w-full'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Table row skeleton ─────────────────────────────────────────────────── */

interface SkeletonTableRowProps {
  columns?: number;
  className?: string;
}

export function SkeletonTableRow({ columns = 4, className = '' }: SkeletonTableRowProps) {
  return (
    <div className={`flex items-center gap-4 px-4 py-3 border-b border-slate-50 ${className}`}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3.5 rounded-lg ${
            i === 0 ? 'w-1/4' : i === columns - 1 ? 'w-1/6' : 'w-1/5'
          }`}
        />
      ))}
    </div>
  );
}

/* ── Stats / KPI skeleton ───────────────────────────────────────────────── */

interface SkeletonStatProps {
  className?: string;
}

export function SkeletonStat({ className = '' }: SkeletonStatProps) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-3 ${className}`}>
      <Skeleton className="h-3.5 w-1/3 rounded-lg" />
      <Skeleton className="h-7 w-1/2 rounded-lg" />
      <Skeleton className="h-3 w-2/5 rounded-lg" />
    </div>
  );
}