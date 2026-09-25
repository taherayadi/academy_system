import { Student, MealPlanDay, CenterFeeSet, AcademicMonth, MealAttendance } from '../types';

/**
 * Revision D (remarques-module-repas-gouter.md) — single-definition pure meal
 * logic, extracted from MealsModule so the Goûter consumption table, the
 * unit-meal modal and the Finance host share one implementation (FR-015).
 * All functions here are pure: fees/schoolYear come in as parameters.
 */

// — Remark M1: the weekly meal program offers Saturday («السبت») —
export const WEEKDAYS: MealPlanDay['day'][] = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export const DAY_BY_INDEX: Record<number, MealPlanDay['day']> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi'
};

export const ARABIC_WEEKDAYS: Record<MealPlanDay['day'], string> = {
  'Lundi': 'الإثنين',
  'Mardi': 'الثلاثاء',
  'Mercredi': 'الأربعاء',
  'Jeudi': 'الخميس',
  'Vendredi': 'الجمعة',
  'Samedi': 'السبت'
};

// — Remark M3: the unit-meal modal enables exactly the services the
// subscription covers; students covered by nothing get all three at unit
// price (the modal's classic constituency, including refunded months). —
export interface GouterServiceEligibility {
  lunch: boolean;
  gouterMatin: boolean;
  gouterSoir: boolean;
  allAtUnitPrice: boolean;
}

export function eligibleServicesForStudent(
  st: Student,
  opts?: { refundedMonth?: boolean }
): GouterServiceEligibility {
  const enrolled = (st.enrolledServices || {}) as {
    gouterMatin?: boolean;
    gouterSoir?: boolean;
    gouterBoth?: boolean;
  };
  const lunch = st.mealSubscription?.active === true && !(opts?.refundedMonth ?? false);
  const gouterMatin = enrolled.gouterMatin === true || enrolled.gouterBoth === true;
  const gouterSoir = enrolled.gouterSoir === true || enrolled.gouterBoth === true;
  const allAtUnitPrice = !lunch && !gouterMatin && !gouterSoir;
  return {
    lunch: lunch || allAtUnitPrice,
    gouterMatin: gouterMatin || allAtUnitPrice,
    gouterSoir: gouterSoir || allAtUnitPrice,
    allAtUnitPrice
  };
}

// — Moved verbatim from MealsModule (fees now a parameter instead of the
// settings closure) so every consumer shares one implementation. —
export function getGouterStatusFor(
  st: Student,
  month: AcademicMonth,
  schoolYear: string,
  fees: CenterFeeSet | null
) {
  const isBoth = st.enrolledServices?.gouterBoth || (!!st.enrolledServices?.gouterMatin && !!st.enrolledServices?.gouterSoir);
  const isMatin = st.enrolledServices?.gouterMatin;
  const isSoir = st.enrolledServices?.gouterSoir;

  let total = 0;
  let typeLabel = 'غير محدد';
  if (isBoth) {
    total = fees?.fraisDeuxGoutersMensuel || ((fees?.fraisGouterMatinMensuel || 0) + (fees?.fraisGouterSoirMensuel || 0));
    typeLabel = 'اللمجتان معاً';
  } else if (isMatin) {
    total = fees?.fraisGouterMatinMensuel || 0;
    typeLabel = 'لمجة الصباح';
  } else if (isSoir) {
    total = fees?.fraisGouterSoirMensuel || 0;
    typeLabel = 'لمجة المساء';
  }
  if (total === 0) total = 30;

  const payments = (st.payments || []).filter(p => p.service === 'Goûter' && p.month === `${month} (${schoolYear})`);
  const paidAmount = payments.reduce((sum, p) => sum + p.amountPaid, 0);
  const discount = payments.reduce((max, p) => Math.max(max, p.discount || 0), 0);
  const effectiveRequired = Math.max(0, total - discount);
  return {
    status: paidAmount >= effectiveRequired && effectiveRequired > 0 ? ('paid' as const) : paidAmount > 0 ? ('advance' as const) : ('unpaid' as const),
    paidAmount,
    remaining: Math.max(0, effectiveRequired - paidAmount),
    total,
    discount,
    effectiveRequired,
    isBoth,
    isMatin,
    isSoir,
    typeLabel
  };
}

// — Remarks M2 + F2: the dedicated Goûter consumption rows. Flag-based
// inclusion (any gouter* flag), mirroring the Goûter grid; counts derive
// from mealAttendances' service discriminator; lunch attendances never
// appear here. —
export interface GouterConsumptionRow {
  student: Student;
  isBoth: boolean;
  isMatin: boolean;
  isSoir: boolean;
  typeLabel: string;
  status: 'paid' | 'advance' | 'unpaid';
  paidAmount: number;
  remaining: number;
  total: number;
  consumedMatin: number;
  consumedSoir: number;
  unpaidUnitMatin: MealAttendance[];
  unpaidUnitSoir: MealAttendance[];
}

export function computeGouterRows(
  students: Student[],
  month: AcademicMonth,
  schoolYear: string,
  fees: CenterFeeSet | null
): GouterConsumptionRow[] {
  return students
    .filter(st => st.enrolledServices?.gouterMatin === true || st.enrolledServices?.gouterSoir === true || st.enrolledServices?.gouterBoth === true)
    .map(st => {
      const statusInfo = getGouterStatusFor(st, month, schoolYear, fees);
      const attendances = st.mealAttendances || [];
      const consumedMatin = attendances.filter(a => (a.service || 'lunch') === 'gouter_matin').length;
      const consumedSoir = attendances.filter(a => a.service === 'gouter_apres_midi').length;
      const unpaidUnitMatin = attendances.filter(a => a.service === 'gouter_matin' && a.type === 'unit' && !a.paid);
      const unpaidUnitSoir = attendances.filter(a => a.service === 'gouter_apres_midi' && a.type === 'unit' && !a.paid);
      return {
        student: st,
        isBoth: statusInfo.isBoth,
        isMatin: statusInfo.isMatin,
        isSoir: statusInfo.isSoir,
        typeLabel: statusInfo.typeLabel,
        status: statusInfo.status,
        paidAmount: statusInfo.paidAmount,
        remaining: statusInfo.remaining,
        total: statusInfo.total,
        consumedMatin,
        consumedSoir,
        unpaidUnitMatin,
        unpaidUnitSoir
      };
    });
}
