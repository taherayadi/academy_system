import React from 'react';
import { Student } from '../types';
import { computeGouterMonthly } from '../utils/mealLogic';

interface GouterMonthlyTableProps {
  students: Student[];
  schoolYear: string;
}

/**
 * Revision E (remark 3.3): the Goûter counterpart of the «إجمالي الوجبات
 * المستهلكة في كل شهر» table — one cell per academic month, dedicated
 * exclusively to the Goûter service, «sans aucune donnée du Repas».
 * Purely presentational: every figure derives from computeGouterMonthly;
 * no data fetching and no writes of its own (FR-010).
 */
export default function GouterMonthlyTable({ students, schoolYear }: GouterMonthlyTableProps) {
  const grid = computeGouterMonthly(students, schoolYear);
  const grandTotal = grid.reduce((sum, cell) => sum + cell.total, 0);

  return (
    <div data-testid="finance-gouter-monthly">
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h3 className="font-extrabold text-slate-900 text-sm">إجمالي استهلاك اللمجة في كل شهر</h3>
          <p className="text-[11px] text-slate-500 mt-1">خدمة اللمجة فقط (صباح/مساء) — بدون أي بيانات من الوجبات.</p>
        </div>
        <div className="bg-brand-600/10 border border-brand-600/20 rounded-2xl px-4 py-2 text-center">
          <span className="text-[10px] font-bold text-brand-700 block">الإجمالي الكلي</span>
          <span className="font-mono font-black text-brand-700 text-lg">{grandTotal}</span>
        </div>
      </div>
      <div className="p-5">
        {grandTotal === 0 ? (
          <div className="p-6 text-center text-slate-400 font-bold text-xs rounded-2xl border border-slate-200">
            لا يوجد استهلاك مسجل لخدمة اللمجة.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {grid.map(cell => (
              <div
                key={cell.month}
                data-testid={`gouter-monthly-${cell.month}`}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 text-center"
              >
                <p className="text-[10px] font-bold text-slate-500">{cell.month}</p>
                <p className="font-mono font-black text-slate-900 text-xl mt-1">{cell.total}</p>
                <p className="text-[10px] font-bold text-brand-700">
                  🥐 {cell.matin} · 🍪 {cell.soir}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
