import React from 'react';
import { Student, CenterFeeSet, AcademicMonth, MealServiceType } from '../types';
import { computeGouterRows, gouterServicesForStudent } from '../utils/mealLogic';

interface GouterConsumptionTableProps {
  students: Student[];
  month: AcademicMonth;
  schoolYear: string;
  fees: CenterFeeSet | null;
  onPayUnit?: (st: Student, service: 'gouter_matin' | 'gouter_apres_midi') => void;
  /** Revision E (remark E5): when the host supplies the pointage date and a
   *  callback, each row gains a «تسجيل الوجبة» button that upserts the
   *  student's gouter services onto that date's pointage line. */
  date?: string;
  onMarkToday?: (st: Student, services: MealServiceType[]) => void;
}

/**
 * Revision D (remarks M2 + F2): the dedicated Goûter consumption table,
 * shared by MealsModule (beside the lunch consumption table) and
 * FinanceModule's Gestion-des-repas tab (under the lunch detail table).
 * Purely presentational: all rows derive from computeGouterRows; the only
 * interaction is the optional pay-unit callback owned by the host.
 */
export default function GouterConsumptionTable({
  students,
  month,
  schoolYear,
  fees,
  onPayUnit,
  date,
  onMarkToday
}: GouterConsumptionTableProps) {
  const rows = computeGouterRows(students, month, schoolYear, fees);
  const hasMarkColumn = Boolean(date && onMarkToday);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right text-xs">
        <thead className="bg-brand-600/5 text-slate-700 font-bold border-b border-brand-600/10">
          <tr>
            <th className="p-3">التلميذ</th>
            <th className="p-3 text-center">نوع اللمجة</th>
            <th className="p-3 text-center">حالة الدفع</th>
            <th className="p-3 text-center">🥐 استهلاك الصباح</th>
            <th className="p-3 text-center">🍪 استهلاك المساء</th>
            <th className="p-3 text-center">خلاص بالوحدة</th>
            {hasMarkColumn && <th className="p-3 text-center">تسجيل الوجبة</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={hasMarkColumn ? 7 : 6} className="p-8 text-center text-slate-400 font-bold">
                لا يوجد مشتركون في خدمة اللمجة.
              </td>
            </tr>
          ) : (
            rows.map(row => (
              <tr key={row.student.id} className="hover:bg-slate-50/80 transition">
                <td className="p-3 font-black text-slate-900">
                  {row.student.firstName} {row.student.lastName}
                  <span className="block text-[10px] text-slate-400 font-bold">{row.student.grade}</span>
                </td>
                <td className="p-3 text-center">{row.typeLabel}</td>
                <td className="p-3 text-center">
                  <span
                    className={`inline-block px-2.5 py-1 font-black text-[10px] rounded-md border ${
                      row.status === 'paid'
                        ? 'bg-brand-600/[0.06] text-brand-700 border-brand-600/20'
                        : row.status === 'advance'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-red-50 text-red-600 border-red-200'
                    }`}
                  >
                    {row.status === 'paid' ? 'مسدد' : row.status === 'advance' ? 'تسبيق' : 'غير مسدد'}
                  </span>
                </td>
                <td className="p-3 text-center font-mono font-bold" data-testid={`consumed-matin-${row.student.id}`}>
                  {row.consumedMatin}
                </td>
                <td className="p-3 text-center font-mono font-bold" data-testid={`consumed-soir-${row.student.id}`}>
                  {row.consumedSoir}
                </td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    {row.unpaidUnitMatin.length > 0 && onPayUnit && (
                      <button
                        type="button"
                        onClick={() => onPayUnit(row.student, 'gouter_matin')}
                        className="px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold text-[10px] cursor-pointer"
                        title="خلاص لمجة الصباح"
                      >
                        خلاص الصباح ({fees?.fraisGouterMatinUnitaire ?? 0} د.ت)
                      </button>
                    )}
                    {row.unpaidUnitSoir.length > 0 && onPayUnit && (
                      <button
                        type="button"
                        onClick={() => onPayUnit(row.student, 'gouter_apres_midi')}
                        className="px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold text-[10px] cursor-pointer"
                        title="خلاص لمجة المساء"
                      >
                        خلاص المساء ({fees?.fraisGouterSoirUnitaire ?? 0} د.ت)
                      </button>
                    )}
                    {row.unpaidUnitMatin.length === 0 && row.unpaidUnitSoir.length === 0 && (
                      <span className="text-slate-300 text-[10px] font-bold">—</span>
                    )}
                  </div>
                </td>
                {hasMarkColumn && (() => {
                  const services = gouterServicesForStudent(row.student);
                  const allMarked = date
                    ? services.every(service =>
                        (row.student.mealAttendances || []).some(
                          a => a.date === date && (a.service || 'lunch') === service
                        )
                      )
                    : false;
                  return (
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        data-testid={`mark-today-${row.student.id}`}
                        disabled={allMarked}
                        onClick={() => date && onMarkToday?.(row.student, services)}
                        className={`px-2.5 py-1 rounded-lg font-bold text-[10px] ${
                          allMarked
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-default'
                            : 'bg-brand-600 hover:bg-brand-700 text-white cursor-pointer'
                        }`}
                        title={allMarked ? 'سجلت لمجته لهذا التاريخ' : 'تسجيل اللمجة في نقطة اليوم'}
                      >
                        تسجيل الوجبة
                      </button>
                    </td>
                  );
                })()}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
