import React, { useState } from 'react';
import { Student, AcademicMonth } from '../types';
import { computeGouterMonthly, computeGouterMonthDetail } from '../utils/mealLogic';

interface GouterMonthlyTableProps {
  students: Student[];
  schoolYear: string;
}

const SERVICE_LABELS: Record<string, string> = {
  'gouter_matin': 'لمجة الصباح (اشتراك)',
  'gouter_apres_midi': 'لمجة المساء (اشتراك)'
};

/**
 * Feature 007 (remark B / FR-005–010): the Goûter counterpart of the
 * «إجمالي الوجبات المستهلكة في كل شهر» table — one clickable cell per
 * academic month, opening a month-detail panel grouped one expandable panel
 * per day, «à l'identique» of the Repas monthly table's interaction.
 * Dedicated exclusively to the Goûter («sans aucune donnée du Repas»):
 * every figure derives from computeGouterMonthly / computeGouterMonthDetail.
 * Drilldown state is internal and ephemeral (research R2) — no data fetching,
 * no writes of its own (FR-010).
 */
export default function GouterMonthlyTable({ students, schoolYear }: GouterMonthlyTableProps) {
  const grid = computeGouterMonthly(students, schoolYear);
  const grandTotal = grid.reduce((sum, cell) => sum + cell.total, 0);
  const [selectedMonth, setSelectedMonth] = useState<AcademicMonth | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const detail = selectedMonth ? computeGouterMonthDetail(students, selectedMonth, schoolYear) : [];

  const closeDetail = () => {
    setSelectedMonth(null);
    setExpandedDays(new Set());
  };

  return (
    <div data-testid="finance-gouter-monthly" className="bg-white rounded-3xl border border-slate-200/70 overflow-hidden shadow-lg shadow-slate-900/5">
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h3 className="font-extrabold text-slate-900 text-sm">إجمالي استهلاك اللمجة في كل شهر</h3>
          <p className="text-[11px] text-slate-500 mt-1">خدمة اللمجة فقط (صباح/مساء) — بدون أي بيانات من الوجبات. اضغط على شهر لعرض تفاصيله اليومية.</p>
        </div>
        <div className="bg-brand-600/10 border border-brand-600/20 rounded-2xl px-4 py-2 text-center">
          <span className="text-[10px] font-bold text-brand-700 block">الإجمالي الكلي</span>
          <span className="font-mono font-black text-brand-700 text-lg">{grandTotal}</span>
        </div>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {grid.map(cell => {
            const isActive = selectedMonth === cell.month;
            return (
              <button
                key={cell.month}
                type="button"
                data-testid={`gouter-monthly-${cell.month}`}
                onClick={() => { if (isActive) closeDetail(); else { setSelectedMonth(cell.month); setExpandedDays(new Set()); } }}
                className={`rounded-2xl border p-3 text-center transition cursor-pointer ${isActive ? 'bg-brand-600/10 border-brand-600/40 shadow-sm' : 'border-slate-200 bg-slate-50/60 hover:border-brand-600/30 hover:bg-brand-600/[0.06]'}`}
              >
                <p className="text-[10px] font-bold text-slate-500">{cell.month}</p>
                <p className="font-mono font-black text-slate-900 text-xl mt-1">{cell.total}</p>
                <p className="text-[10px] font-bold text-brand-700">🥐 {cell.matin} · 🍪 {cell.soir}</p>
              </button>
            );
          })}
        </div>

        {selectedMonth && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
              <h4 className="font-black text-sm text-slate-900">
                تفاصيل استهلاك اللمجة في شهر {selectedMonth}
              </h4>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-brand-600/10 text-brand-700 rounded-lg text-[10px] font-black">{detail.reduce((s, d) => s + d.rows.length, 0)} لمجة</span>
                <button
                  type="button"
                  onClick={closeDetail}
                  className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
            {detail.length === 0 ? (
              <div className="p-6 text-center text-slate-400 font-bold text-xs rounded-2xl border border-slate-200">لا يوجد استهلاك في هذا الشهر.</div>
            ) : (
              <div className="space-y-2">
                {detail.map(day => {
                  const isOpen = expandedDays.has(day.date);
                  const paidCount = day.rows.filter(r => r.paid).length;
                  return (
                    <div key={day.date} className="border border-slate-200 rounded-2xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(expandedDays);
                          if (next.has(day.date)) next.delete(day.date); else next.add(day.date);
                          setExpandedDays(next);
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition cursor-pointer text-right"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-[10px] font-bold transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                          <span className="text-xs font-black text-slate-800">{day.date}</span>
                          <span className="text-[10px] font-bold text-slate-400">({day.rows.length} لمجة)</span>
                        </div>
                        <span className="text-[10px] font-bold text-brand-600">{paidCount} مدفوعة</span>
                      </button>
                      {isOpen && (
                        <div className="border-t border-slate-200">
                          <div className="overflow-x-auto">
                            <table className="min-w-[560px] w-full text-right text-xs">
                              <thead className="bg-slate-100/60 text-slate-600 font-bold">
                                <tr>
                                  <th className="p-2.5">التلميذ</th>
                                  <th className="p-2.5">المستوى</th>
                                  <th className="p-2.5">النوع والتصنيف</th>
                                  <th className="p-2.5">الحالة</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {day.rows.map((row, i) => (
                                  <tr key={i} className="hover:bg-slate-50/80 transition">
                                    <td className="p-2.5 font-black text-slate-900">{row.studentName}</td>
                                    <td className="p-2.5 text-slate-500">{row.grade}</td>
                                    <td className="p-2.5">
                                      <span className="px-2 py-0.5 bg-brand-600/10 text-brand-700 rounded-lg text-[10px] font-bold">
                                        {row.type === 'subscription' ? SERVICE_LABELS[row.service] : `${row.service === 'gouter_matin' ? 'لمجة الصباح' : 'لمجة المساء'} (منفردة)`}
                                      </span>
                                    </td>
                                    <td className="p-2.5 font-bold">
                                      {row.paid ? <span className="text-brand-700">مدفوع</span> : <span className="text-red-600">غير مدفوع</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
