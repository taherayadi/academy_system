import { motion } from 'motion/react';
import { RefreshCw, Loader2, FileText } from 'lucide-react';
import { planLabel } from '../../utils/pricing';
import { arPlural } from '../../utils/format';
import { RENEWAL_STATUS_LABEL } from './constants';
import { Segmented } from './uiParts';
import type { DashboardApi } from './usePlatformDashboard';

export default function RenewalsSection({ d }: { d: DashboardApi }) {
  const { renewalKindFilter, setRenewalKindFilter, renewalStatusFilter, setRenewalStatusFilter, loadRenewals, renewalsLoading, renewalRequests, filteredRenewals, setReviewRenewal } = d;
  return (
(
        <motion.div className="space-y-6">
          {/* Filters — type / statut */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl bg-white border border-slate-200 shadow-sm px-5 py-4">
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-1.5">النوع</div>
              <Segmented<'all' | 'renewal' | 'upgrade'>
                value={renewalKindFilter}
                onChange={setRenewalKindFilter}
                options={[
                  { key: 'all', label: 'الكل' },
                  { key: 'renewal', label: 'تجديد' },
                  { key: 'upgrade', label: 'تغيير الباقة' }
                ]}
              />
            </div>
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-1.5">الحالة</div>
              <Segmented<'all' | 'pending' | 'approved' | 'rejected'>
                value={renewalStatusFilter}
                onChange={setRenewalStatusFilter}
                options={[
                  { key: 'all', label: 'الكل' },
                  { key: 'pending', label: 'قيد الانتظار' },
                  { key: 'approved', label: 'مقبولة' },
                  { key: 'rejected', label: 'مرفوضة' }
                ]}
              />
            </div>
              <button onClick={loadRenewals} title="تحديث" aria-label="تحديث"
              className="ms-auto p-2.5 min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 hover:border-accent-500/40 hover:text-accent-500 text-slate-600 transition cursor-pointer">
              <RefreshCw className={`h-4 w-4 ${renewalsLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          </div>

          {renewalsLoading ? (
            <p className="flex items-center gap-2 text-sm font-bold text-slate-500">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent-500" /> جارٍ التحميل…
            </p>
          ) : renewalRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
              <p className="text-sm font-black text-slate-500">لا توجد طلبات</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                تقدم المراكز هنا بطلبات التجديد وتغيير الباقة.
              </p>
            </div>
          ) : filteredRenewals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
              <p className="text-sm font-black text-slate-500">لا توجد نتائج لهذه الفلاتر</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                عدّل النوع أو الحالة لعرض طلبات أخرى.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRenewals.map(r => (
                <div key={r.id} className={`rounded-2xl border bg-white p-4 ${r.status === 'pending' ? 'border-amber-200' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">{r.centerName || r.centerId}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${
                      r.kind === 'upgrade' ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {r.kind === 'upgrade' ? 'Changement d’offre' : 'Renouvellement'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${
                      r.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : r.status === 'approved' ? 'bg-accent-500/[0.06] text-accent-700 border-accent-500/20'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {r.status === 'pending' ? 'قيد الانتظار' : r.status === 'approved' ? 'مقبولة' : 'مرفوضة'}
                    </span>
                    <span className="ms-auto text-[11px] font-bold text-slate-500">
                      {new Date(r.createdAt).toLocaleDateString('ar-TN')}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
                    <span>
                      {r.currentStatus && (
                        <span className="text-slate-500">{RENEWAL_STATUS_LABEL[r.currentStatus] || r.currentStatus} · </span>
                      )}
                      {planLabel(r.currentPlan)} <span className="text-slate-500">→</span>{' '}
                      <span className="font-black text-accent-500">{planLabel(r.requestedPlan)}</span>
                    </span>
                    <span>${arPlural(r.requestedModules.length, 'وحدة', 'وحدتان', 'وحدات', 'وحدة')}</span>
                    <span>{r.billingCycle === 'annual' ? 'سنوي' : 'شهري'}</span>
                    {r.amount !== null && <span className="font-black text-slate-900">{r.amount} TND</span>}
                  </div>

                  {r.note && (
                    <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">« {r.note} »</p>
                  )}

                  {r.status === 'pending' ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReviewRenewal(r)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-accent-500 rounded-xl shadow-sm shadow-accent-500/20 hover:shadow-md transition cursor-pointer"
                      >
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        مراجعة وتطبيق
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p className="text-[11px] font-semibold text-slate-500">
                        تمت المعالجة{r.decidedBy ? ` بواسطة ${r.decidedBy}` : ''}{r.decidedAt ? ` في ${new Date(r.decidedAt).toLocaleDateString('ar-TN')}` : ''}
                        {r.decisionNote ? ` — « ${r.decisionNote} »` : ''}
                      </p>
                      <button
                        type="button"
                        onClick={() => setReviewRenewal(r)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-black text-accent-500 bg-accent-500/10 hover:bg-accent-500/20 border border-accent-500/30 rounded-xl transition cursor-pointer"
                      >
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        عرض التفاصيل
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )
  );
}
