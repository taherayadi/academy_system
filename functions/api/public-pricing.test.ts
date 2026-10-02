import { describe, expect, it, vi } from 'vitest';
import { onRequestGet } from './public-pricing';

/** Minimal D1 stub — prepared statements return rows from the map by table. */
function makeDb(tables: Record<string, any[]>) {
  const rowsFor = (sql: string) => {
    if (sql.includes('FROM module_prices')) return tables.module_prices || [];
    if (sql.includes('FROM modules')) return tables.modules || [];
    if (sql.includes('FROM center_types')) return tables.center_types || [];
    if (sql.includes('FROM center_type_modules')) return tables.center_type_modules || [];
    if (sql.includes('ORDER BY school_year DESC')) return [];
    return [];
  };
  return {
    prepare(sql: string) {
      return {
        bind: () => ({
          all: async () => ({ results: rowsFor(sql) }),
          first: async () => (rowsFor(sql) as any[])[0] || null,
        }),
        all: async () => ({ results: rowsFor(sql) }),
        first: async () => (rowsFor(sql) as any[])[0] || null,
      };
    },
  } as any;
}

function context(db: any, year?: string) {
  const url = 'https://app.example/api/public-pricing' + (year ? `?year=${year}` : '');
  return { request: new Request(url), env: { DB: db }, params: {} } as any;
}

const MODULES = [
  { key: 'scolaire', label: 'Scolaire', label_ar: 'الدراسة', icon: 'GraduationCap', description: 'd1', isBasic: 1, isUnbilled: 0, isHidden: 0 },
  { key: 'etude', label: 'Étude', label_ar: 'الدراسة', icon: 'BookOpen', description: 'd2', isBasic: 0, isUnbilled: 0, isHidden: 0 },
  { key: 'bibliotheque', label: 'Bibliothèque', label_ar: 'المكتبة', icon: '', description: '', isBasic: 0, isUnbilled: 0, isHidden: 1 },
];

const TYPES = [
  { key: 'garderie', label: 'Garderie', label_ar: 'حراسة أطفال', hint: 'h1', hint_ar: 'أ1' },
  { key: 'creche', label: 'Crèche', label_ar: 'حضانة', hint: 'h2', hint_ar: 'أ2' },
  { key: 'other', label: 'Autre', label_ar: 'أخرى', hint: '', hint_ar: '' },
];

const COMPAT = [
  { center_type: 'garderie', module_key: 'scolaire' },
  { center_type: 'garderie', module_key: 'etude' },
  { center_type: 'creche', module_key: 'scolaire' },
  { center_type: 'garderie', module_key: 'bibliotheque' },
];

describe('GET /api/public-pricing — DB-backed catalog', () => {
  it('serves modules, center types, compatibility and prices from the DB', async () => {
    const db = makeDb({
      modules: MODULES,
      center_types: TYPES,
      center_type_modules: COMPAT,
      module_prices: [
        { school_year: '2026/2027', module_key: 'scolaire', price: 30 },
        { school_year: '2026/2027', module_key: 'etude', price: 20 },
      ],
    });
    const res = await onRequestGet(context(db));
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.schoolYear).toBe('2026/2027');
    expect(body.prices).toEqual([{ module_key: 'scolaire', price: 30 }, { module_key: 'etude', price: 20 }]);
    expect(body.modules.map((m: any) => m.key)).toEqual(['scolaire', 'etude', 'bibliotheque']);
    expect(body.modules[0]).toMatchObject({ isBasic: true, isUnbilled: false, isHidden: false, icon: 'GraduationCap', labelAr: 'الدراسة' });
    // « other » serves no module → not offered as a public center type
    expect(body.centerTypes.map((t: any) => t.key)).toEqual(['garderie', 'creche']);
    expect(body.centerTypes[0]).toMatchObject({ hint: 'h1', hintAr: 'أ1' });
    expect(body.moduleCenterTypes).toEqual({
      scolaire: ['garderie', 'creche'],
      etude: ['garderie'],
      bibliotheque: ['garderie'],
    });
  });

  it('keeps the bundled module at price 0', async () => {
    const db = makeDb({
      modules: MODULES,
      center_types: TYPES,
      center_type_modules: COMPAT,
      module_prices: [{ school_year: '2026/2027', module_key: 'scolaire', price: 30 }, { school_year: '2026/2027', module_key: 'studentTimeSheets', price: 5 }],
    });
    const res = await onRequestGet(context(db));
    const body: any = await res.json();
    const bundled = body.prices.find((p: any) => p.module_key === 'studentTimeSheets');
    expect(bundled.price).toBe(0);
  });

  it('returns 500 with a French error when the DB fails', async () => {
    const db = { prepare: () => { throw new Error('boom'); } };
    const res = await onRequestGet(context(db));
    expect(res.status).toBe(500);
    const body: any = await res.json();
    expect(body.error).toBe('Erreur chargement des tarifs publics.');
  });
});
