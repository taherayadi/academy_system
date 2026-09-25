import { motion } from 'motion/react';
import { Building2, CheckCircle2, Trash2, Mail, Phone, FileText, Lock, GraduationCap } from 'lucide-react';
import { SkeletonCard } from '../ui';
import { fmtDate, arPlural } from '../../utils/format';
import { parseModules, titleCaseName, normalizeCenterType, CENTER_TYPE_LABEL, CENTER_TYPE_BADGE, CENTER_TYPES, REQ_STATUS_BADGE, REQ_STATUS_LABEL, REQ_TYPE_LABEL, isBaseModule, MODULE_LABEL } from './constants';
import { toneClasses } from '../ui/StatusBadge';
import {Segmented, Pagination, EmptyState } from './uiParts';
import type { DashboardApi } from './usePlatformDashboard';

export default function RequestsSection({ d }: { d: DashboardApi }) {
  const { listTopRef, reqTypeFilter, setReqTypeFilter, reqStatusFilter, setReqStatusFilter, filteredRequests, loading, q, pagedRequests, handleReqStatus, setConvertRequest, setShowNewCenter, setDeleteRequest, safeRequestsPage, requestsTotalPages, setRequestsPage } = d;
  return (
(
        <motion.div key="requests" className="relative space-y-4">

          {/* Filters — type / statut */}
          <div ref={listTopRef} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl bg-white border border-slate-200 shadow-sm px-5 py-4 scroll-mt-24">
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-1.5">نوع المؤسسة</div>
              <Segmented<'all' | typeof CENTER_TYPES[number]['key']>
                value={reqTypeFilter}
                onChange={setReqTypeFilter}
                options={[
                  { key: 'all', label: 'الكل' },
                  ...CENTER_TYPES.map(ct => ({ key: ct.key, label: ct.label })),
                ]}
              />
            </div>
            <div>
              <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-1.5">الحالة</div>
              <Segmented<'new' | 'converted' | 'archived'>
                value={reqStatusFilter}
                onChange={setReqStatusFilter}
                options={[
                  { key: 'new', label: 'جديد' },
                  { key: 'converted', label: 'محوَّل' },
                  { key: 'archived', label: 'مؤرشف' }
                ]}
              />
            </div>
            <span className="ms-auto text-xs font-bold text-slate-500">
              ${arPlural(filteredRequests.length, 'نتيجة', 'نتيجتان', 'نتائج', 'نتيجة')}
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
          ) : filteredRequests.length === 0 ? (
            q ? (
              <EmptyState icon={FileText} title="لا توجد نتائج لهذا البحث" hint="عدّل البحث أو الفلتر لعرض طلبات أخرى." />
            ) : (
              <EmptyState icon={FileText} title="لا توجد طلبات مستلمة" hint="تظهر هنا طلبات المراكز الجديدة فور وصولها من واجهة المنصة." />
            )
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
              {pagedRequests.map(req => {
            const mods = parseModules(req.requestedModules);
            return (
              <motion.div key={req.id}
                className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm shadow-slate-900/5 hover:shadow-md hover:shadow-slate-900/5 hover:border-accent-500/30 transition flex flex-col">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3.5">
                    <div className="h-11 w-11 rounded-2xl bg-accent-500/5 flex items-center justify-center text-sm font-black text-accent-500 flex-shrink-0">
                      {titleCaseName(req.fullName).split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-sm">{titleCaseName(req.fullName)}</p>
                      <p className="text-xs font-black text-accent-500">{titleCaseName(req.academyName)}</p>
                      <p className="text-[11px] text-slate-500 font-semibold mt-0.5">{fmtDate(req.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {normalizeCenterType(req.centerType) && (
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${toneClasses(CENTER_TYPE_BADGE[normalizeCenterType(req.centerType)])}`}>
                        {CENTER_TYPE_LABEL[normalizeCenterType(req.centerType)]}
                      </span>
                    )}
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${toneClasses(REQ_STATUS_BADGE[req.status] || REQ_STATUS_BADGE.new)}`}>
                      {REQ_STATUS_LABEL[req.status] || req.status}
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                      {REQ_TYPE_LABEL[req.requestType] || req.requestType}
                    </span>
                  </div>
                </div>

                {/* Contact links */}
                <div className="mt-3 flex items-center gap-4 flex-wrap">
                  {req.email && (
                    <a href={`mailto:${req.email}`}
                      className="flex items-center gap-1.5 text-xs font-bold text-accent-500 hover:underline">
                      <Mail aria-hidden="true" className="h-4 w-4" /> {req.email}
                    </a>
                  )}
                  {req.phone && (
                    <a href={`tel:${req.phone}`}
                      className="flex items-center gap-1.5 text-xs font-bold text-accent-500 hover:underline">
                      <Phone aria-hidden="true" className="h-4 w-4" /> {req.phone}
                    </a>
                  )}
                </div>

                {req.message && (
                  <p className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-xl px-3.5 py-2.5 leading-relaxed">{req.message}</p>
                )}

                {/* Requested modules — envoyées avec la demande */}
                {mods.length > 0 && (
                  <div className="mt-3.5">
                    <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.12em] mb-2 flex items-center gap-1.5">
                      <GraduationCap aria-hidden="true" className="h-4 w-4" />
                      الوحدات المطلوبة ({mods.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {mods.map(mk => isBaseModule(mk) ? (
                        <span key={mk} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent-500 text-white inline-flex items-center gap-1">
                          <Lock aria-hidden="true" className="h-2.5 w-2.5" /> {MODULE_LABEL(mk)}
                        </span>
                      ) : (
                        <span key={mk} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-accent-500/10 text-accent-500">
                          {MODULE_LABEL(mk)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-auto pt-4">
                <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3.5">
                  {req.status === 'converted' ? (
                    // Convertie : verrouillée — seule l'archivation est proposée.
                    <select
                      value="converted"
                      onChange={e => { if (e.target.value === 'archived') handleReqStatus(req, 'archived'); }}
                      aria-label="حالة الطلب"
                      className="text-[11px] font-bold px-3 py-1.5 pointer-coarse:min-h-11 border border-slate-200 rounded-xl bg-white text-slate-600 focus:border-accent-500 focus:ring-0 outline-none cursor-pointer">
                      <option value="converted">محوَّل</option>
                      <option value="archived">مؤرشف</option>
                    </select>
                  ) : (
                    <select
                      value={req.status === 'contacted' ? 'new' : req.status}
                      onChange={e => handleReqStatus(req, e.target.value)}
                      className="text-[11px] font-bold px-3 py-1.5 pointer-coarse:min-h-11 border border-slate-200 rounded-xl bg-white focus:border-accent-500 focus:ring-0 outline-none cursor-pointer">
                      <option value="new">جديد</option>
                      <option value="archived">مؤرشف</option>
                    </select>
                  )}

                  {req.status !== 'converted' ? (
                    <button
                      onClick={() => { setConvertRequest(req); setShowNewCenter(true); }}
                      className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 pointer-coarse:min-h-11 bg-accent-500 text-white rounded-xl shadow-sm shadow-accent-500/20 hover:shadow-md transition cursor-pointer">
                      <Building2 aria-hidden="true" className="h-4 w-4" /> Convertir en Centre
                    </button>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 pointer-coarse:min-h-11 bg-accent-500/[0.06] text-accent-700 border border-accent-500/20 rounded-xl"
                      title='تم تحويل هذا الطلب إلى مركز مسبقًا — التحويل ممكن مرة واحدة فقط.'
                    >
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> تم تحويله
                    </span>
                  )}

                  <button onClick={() => setDeleteRequest(req)}
                    className="ms-auto flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 pointer-coarse:min-h-11 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition cursor-pointer">
                    <Trash2 aria-hidden="true" className="h-4 w-4" /> حذف
                  </button>
                </div>
                </div>
              </motion.div>
            );
              })}
              </div>
              <Pagination
                page={safeRequestsPage}
                totalPages={requestsTotalPages}
                total={filteredRequests.length}
                onChange={p => { setRequestsPage(p); listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              />
            </>
          )}
        </motion.div>
      )
  );
}
