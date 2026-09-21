import { motion } from 'motion/react';
import { CheckCircle2, Trash2, X, Loader2, DollarSign, TrendingUp, AlertCircle, Receipt, Edit, BarChart3, Search, Printer, ChevronDown } from 'lucide-react';
import { updateInvoiceApi, deleteInvoiceApi, CenterInvoice } from '../../api';
import { toneClasses } from '../ui/StatusBadge';
import { arPlural } from '../../utils/format';
import { invoiceStatusMeta, paymentMethodLabel } from './constants';
import { Pagination } from './uiParts';
import type { DashboardApi } from './usePlatformDashboard';

export default function FinanceSection({ d }: { d: DashboardApi }) {
  const { financeLoading, billingSummary, pendingCheques, toast, loadFinanceData, handlePrintInvoice, setEditInvoice, invoiceGroups, filteredInvoices, invoiceSearch, setInvoiceSearch, invoiceStatusFilter, setInvoiceStatusFilter, invoiceMonthFilter, setInvoiceMonthFilter, invoiceMonths, monthLabel, invoices, pagedInvoiceGroups, setCollapsedGroupIds, collapsedGroupIds, invoiceGroupsTotalPages, safeInvoiceGroupsPage, INVOICE_GROUPS_PAGE_SIZE, setInvoiceCentersPage } = d;
  return (
(
        <motion.div key="finance" className="relative space-y-6">
          {financeLoading ? (
            <div className="flex items-center justify-center py-20 rounded-3xl bg-white border border-slate-200">
              <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-accent-500" />
            </div>
          ) : (
            <>
              {/* KPI cards */}
              {billingSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'MRR (الفواتير المدفوعة)', value: `${billingSummary.mrr.toFixed(2)} TND`, icon: TrendingUp, tint: 'bg-accent-500/10 text-accent-500' },
                    { label: 'تحصيل هذا الشهر', value: `${billingSummary.collectedThisMonth.toFixed(2)} TND`, icon: DollarSign, tint: 'bg-accent-500/10 text-accent-500' },
                    { label: 'تحصيل هذه السنة', value: `${billingSummary.collectedThisYear.toFixed(2)} TND`, icon: BarChart3, tint: 'bg-accent-500/10 text-accent-500' },
                    { label: 'فواتير قيد الانتظار', value: `${billingSummary.pendingInvoices.toFixed(2)} TND`, icon: AlertCircle, tint: 'bg-amber-100 text-amber-600' }
                  ].map(kpi => (
                    <div key={kpi.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5">
                      <div className={`inline-flex p-2.5 rounded-xl mb-3 ${kpi.tint}`}>
                        <kpi.icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <p className="text-xl font-black text-slate-900 tracking-tight">{kpi.value}</p>
                      <p className="text-[11px] font-bold text-slate-500 mt-1 uppercase tracking-wider">{kpi.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Chèques en attente — le revenu n'est compté qu'après encaissement */}
              {pendingCheques.length > 0 && (
                <div className="bg-white rounded-3xl border border-accent-500/20 p-6 shadow-sm shadow-slate-900/5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2.5">
                      <span className="p-2 bg-accent-500/10 rounded-xl"><Receipt aria-hidden="true" className="h-4 w-4 text-accent-500" /></span>
                      شيكات قيد الانتظار
                      <span className="text-[11px] font-bold text-slate-500 font-sans">{pendingCheques.length}</span>
                    </h3>
                    <p className="text-[11px] font-bold text-slate-500">
                      الشيكات المعلقة <span className="text-accent-500">لا تُحتسب ضمن الإيرادات</span> — تحصّلها لتُحتسب.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[640px] w-full text-sm text-start">
                      <thead className="text-[11px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="pb-3 px-3">Centre</th>
                          <th className="pb-3 px-3">N° Facture</th>
                          <th className="pb-3 px-3">المبلغ</th>
                          <th className="pb-3 px-3">رقم الشيك</th>
                          <th className="pb-3 px-3">تاريخ الشيك</th>
                          <th className="pb-3 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingCheques.map(inv => (
                          <tr key={inv.id} className="hover:bg-accent-500/5">
                            <td className="py-3 px-3 font-black text-slate-900 whitespace-nowrap">{inv.centerName}</td>
                            <td className="py-3 px-3 font-mono text-xs text-slate-500 whitespace-nowrap">{inv.invoiceNumber}</td>
                            <td className="py-3 px-3 font-black text-slate-900 whitespace-nowrap">{inv.amount.toFixed(2)} TND</td>
                            <td className="py-3 px-3 text-slate-600 text-xs font-bold">{inv.chequeNumber || '—'}</td>
                            <td className="py-3 px-3 text-slate-600 text-xs whitespace-nowrap">{inv.chequeDate ? new Date(inv.chequeDate).toLocaleDateString('ar-TN') : '—'}</td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={async () => {
                                    try {
                                      await updateInvoiceApi(inv.id, { status: 'paid' });
                                      toast.success(`تم تحصيل الشيك — الفاتورة ${inv.invoiceNumber} مدفوعة`);
                                      loadFinanceData();
                                    } catch (err) {
                                      toast.error(err instanceof Error ? err.message : 'خطأ');
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-1.5 bg-accent-500 text-white rounded-lg hover:bg-accent-700 transition cursor-pointer"
                                  aria-label="تحصيل الشيك"
                                >
                                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> تحصيل
                                </button>
                                <button onClick={() => handlePrintInvoice(inv)} className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer" title="طباعة الفاتورة" aria-label="طباعة الفاتورة">
                                  <Printer className="h-4 w-4 text-slate-500" aria-hidden="true" />
                                </button>
                                <button onClick={() => setEditInvoice(inv)} className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer" title="تعديل" aria-label="تعديل الفاتورة">
                                  <Edit className="h-4 w-4 text-slate-500" aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Factures — groupées par centre */}
              <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm shadow-slate-900/5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2.5">
                    <span className="p-2 bg-accent-500/10 rounded-xl"><Receipt aria-hidden="true" className="h-4 w-4 text-accent-500" /></span>
                    Factures
                    <span className="text-[11px] font-bold text-slate-500 font-sans">${arPlural(invoiceGroups.length, 'مركز', 'مركزان', 'مراكز', 'مركزًا')} · {filteredInvoices.length} facture{filteredInvoices.length > 1 ? 's' : ''}</span>
                  </h3>

                  {/* Filters — centre + statut */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <input
                        value={invoiceSearch}
                        onChange={e => setInvoiceSearch(e.target.value)}
                        placeholder="تصفية باسم المركز…"
                        className="ps-9 pe-3 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:border-accent-500 focus:ring-0 outline-none transition w-48 sm:w-56"
                      />
                    </div>
                    <select
                      value={invoiceStatusFilter}
                      onChange={e => setInvoiceStatusFilter(e.target.value as 'all' | CenterInvoice['status'])}
                      className="px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-white focus:border-accent-500 focus:ring-0 outline-none cursor-pointer"
                    >
                      <option value="all">كل الحالات</option>
                      <option value="pending">قيد الانتظار</option>
                      <option value="paid">مدفوعة</option>
                      <option value="overdue">متأخرة</option>
                      <option value="cancelled">ملغاة</option>
                    </select>
                    <select
                      value={invoiceMonthFilter}
                      onChange={e => setInvoiceMonthFilter(e.target.value)}
                      className="px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-white focus:border-accent-500 focus:ring-0 outline-none cursor-pointer capitalize"
                      aria-label="تصفية حسب شهر الفترة المفوترة"
                    >
                      <option value="all">كل الأشهر</option>
                      {invoiceMonths.map(key => (
                        <option key={key} value={key}>{monthLabel(key)}</option>
                      ))}
                    </select>
                    {(invoiceSearch || invoiceStatusFilter !== 'all' || invoiceMonthFilter !== 'all') && (
                      <button
                        onClick={() => { setInvoiceSearch(''); setInvoiceStatusFilter('all'); setInvoiceMonthFilter('all'); }}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition cursor-pointer"
                      >
                        <X className="h-4 w-4" aria-hidden="true" /> إعادة تعيين
                      </button>
                    )}
                  </div>
                </div>

                {invoices.length === 0 ? (
                  <p className="text-center py-12 text-slate-500 text-sm font-bold">لا توجد فواتير</p>
                ) : filteredInvoices.length === 0 ? (
                  <p className="text-center py-12 text-slate-500 text-sm font-bold">لا توجد فاتورة تطابق الفلاتر</p>
                ) : (
                  <div className="space-y-5">
                    {pagedInvoiceGroups.map(group => {
                      const paidTotal = group.invoices
                        .filter(inv => inv.status === 'paid')
                        .reduce((sum, inv) => sum + inv.amount, 0);
                      const outstandingTotal = group.invoices
                        .filter(inv => inv.status === 'pending' || inv.status === 'overdue')
                        .reduce((sum, inv) => sum + inv.amount, 0);
                      return (
                        <div key={group.centerId} className="rounded-2xl border border-slate-200/80 overflow-hidden">
                          {/* Centre header — cliquer pour replier / déplier */}
                          <button type="button"
                            onClick={() => setCollapsedGroupIds(prev => ({ ...prev, [group.centerId]: !prev[group.centerId] }))}
                            className="w-full flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 transition text-start cursor-pointer border-b border-slate-200">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform flex-shrink-0 ${collapsedGroupIds[group.centerId] ? '-rotate-90' : ''}`} aria-hidden="true" />
                              <span className="h-8 w-8 rounded-lg bg-accent-500 text-white flex items-center justify-center text-[11px] font-black flex-shrink-0">
                                {group.centerName.split(' ').map((word: string) => word[0]).join('').slice(0, 2).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-black text-slate-900 truncate">{group.centerName}</p>
                                <p className="text-[11px] font-semibold text-slate-500">
                                  {group.invoices.length} facture{group.invoices.length > 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {outstandingTotal > 0 && (
                                <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                  متبقي للتحصيل: {outstandingTotal.toFixed(2)} دينار
                                </span>
                              )}
                              {paidTotal > 0 && (
                                <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-accent-500/[0.06] text-accent-700 border border-accent-500/20">
                                  مدفوع: {paidTotal.toFixed(2)} دينار
                                </span>
                              )}
                            </div>
                          </button>
                          <div className={`overflow-x-auto${collapsedGroupIds[group.centerId] ? ' hidden' : ''}`}>
                            <table className="min-w-[640px] w-full text-sm text-start">
                              <thead className="text-[11px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200 bg-white">
                                <tr>
                                  <th className="py-2.5 px-3">N° Facture</th>
                                  <th className="py-2.5 px-3">الفترة</th>
                                  <th className="py-2.5 px-3">المبلغ</th>
                                  <th className="py-2.5 px-3">Paiement</th>
                                  <th className="py-2.5 px-3">الحالة</th>
                                  <th className="py-2.5 px-3">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {group.invoices.map(inv => {
                                  const meta = invoiceStatusMeta(inv);
                                  return (
                                    <tr key={inv.id} className="hover:bg-slate-50/70">
                                      <td className="py-3 px-3 font-mono text-xs text-slate-500 whitespace-nowrap">{inv.invoiceNumber}</td>
                                      <td className="py-3 px-3 text-slate-600 text-xs whitespace-nowrap">
                                        {new Date(inv.periodStart).toLocaleDateString('ar-TN')} – {new Date(inv.periodEnd).toLocaleDateString('ar-TN')}
                                      </td>
                                      <td className="py-3 px-3 font-black text-slate-900 whitespace-nowrap">{inv.amount.toFixed(2)} TND</td>
                                      <td className="py-3 px-3 text-slate-600 text-xs font-semibold whitespace-nowrap">{paymentMethodLabel(inv.paymentMethod)}</td>
                                      <td className="py-3 px-3 whitespace-nowrap">
                                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${toneClasses(meta.tone)}`}>{meta.label}</span>
                                      </td>
                                      <td className="py-3 px-3 whitespace-nowrap">
                                        <div className="flex items-center gap-1">
                                          <button onClick={() => handlePrintInvoice(inv)}
                                            className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer" title="طباعة الفاتورة" aria-label="طباعة الفاتورة">
                                            <Printer className="h-4 w-4 text-slate-500" aria-hidden="true" />
                                          </button>
                                          <button onClick={() => setEditInvoice(inv)}
                                            className="p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer" title="تعديل" aria-label="تعديل الفاتورة">
                                            <Edit className="h-4 w-4 text-slate-500" aria-hidden="true" />
                                          </button>
                                          <button onClick={async () => {
                                            try {
                                              await deleteInvoiceApi(inv.id);
                                              toast.success('تم حذف الفاتورة');
                                              loadFinanceData();
                                            } catch (err) {
                                              toast.error(err instanceof Error ? err.message : 'خطأ');
                                            }
                                          }}
                                            className="p-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer" title="حذف" aria-label="حذف الفاتورة">
                                            <Trash2 className="h-4 w-4 text-red-400" aria-hidden="true" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination — 10 centres par page */}
                {invoiceGroupsTotalPages > 1 && (
                  <div className="mt-5">
                    <Pagination
                      page={safeInvoiceGroupsPage}
                      totalPages={invoiceGroupsTotalPages}
                      total={invoiceGroups.length}
                      size={INVOICE_GROUPS_PAGE_SIZE}
                      onChange={p => setInvoiceCentersPage(p)}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      )
  );
}
