import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { motion } from 'motion/react';
import { SkeletonCard } from '../ui';

/**
 * Monthly collected-revenue bar chart for the Overview tab.
 * Extracted verbatim from PlatformAdminDashboard.tsx (Overview page) so the
 * 4200-line dashboard file stays lean and the chart is reusable.
 *
 * Pure presentation component — receives already-computed data; no data layer.
 */
export interface RevenueChartProps {
  /** Last N months, oldest → newest, each with a display label and paid total. */
  monthlyData: { key: string; label: string; total: number }[];
  /** True while invoices are still being fetched — shows skeleton bars. */
  loading: boolean;
  /**
   * Invoice total collected this calendar year, shown as the "per year" badge.
   * Optional — the badge renders only when a value is provided (mirrors the
   * original `billingSummary &&` condition).
   */
  collectedThisYear?: number;
}

export function RevenueChart({ monthlyData, loading, collectedThisYear }: RevenueChartProps) {
  const maxRevenue = Math.max(...monthlyData.map((m) => m.total), 1);

  // Accessible representation: the bar visual is a role="img" with a full
  // spoken summary; a screen-reader-only table carries the exact values
  // (WCAG 1.1.1 Non-text Content).
  const revenueAriaLabel =
    'الإيرادات المحصّلة — 6 derniers mois : ' +
    monthlyData.map((m) => `${m.label} ${m.total.toFixed(0)} TND`).join(', ') +
    (collectedThisYear !== undefined ? `. Total annuel : ${collectedThisYear.toFixed(0)} TND.` : '.');

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span className="p-2.5 bg-accent-500/10 rounded-xl">
            <BarChart3 aria-hidden="true" className="h-4 w-4 text-accent-500" />
          </span>
          <div>
            <h3 className="text-sm font-black text-slate-900">الإيرادات المحصّلة</h3>
            <p className="text-[11px] font-bold text-slate-500">6 derniers mois</p>
          </div>
        </div>
        {collectedThisYear !== undefined && (
          <span className="text-xs font-black text-accent-700 bg-accent-500/[0.06] border border-accent-500/20 rounded-full px-3 py-1">
            {collectedThisYear.toFixed(0)} TND / an
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid gap-6 py-14" aria-hidden="true">
          <SkeletonCard lines={2} avatar={false} badge={false} className="col-span-1" />
          <SkeletonCard lines={2} avatar={false} badge={false} className="col-span-1" />
          <SkeletonCard lines={2} avatar={false} badge={false} className="col-span-1" />
          <SkeletonCard lines={2} avatar={false} badge={false} className="col-span-1" />
        </div>
      ) : (
        <>
          <div role="img" aria-label={revenueAriaLabel}>
            <div aria-hidden="true" className="flex items-end justify-between gap-3 h-44">
              {monthlyData.map((m, i) => (
                <div key={m.key} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <span className="text-[11px] font-black text-slate-500">{m.total > 0 ? m.total.toFixed(0) : ''}</span>
                  <motion.div
                    animate={{ height: `${Math.max(4, (m.total / maxRevenue) * 100)}%` }}
                    className={`w-full rounded-xl ${i === monthlyData.length - 1 ? 'bg-accent-500 shadow-sm shadow-accent-500/20' : 'bg-accent-500/15'}`}
                  />
                  <span className="text-[11px] font-bold text-slate-500 capitalize">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
          <table className="sr-only">
            <caption>الإيرادات المحصّلة شهريًا (TND)</caption>
            <thead>
              <tr>
                <th scope="col">الشهر</th>
                <th scope="col">المحصَّل</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((m) => (
                <tr key={m.key}>
                  <th scope="row">{m.label}</th>
                  <td>{m.total.toFixed(0)} TND</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}