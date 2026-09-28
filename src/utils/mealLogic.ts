import { Student, MealPlanDay, CenterFeeSet, AcademicMonth, MealAttendance, ACADEMIC_MONTHS, MealServiceType } from '../types';

/**
 * Revision D (remarques-module-repas-gouter.md) — single-definition pure meal
 * logic, extracted from MealsModule so the Goûter consumption table, the
 * unit-meal modal and the Finance host share one implementation (FR-015).
 * All functions here are pure: fees/schoolYear come in as parameters.
 *
 * Revision E (remarques-onglets-repas-gouter.md) adds the month prefix map
 * (remark 3.2), the service-scoped pointage upsert (remark 3, E5), the
 * Goûter-only monthly aggregation (remark 3.3) and the per-student gouter
 * service list behind the mark-today button.
 */

// — Remark 3.2: one month→`YYYY-MM` map for every consumption scoping. —
const MONTH_NUMBER: Record<AcademicMonth, number> = {
  'Septembre': 9, 'Octobre': 10, 'Novembre': 11, 'Décembre': 12,
  'Janvier': 1, 'Février': 2, 'Mars': 3, 'Avril': 4, 'Mai': 5
};

export function academicMonthPrefix(month: AcademicMonth, schoolYear: string): string {
  const [startYear, endYear] = schoolYear.split('/');
  const num = MONTH_NUMBER[month] ?? 9;
  const year = num >= 9 ? startYear : endYear;
  return `${year}-${String(num).padStart(2, '0')}`;
}

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
  // Feature 008 (FR-007/FR-009): refund-shaped records — the refund writers
  // emit month-labelled records with negative amountPaid — must not drag the
  // settled sum below the required threshold. Net them out of what was paid
  // (a refund deducts from what was settled; it is not money never paid), so
  // a settled month with a refund record still reads paid and 'advance'
  // semantics are preserved. Discounts unchanged.
  const paidAmount = payments.filter(p => !p.refund).reduce((sum, p) => sum + p.amountPaid, 0);
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
      // Remark 3.2 (revision E): the consumption counts and unpaid-unit lists
      // are scoped to the selected academic month — the month prop must not
      // only drive the payment status. (Pre-revision-E these were lifetime
      // totals; the revision-D fixtures only ever used a single month.)
      const prefix = academicMonthPrefix(month, schoolYear);
      const attendances = (st.mealAttendances || []).filter(a => a.date.startsWith(prefix));
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

// — Remark 3.2/3.3 (revision E): the Goûter-only monthly consumption grid.
// One cell per academic month, over gouter_* attendances only — «sans aucune
// donnée du Repas». —
export interface GouterMonthlyCell {
  month: AcademicMonth;
  matin: number;
  soir: number;
  total: number;
}

export function computeGouterMonthly(students: Student[], schoolYear: string): GouterMonthlyCell[] {
  return ACADEMIC_MONTHS.map(month => {
    const prefix = academicMonthPrefix(month, schoolYear);
    let matin = 0;
    let soir = 0;
    for (const st of students) {
      for (const a of st.mealAttendances || []) {
        if (!a.date.startsWith(prefix)) continue;
        if (isLunchAttendance(a)) continue;
        if (a.service === 'gouter_matin') matin += 1;
        else if (a.service === 'gouter_apres_midi') soir += 1;
      }
    }
    return { month, matin, soir, total: matin + soir };
  });
}

// — Feature 007 (US3): the single lunch predicate every Repas-side
// aggregation filters through — attendances without an explicit service are
// legacy lunch rows. —
export function isLunchAttendance(a: MealAttendance): boolean {
  return !a.service || a.service === 'lunch';
}

// — Feature 007 (US2): the Goûter month detail behind the monthly grid's
// day drilldown — the gouter attendances of one academic month, grouped by
// date ascending. Lunch rows are excluded at the source (never rendered).
// Pure and presentational-free (FR-015): the component maps service
// discriminators to labels. —
export interface GouterMonthDetailRow {
  date: string;
  studentName: string;
  grade: string;
  service: MealServiceType;
  type: 'subscription' | 'unit';
  paid: boolean;
}

export interface GouterMonthDayGroup {
  date: string;
  rows: GouterMonthDetailRow[];
}

export function computeGouterMonthDetail(
  students: Student[],
  month: AcademicMonth,
  schoolYear: string
): GouterMonthDayGroup[] {
  const prefix = academicMonthPrefix(month, schoolYear);
  const byDate = new Map<string, GouterMonthDetailRow[]>();
  for (const st of students) {
    for (const a of st.mealAttendances || []) {
      if (!a.date.startsWith(prefix)) continue;
      if (isLunchAttendance(a)) continue;
      const service = a.service;
      if (service !== 'gouter_matin' && service !== 'gouter_apres_midi') continue;
      const row: GouterMonthDetailRow = {
        date: a.date,
        studentName: `${st.firstName} ${st.lastName}`,
        grade: st.grade,
        service,
        type: a.type,
        paid: !!a.paid
      };
      const rows = byDate.get(a.date);
      if (rows) rows.push(row);
      else byDate.set(a.date, [row]);
    }
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({ date, rows }));
}

// — Remark 3 (E5): the goûter services a student is subscribed to, in the
// order the mark-today button requests them. —
export function gouterServicesForStudent(st: Student): MealServiceType[] {
  const enrolled = (st.enrolledServices || {}) as {
    gouterMatin?: boolean;
    gouterSoir?: boolean;
    gouterBoth?: boolean;
  };
  const services: MealServiceType[] = [];
  if (enrolled.gouterMatin === true || enrolled.gouterBoth === true) services.push('gouter_matin');
  if (enrolled.gouterSoir === true || enrolled.gouterBoth === true) services.push('gouter_apres_midi');
  return services;
}

// — Remark 3 (E5): service-scoped upsert for the Goûter «تسجيل الوجبة»
// button. Creates gouter-only rows for a student absent from the pointage,
// or appends the missing gouter services to an existing line (e.g. one
// carrying only Repas) without touching or duplicating any existing row —
// the date-only getAttendance guard would wrongly block this case. —
export interface EnsureGouterOptions {
  month: AcademicMonth;
  schoolYear: string;
  fees: CenterFeeSet | null;
  traiteurPrice?: number;
}

export function ensureGouterAttendanceForDate(
  st: Student,
  date: string,
  services: MealServiceType[],
  opts?: EnsureGouterOptions
): Student {
  const existing = st.mealAttendances || [];
  const missing = services.filter(service =>
    !existing.some(a => a.date === date && (a.service || 'lunch') === service)
  );
  if (missing.length === 0) return st;
  const snapshotTraiteurPrice = opts?.traiteurPrice ?? 0;
  let type: 'subscription' | 'unit' = 'unit';
  let paid = false;
  if (opts?.month) {
    // Feature 008 follow-up: when the month is settled, the marked meal is a
    // covered subscription meal — write paid=true so it never renders as an
    // unpaid meal (the pre-fix rows read type='subscription', paid=false).
    paid = getGouterStatusFor(st, opts.month, opts.schoolYear, opts.fees ?? null).status === 'paid';
    type = paid ? 'subscription' : 'unit';
  }
  return {
    ...st,
    mealAttendances: [
      ...existing,
      ...missing.map(service => ({
        date,
        service,
        type,
        paid,
        ...(snapshotTraiteurPrice !== 0 ? { traiteurPrice: snapshotTraiteurPrice } : {})
      }))
    ]
  };
}
