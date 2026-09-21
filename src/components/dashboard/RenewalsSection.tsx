import { useState } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Loader2, FileText, Check, X } from 'lucide-react';
import { PrimaryButton } from '../ui';
import ConfirmDialog from '../ConfirmDialog';
import { planLabel } from '../../utils/pricing';
import { arPlural } from '../../utils/format';
import { RENEWAL_STATUS_LABEL } from './constants';
import { Segmented } from './uiParts';
import type { DashboardApi } from './usePlatformDashboard';

export default function RenewalsSection({ d }: { d: DashboardApi }) {
  const { renewalKindFilter, setRenewalKindFilter, renewalStatusFilter, setRenewalStatusFilter, loadRenewals, renewalsLoading, renewalRequests, filteredRenewals, setReviewRenewal, bulkDecideRenewals } = d;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDecision, setBulkDecision] = useState<'approved' | 'rejected' | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const runBulk = async () => {
    if (!bulkDecision) return;
    setBulkBusy(true);
    await bulkDecideRenewals([...selected], bulkDecision);
    setSelected(new Set());
    setBulkDecision(null);
    setBulkBusy(false);
  };
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
              {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-accent-500/30 bg-accent-500/[0.06] px-4 py-3">
                  <span className="text-xs font-black text-accent-700">{selected.size} طلبًا محددًا</span>
                  <div className="ms-auto flex items-center gap-2">
                    <PrimaryButton className="!px-4 !py-2 !text-xs" icon={<Check className="h-4 w-4" aria-hidden="true" />}
                      onClick={() => setBulkDecision('approved')}>
                      قبول المحدد
                    </PrimaryButton>
                    <button type="button" onClick={() => setBulkDecision('rejected')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black text-red-700 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition cursor-pointer">
                      <X className="h-4 w-4" aria-hidden="true" />
                      رفض المحدد
                    </button>
                    <button type="button" onClick={() => setSelected(new Set())}
                      className="text-[11px] font-black text-slate-500 hover:text-slate-700 transition cursor-pointer">
                      إلغاء التحديد
                    </button>
                  </div>
                </div>
              )}
              {filteredRenewals.map(r => (
                <div key={r.id} className={`rounded-2xl border bg-white p-4 ${r.status === 'pending' ? 'border-amber-200' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.status === 'pending' && (
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        aria-label={`اختيار طلب ${r.centerName || r.centerId}`}
                        className="accent-accent-500 h-4 w-4 cursor-pointer"
                      />
                    )}
                    <span className="text-sm font-black text-slate-900">{r.centerName || r.centerId}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${
                      r.kind === 'upgrade' ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {r.kind === 'upgrade' ? 'تغيير الباقة' : 'تجديد'}
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
          <ConfirmDialog
            open={bulkDecision !== null}
            title={bulkDecision === 'approved' ? 'قبول الطلبات المحددة' : 'رفض الطلبات المحددة'}
            message={bulkDecision === 'approved'
              ? `سيُقبل ${selected.size} طلبًا ويُطبَّق على مراكزه فورًا (تجديدًا أو تغيير باقة). لا يمكن التراجع.`
              : `سيُرفض ${selected.size} طلبًا دون تطبيق أي تغيير على المراكز.`}
            confirmLabel={bulkDecision === 'approved' ? 'قبول وتطبيق' : 'رفض الطلبات'}
            danger={bulkDecision === 'rejected'}
            onConfirm={runBulk}
            onCancel={() => setBulkDecision(null)}
          />
        </motion.div>
      )
  );
}
