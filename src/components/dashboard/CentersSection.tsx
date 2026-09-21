import { motion } from 'motion/react';
import { Building2, CheckCircle2, PauseCircle, CalendarClock, Layers, Trash2, X, Edit, Lock } from 'lucide-react';
import { StatusBadge, SkeletonCard } from '../ui';
import { fmtDate, arPlural } from '../../utils/format';
import { daysLeft, inferredSubscriptionStart, normalizeCenterType, CENTER_TYPE_LABEL, STATUS_BADGE, STATUS_LABEL, PLAN_BADGE, PLAN_LABEL, isBaseModule, MODULE_LABEL } from './constants';
import { Segmented, Pagination } from './uiParts';
import type { DashboardApi } from './usePlatformDashboard';

export default function CentersSection({ d }: { d: DashboardApi }) {
  const { listTopRef, centerTypeFilter, setCenterTypeFilter, statusFilter, setStatusFilter, planFilter, setPlanFilter, filteredCenters, loading, q, pagedCenters, handleApplyScheduledPlan, handleCancelScheduledPlan, setEditCenter, handleToggleStatus, setPlanCenter, setDeleteCenter, safeCentersPage, centersTotalPages, setCentersPage } = d;
  return (
(
        <motion.div key="centers" className="relative space-y-4">

          {/* Filters — type / statut / plan */}
          <div ref={listTopRef} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl bg-white border border-slate-200 shadow-sm px-5 py-4 scroll-mt-24">
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-1.5">النوع</div>
              <Segmented<'all' | 'jardin' | 'formation'>
                value={centerTypeFilter}
                onChange={setCenterTypeFilter}
                options={[
                  { key: 'all', label: 'الكل' },
                  { key: 'jardin', label: 'روضة أطفال' },
                  { key: 'formation', label: 'مركز تدريب' }
                ]}
              />
            </div>
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-1.5">الحالة</div>
              <Segmented<'all' | 'trial' | 'active' | 'suspended' | 'expired'>
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { key: 'all', label: 'الكل' },
                  { key: 'trial', label: 'تجربة' },
                  { key: 'active', label: 'نشط' },
                  { key: 'suspended', label: 'موقوف' },
                  { key: 'expired', label: 'منتهٍ' }
                ]}
              />
            </div>
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-1.5">الباقة</div>
              <Segmented<'all' | 'basic' | 'growth' | 'pro' | 'custom'>
                value={planFilter}
                onChange={setPlanFilter}
                options={[
                  { key: 'all', label: 'الكل' },
                  { key: 'basic', label: 'الأساسية' },
                  { key: 'growth', label: 'النمو' },
                  { key: 'pro', label: 'الاحترافية' },
                  { key: 'custom', label: 'مخصصة' }
                ]}
              />
            </div>
            <span className="ms-auto text-xs font-bold text-slate-500">
              ${arPlural(filteredCenters.length, 'نتيجة', 'نتيجتان', 'نتائج', 'نتيجة')}
            </span>
          </div>

          {loading ? (
            <div className="grid gap-6 py-20">
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
              <SkeletonCard lines={3} avatar={true} className="col-span-1 sm:col-span-2 lg:col-span-1" />
            </div>
          ) : filteredCenters.length === 0 ? (
            <div className="text-center py-20 rounded-3xl bg-white border border-slate-200 text-slate-500">
              <Building2 aria-hidden="true" className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold">{q ? 'لا توجد نتائج لهذا البحث' : 'لا توجد مراكز'}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
              {pagedCenters.map(c => {
            const days = daysLeft(c.trialEndsAt);
            const subscriptionStart = inferredSubscriptionStart(c);
            const subscriptionDays = daysLeft(c.subscriptionEndsAt);
            const mods = (c.enabledModules as string[]) || [];
            return (
              <motion.div key={c.id}
                className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm shadow-slate-900/5 hover:shadow-md hover:shadow-slate-900/5 hover:border-accent-500/30 transition flex flex-col">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3.5">
                    {c.logoUrl ? (
                      <div className="h-9 w-9 rounded-xl border border-slate-200 bg-white p-0.5 overflow-hidden flex-shrink-0">
                        <img src={c.logoUrl} alt={c.name} className="w-full h-full rounded-lg object-cover" />
                      </div>
                    ) : (
                      <div className="h-9 w-9 rounded-xl bg-accent-500/10 flex items-center justify-center text-sm font-black text-accent-500 flex-shrink-0">
                        {c.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                    )}
                    <div>
                      <p className="font-black text-slate-900 text-sm">{c.name}</p>
                      <p className="text-xs text-slate-500 font-semibold">{c.adminEmail || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {normalizeCenterType(c.centerType) && (
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${normalizeCenterType(c.centerType) === 'jardin' ? 'bg-accent-500/[0.06] text-accent-700 border border-accent-500/20' : 'bg-accent-500/10 text-accent-500 border border-accent-500/30'}`}>
                        {CENTER_TYPE_LABEL[normalizeCenterType(c.centerType)]}
                      </span>
                    )}
                    <StatusBadge tone={STATUS_BADGE[c.status] || 'neutral'} label={STATUS_LABEL[c.status] || c.status} />
                    <StatusBadge tone={PLAN_BADGE[c.plan] || PLAN_BADGE.starter} label={PLAN_LABEL[c.plan] || c.plan} />
                  </div>
                </div>

                {/* Trial and subscription lifecycle dates */}
                {c.status === 'trial' && c.trialEndsAt && (
                  <div className={`mt-3.5 flex items-center gap-2 text-xs font-bold rounded-xl px-3.5 py-2.5 border ${
                    (days ?? 0) <= 3
                      ? 'bg-accent-500/15 text-accent-500 border-accent-500/25'
                      : (days ?? 0) <= 7
                        ? 'bg-accent-500/10 text-accent-500 border-accent-500/20'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}>
                    <CalendarClock className="h-4 w-4" aria-hidden="true" />
                    {days !== null && days > 0
                      ? `فترة تجريبية: ${arPlural(days, 'يوم متبقٍ', 'يومان متبقيان', 'أيام متبقية', 'يومًا متبقيًا')} · تنتهي في ${fmtDate(c.trialEndsAt)}`
                      : `انتهت الفترة التجريبية في ${fmtDate(c.trialEndsAt)}`}
                  </div>
                )}
                {c.status !== 'trial' && (c.subscriptionEndsAt || c.trialEndsAt) && (
                  <div className="mt-3.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] font-bold text-slate-600 space-y-1">
                    {c.trialEndsAt && <div>نهاية الفترة التجريبية: {fmtDate(c.trialEndsAt)}</div>}
                    {c.subscriptionEndsAt && (
                      <div className={subscriptionDays !== null && subscriptionDays <= 7 ? 'text-amber-700' : 'text-slate-600'}>
                        الاشتراك: بداية {subscriptionStart ? fmtDate(subscriptionStart) : '—'} · نهاية {fmtDate(c.subscriptionEndsAt)}
                        {subscriptionDays !== null && subscriptionDays > 0 ? ` · ${arPlural(subscriptionDays, 'يوم متبقٍ', 'يومان متبقيان', 'أيام متبقية', 'يومًا متبقيًا')}` : ' · منتهٍ'}
                      </div>
                    )}
                  </div>
                )}

                {/* Scheduled plan change */}
                {c.scheduledPlan && (
                  <div className="mt-3.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-[11px] font-black text-amber-800 inline-flex items-center gap-1.5">
                      <CalendarClock className="h-4 w-4" aria-hidden="true" />
                      → {PLAN_LABEL[c.scheduledPlan.plan === 'starter' ? 'basic' : c.scheduledPlan.plan]}
                      <span className="font-semibold text-amber-700">
                        مجدولة{c.scheduledPlan.applyAt ? ` في ${fmtDate(c.scheduledPlan.applyAt)}` : ' (عند التجديد القادم)'}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 ms-auto">
                      <button
                        onClick={() => handleApplyScheduledPlan(c)}
                        disabled={!!c.scheduledPlan.applyAt && c.scheduledPlan.applyAt > Date.now() && c.status === 'active'}
                          className="text-[11px] font-black px-2.5 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        تطبيق
                      </button>
                      <button
                        onClick={() => handleCancelScheduledPlan(c)}
                        title="إلغاء التغيير المجدول"
                        className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-100 transition cursor-pointer"
                        aria-label="إلغاء التغيير المجدول"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                )}

                {/* Modules */}
                {mods.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {mods.filter(mk => isBaseModule(mk)).map(mk => (
                      <span key={mk} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent-500 text-white inline-flex items-center gap-1">
                        <Lock className="h-2.5 w-2.5" aria-hidden="true" /> {MODULE_LABEL(mk)}
                      </span>
                    ))}
                    {mods.filter(mk => !isBaseModule(mk)).map(mk => (
                      <span key={mk} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent-500/10 text-accent-500">
                        {MODULE_LABEL(mk)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-auto pt-4">
                <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3.5">
                  <button onClick={() => setEditCenter(c)}
                    className="text-[11px] font-bold px-3 py-1.5 bg-slate-50 text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5"
                    title="معلومات أساسية عن المركز">
                    <Edit className="h-4 w-4" aria-hidden="true" /> تعديل
                  </button>
                  <button onClick={() => handleToggleStatus(c)}
                    className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition cursor-pointer flex items-center gap-1.5 ${
                      c.status === 'suspended'
                        ? 'bg-accent-500/[0.06] text-accent-700 border-accent-500/20 hover:bg-accent-500/10'
                        : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                    }`}>
                    {c.status === 'suspended' ? <><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> تفعيل</> : <><PauseCircle className="h-4 w-4" aria-hidden="true" /> إيقاف</>}
                  </button>
                  <button onClick={() => setPlanCenter(c)}
                    className="text-[11px] font-bold px-3 py-1.5 bg-accent-500/10 text-accent-500 border border-accent-500/30 rounded-xl hover:bg-accent-500/20 transition cursor-pointer flex items-center gap-1.5"
                    title="إدارة الباقة والوحدات والفواتير والتغييرات المبرمجة">
                    <Layers className="h-4 w-4" aria-hidden="true" /> الباقات &amp; الفواتير
                  </button>
                  <button onClick={() => setDeleteCenter(c)}
                    className="ms-auto text-[11px] font-bold px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition cursor-pointer flex items-center gap-1.5">
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer
                  </button>
                </div>
                </div>
              </motion.div>
            );
              })}
              </div>
              <Pagination
                page={safeCentersPage}
                totalPages={centersTotalPages}
                total={filteredCenters.length}
                onChange={p => { setCentersPage(p); listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              />
            </>
          )}
        </motion.div>
      )
  );
}
