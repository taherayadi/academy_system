import { motion } from 'motion/react';
import { Building2, Clock, CheckCircle2, CalendarClock, Loader2, FileText, TrendingUp, Receipt, ArrowRight } from 'lucide-react';
import { RevenueChart } from '../charts/RevenueChart';
import { PlanDistributionChart } from '../charts/PlanDistributionChart';
import { SubscriptionGrowthChart } from '../charts/SubscriptionGrowthChart';
import { toneClasses } from '../ui/StatusBadge';
import { fmtDate } from '../../utils/format';
import { titleCaseName, normalizeCenterType, CENTER_TYPE_LABEL, REQ_STATUS_BADGE, REQ_STATUS_LABEL, daysLeft } from './constants';
import type { DashboardApi } from './usePlatformDashboard';

export default function OverviewSection({ d }: { d: DashboardApi }) {
  const { billingSummary, centers, activeCenters, trialCenters, newRequests, revenueChart, financeLoading, onNavigate, loading, requests } = d;
  return (
(
        <motion.div key="overview" className="relative space-y-6">

          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {[
              { label: 'الإيراد الشهري (MRR)', value: billingSummary ? `${billingSummary.mrr.toFixed(0)} TND` : '—', icon: TrendingUp, tint: 'bg-accent-500/10 text-accent-500' },
              { label: 'إجمالي المراكز', value: centers.length, icon: Building2, tint: 'bg-accent-500/10 text-accent-500' },
              { label: 'مراكز نشطة', value: activeCenters, icon: CheckCircle2, tint: 'bg-accent-500/10 text-accent-500' },
              { label: 'في التجربة', value: trialCenters, icon: Clock, tint: 'bg-amber-100 text-amber-600' },
              { label: 'طلبات جديدة', value: newRequests, icon: FileText, tint: 'bg-accent-500/10 text-accent-500' },
              { label: 'مستحقات التحصيل', value: billingSummary ? `${billingSummary.pendingInvoices.toFixed(0)} TND` : '—', icon: Receipt, tint: 'bg-red-100 text-red-600' }
            ].map(kpi => (
              <div key={kpi.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 hover:shadow-md hover:shadow-slate-900/5 hover:-translate-y-0.5 transition-all">
                <div className={`inline-flex p-2.5 rounded-xl mb-3 ${kpi.tint}`}>
                  <kpi.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="text-xl font-black text-slate-900 leading-none tracking-tight">{kpi.value}</p>
                <p className="text-[11px] font-bold text-slate-500 mt-1.5 uppercase tracking-wider">{kpi.label}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-5 gap-5">

            {/* Revenue chart */}
            <RevenueChart
              monthlyData={revenueChart}
              loading={financeLoading}
              collectedThisYear={billingSummary?.collectedThisYear}
            />

            {/* Recent requests */}
            <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <span className="p-2.5 bg-accent-500/10 rounded-xl"><FileText aria-hidden="true" className="h-4 w-4 text-accent-500" /></span>
                  <h3 className="text-sm font-black text-slate-900">أحدث الطلبات</h3>
                </div>
                <button onClick={() => onNavigate?.('requests')} className="text-[11px] font-black text-accent-500 hover:text-accent-700 transition inline-flex items-center gap-1 cursor-pointer">
                  عرض الكل <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-accent-500" /></div>
              ) : requests.length === 0 ? (
                <p className="text-center py-12 text-sm font-bold text-slate-500">لا توجد طلبات</p>
              ) : (
                <div className="space-y-3">
                  {requests.slice(0, 4).map(r => (
                    <div key={r.id} className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center text-[11px] font-black text-slate-500 flex-shrink-0">
                        {titleCaseName(r.fullName).split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black text-slate-900 truncate">{titleCaseName(r.academyName)}</div>
                        <div className="text-[11px] font-semibold text-slate-500 truncate">
                          {titleCaseName(r.fullName)} · {normalizeCenterType(r.centerType) ? CENTER_TYPE_LABEL[normalizeCenterType(r.centerType)] : fmtDate(r.createdAt)}
                        </div>
                      </div>
                      <span className={`text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${toneClasses(REQ_STATUS_BADGE[r.status] || REQ_STATUS_BADGE.new)}`}>
                        {REQ_STATUS_LABEL[r.status] || r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Charts placeholders — future chart components */}
          <div className="grid lg:grid-cols-2 gap-5">
            <PlanDistributionChart />
            <SubscriptionGrowthChart />
          </div>

          {/* Trials to watch */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-900/5">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="p-2.5 bg-amber-100 rounded-xl"><CalendarClock aria-hidden="true" className="h-4 w-4 text-amber-600" /></span>
              <h3 className="text-sm font-black text-slate-900">تجارب تستحق المتابعة</h3>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-10"><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-accent-500" /></div>
            ) : centers.filter(c => c.status === 'trial').length === 0 ? (
              <p className="text-center py-10 text-sm font-bold text-slate-500">لا يوجد مركز في التجربة</p>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {centers
                  .filter(c => c.status === 'trial')
                  .sort((a, b) => (daysLeft(a.trialEndsAt) ?? 999) - (daysLeft(b.trialEndsAt) ?? 999))
                  .slice(0, 6)
                  .map(c => {
                    const days = daysLeft(c.trialEndsAt);
                    return (
                      <button key={c.id} onClick={() => onNavigate?.('centers')}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 hover:border-accent-500/50 hover:bg-accent-500/[0.04] p-3.5 text-start transition cursor-pointer">
                        {c.logoUrl ? (
                          <div className="h-11 w-11 rounded-2xl border border-slate-200 bg-white p-0.5 overflow-hidden flex-shrink-0">
                            <img src={c.logoUrl} alt={c.name} className="w-full h-full rounded-xl object-cover" />
                          </div>
                        ) : (
                          <div className="h-11 w-11 rounded-2xl bg-accent-500/10 flex items-center justify-center text-[11px] font-black text-accent-500 flex-shrink-0">
                            {c.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-black text-slate-900 truncate">{c.name}</div>
                          <div className="text-[11px] font-semibold text-slate-500">{c.adminEmail || '—'}</div>
                        </div>
                        <span className={`text-[11px] font-black px-2.5 py-1 rounded-full flex-shrink-0 ${
                          days === null ? 'bg-slate-50 text-slate-500 border border-slate-100'
                            : days <= 3 ? 'bg-accent-500/15 text-accent-500 border border-accent-500/30'
                            : days <= 7 ? 'bg-accent-500/10 text-accent-500 border border-accent-500/30'
                            : 'bg-slate-50 text-slate-500 border border-slate-200'
                        }`}>
                          {days === null ? '—' : days > 0 ? `${days} j` : 'منتهٍ'}
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </motion.div>
      )
  );
}
