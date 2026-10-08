import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getFeesForYear,
  getCurrentAcademicYear,
  getCurrentAcademicIndex,
  monthToArabic,
  getAppSubjects,
  isMathSubject,
  generateReceiptNumber,
  buildExternalGradeOptions,
  servicePriceForYear,
  withServicePrice,
  APP_SUBJECTS,
  type CenterSettings,
  type Student,
  type CenterFeeSet,
} from './types';

// ---------------------------------------------------------------------------
// getFeesForYear (vue legacy sur servicePrices — nouveau schéma)
// ---------------------------------------------------------------------------
describe('getFeesForYear', () => {
  const settings: CenterSettings = {
    centerName: 'Test',
    phoneNumber: '000',
    locationCity: 'Tunis',
    currency: 'TND',
    servicePrices: {
      '2025/2026': {
        'suivi:month': 300,
        'suivi:year': 150,
        'lunch:traiteur': 6,
      },
      DEFAULT: {
        'suivi:month': 250,
        'lunch:traiteur': 6,
      },
    },
  };

  it('returns year-specific fees when available', () => {
    const fees = getFeesForYear(settings, '2025/2026');
    expect(fees.fraisMensuelSuivi).toBe(300);
  });

  it('falls back to default fees for unknown year', () => {
    const fees = getFeesForYear(settings, '2099/2100');
    expect(fees.fraisMensuelSuivi).toBe(250);
  });

  it('always returns prixPlatTraiteur', () => {
    const fees = getFeesForYear(settings, '2025/2026');
    expect(fees.prixPlatTraiteur).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// servicePriceForYear / withServicePrice (center_service_prices model)
// ---------------------------------------------------------------------------
describe('servicePriceForYear', () => {
  it('reads a composite service:period key for the year', () => {
    const sp = { '2026/2027': { 'suivi:month': 42 } };
    expect(servicePriceForYear(sp, 'suivi', 'month', '2026/2027')).toBe(42);
  });

  it('falls back to DEFAULT year then to the fallback value', () => {
    const sp = { DEFAULT: { 'etude:year': 100 } };
    expect(servicePriceForYear(sp, 'etude', 'year', '2026/2027')).toBe(100);
    expect(servicePriceForYear(sp, 'lunch', 'unit', '2026/2027', 8)).toBe(8);
  });

  it('withServicePrice writes immutably', () => {
    const sp = withServicePrice({}, '2026/2027', 'suivi', 'month', 42);
    expect(servicePriceForYear(sp, 'suivi', 'month', '2026/2027')).toBe(42);
    expect(Object.keys(sp)).toEqual(['2026/2027']);
  });
});

// ---------------------------------------------------------------------------
// getCurrentAcademicYear
// ---------------------------------------------------------------------------
describe('getCurrentAcademicYear', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns YYYY/(YYYY+1) for months >= June (month index >= 6)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 15)); // Aug 15 2026 (month index 7)
    expect(getCurrentAcademicYear()).toBe('2026/2027');
  });

  it('returns (YYYY-1)/YYYY for months < June', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15)); // Mar 15 2026 (month index 2)
    expect(getCurrentAcademicYear()).toBe('2025/2026');
  });

  it('returns correct year for July boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 1)); // Jul 1 2026 (month index 6)
    expect(getCurrentAcademicYear()).toBe('2026/2027');
  });

  it('returns correct year for June boundary (last month of old year)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 30)); // Jun 30 2026 (month index 5)
    expect(getCurrentAcademicYear()).toBe('2025/2026');
  });
});

// ---------------------------------------------------------------------------
// getCurrentAcademicIndex
// ---------------------------------------------------------------------------
describe('getCurrentAcademicIndex', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const cases: [number, number][] = [
    [8, 0],   // Septembre → index 0
    [9, 1],   // Octobre → 1
    [10, 2],  // Novembre → 2
    [11, 3],  // Décembre → 3
    [0, 4],   // Janvier → 4
    [1, 5],   // Février → 5
    [2, 6],   // Mars → 6
    [3, 7],   // Avril → 7
    [4, 8],   // Mai → 8
    [5, -1],  // Juin → outside academic calendar
    [6, -1],  // Juillet → outside
    [7, -1],  // Août → outside
  ];

  it.each(cases.map(([month, expected]) => ({
    month,
    expected,
    label: `month ${month} → ${expected}`,
  })))('$label', ({ month, expected }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, month, 15));
    expect(getCurrentAcademicIndex()).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// monthToArabic
// ---------------------------------------------------------------------------
describe('monthToArabic', () => {
  it('translates known months', () => {
    expect(monthToArabic('Octobre')).toBe('أكتوبر');
    expect(monthToArabic('Septembre 2026')).toBe('سبتمبر 2026');
  });

  it('returns original string for unknown month', () => {
    expect(monthToArabic('FooBar')).toBe('FooBar');
  });

  it('handles compound strings with month embedded', () => {
    expect(monthToArabic('Mars')).toBe('مارس');
    expect(monthToArabic('Août')).toBe('أوت');
  });
});

// ---------------------------------------------------------------------------
// getAppSubjects
// ---------------------------------------------------------------------------
describe('getAppSubjects', () => {
  it('returns APP_SUBJECTS when no settings', () => {
    expect(getAppSubjects()).toEqual(APP_SUBJECTS);
  });

  it('returns APP_SUBJECTS when settings has empty subjects', () => {
    expect(getAppSubjects({} as CenterSettings)).toEqual(APP_SUBJECTS);
  });

  it('returns custom subjects from settings', () => {
    const settings = { subjects: ['CustomA', 'CustomB'] } as CenterSettings;
    expect(getAppSubjects(settings)).toEqual(['CustomA', 'CustomB']);
  });
});

// ---------------------------------------------------------------------------
// isMathSubject
// ---------------------------------------------------------------------------
describe('isMathSubject', () => {
  it('detects Arabic math label', () => {
    expect(isMathSubject('الرياضيات (Mathématiques)')).toBe(true);
  });

  it('detects standalone Mathématiques', () => {
    expect(isMathSubject('Mathématiques')).toBe(true);
  });

  it('detects case-insensitive match', () => {
    expect(isMathSubject('mathématiques')).toBe(true);
  });

  it('rejects non-math subjects', () => {
    expect(isMathSubject('Physique-Chimie')).toBe(false);
    expect(isMathSubject('SVT')).toBe(false);
  });

  it('handles partial contains', () => {
    expect(isMathSubject('someرياضياتcourse')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateReceiptNumber
// ---------------------------------------------------------------------------
describe('generateReceiptNumber', () => {
  const makeStudent = (payments: { receiptNumber: string }[]): Student =>
    ({ payments } as unknown as Student);

  it('returns REC-001 when no existing receipts', () => {
    expect(generateReceiptNumber([], 'REC-')).toBe('REC-001');
  });

  it('returns next sequential number', () => {
    const students = [
      makeStudent([{ receiptNumber: 'REC-001' }, { receiptNumber: 'REC-002' }]),
      makeStudent([{ receiptNumber: 'REC-003' }]),
    ];
    expect(generateReceiptNumber(students, 'REC-')).toBe('REC-004');
  });

  it('only counts receipts matching the prefix', () => {
    const students = [
      makeStudent([
        { receiptNumber: 'REC-001' },
        { receiptNumber: 'REM-005' },
      ]),
    ];
    expect(generateReceiptNumber(students, 'REC-')).toBe('REC-002');
    expect(generateReceiptNumber(students, 'REM-')).toBe('REM-006');
  });

  it('ignores receipts with different prefix but similar pattern', () => {
    const students = [makeStudent([{ receiptNumber: 'REC-LIB-010' }])];
    // REC- should NOT be affected by REC-LIB-
    expect(generateReceiptNumber(students, 'REC-')).toBe('REC-001');
  });

  it('handles students with no payments', () => {
    const students = [makeStudent([]), makeStudent(undefined as any)];
    expect(generateReceiptNumber(students, 'REC-')).toBe('REC-001');
  });

  it('finds max across multiple students', () => {
    const students = [
      makeStudent([{ receiptNumber: 'REC-005' }]),
      makeStudent([{ receiptNumber: 'REC-001' }, { receiptNumber: 'REC-010' }]),
    ];
    expect(generateReceiptNumber(students, 'REC-')).toBe('REC-011');
  });
});

// ---------------------------------------------------------------------------
// buildExternalGradeOptions
// ---------------------------------------------------------------------------
describe('buildExternalGradeOptions', () => {
  it('returns all grade levels', () => {
    const options = buildExternalGradeOptions();
    expect(options.length).toBe(13);
  });

  it('strips " Année" from labels and shows them bilingual', () => {
    const options = buildExternalGradeOptions();
    const labels = options.map(o => o.label);
    expect(labels).not.toContain('Lycée 1ère Année');
    expect(labels).not.toContain('Lycée 1ère');
    expect(labels).toContain('السنة الأولى ثانوي (Lycée 1ère)');
    expect(labels).toContain('السنة الأولى ابتدائي (Primaire 1ère)');
  });

  it('preserves values as-is', () => {
    const options = buildExternalGradeOptions();
    const values = options.map(o => o.value);
    expect(values).toContain('Lycée 1ère Année');
  });
});

describe('Decimal fee parsing — revision D, remark S1', () => {
  it('accepts comma decimals and normalizes them to numbers', async () => {
    const { parseDecimalFee } = await import('./types');
    expect(parseDecimalFee('2,5')).toBe(2.5);
    expect(parseDecimalFee('0,75')).toBe(0.75);
    expect(parseDecimalFee('2')).toBe(2);
    expect(parseDecimalFee('')).toBe(0);
  });

  it('keeps the leading-zero cleanup and tolerates dot decimals', async () => {
    const { parseDecimalFee } = await import('./types');
    expect(parseDecimalFee('02,5')).toBe(2.5);
    expect(parseDecimalFee('2.5')).toBe(2.5);
    expect(parseDecimalFee('abc')).toBe(0);
  });

  it('stores decimal service prices without rounding (nouveau schéma)', async () => {
    const { withServicePrice, servicePriceForYear } = await import('./types');
    let sp = withServicePrice({}, '2026/2027', 'gouter_matin', 'month', 2.5);
    sp = withServicePrice(sp, '2026/2027', 'gouter_apres_midi', 'unit', 0.75);
    expect(servicePriceForYear(sp, 'gouter_matin', 'month', '2026/2027')).toBe(2.5);
    expect(servicePriceForYear(sp, 'gouter_apres_midi', 'unit', '2026/2027')).toBe(0.75);
  });
});
