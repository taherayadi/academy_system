import React from 'react';
import { PieChart } from 'lucide-react';
import { Skeleton } from '../ui';

/**
 * Placeholder card for the plan-distribution chart.
 * Renders a polished empty-state that reserves the space and visual weight
 * the real chart will occupy later. Uses Warm Modern brand colors
 * (#d97706 primary) and the Skeleton primitive for a subtle data-vis motif.
 *
 * Intentionally shows no interactive elements—purely scaffolding until
 * the plan-distribution data source and chart library are added.
 */
export function PlanDistributionChart() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <span className="p-2.5 bg-[#d97706]/10 rounded-xl">
            <PieChart aria-hidden="true" className="h-4 w-4 text-[#d97706]" />
          </span>
          <div>
            <h3 className="text-sm font-black text-slate-900">Répartition des plans</h3>
            <p className="text-[11px] font-bold text-slate-400">À venir</p>
          </div>
        </div>
      </div>

      {/* Visual motif: three varying-width skeleton bars hinting at chart bars/pie slices */}
      <div className="grid gap-4 py-8">
        <Skeleton className="h-3 w-full rounded-lg" />
        <Skeleton className="h-3 w-3/4 rounded-lg" />
        <Skeleton className="h-3 w-1/2 rounded-lg" />
      </div>
    </div>
  );
}