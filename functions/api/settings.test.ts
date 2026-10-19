import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestPut } from './settings';

const CENTER = 'c1';

let sqlite: DatabaseSync;
let db: any;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE center_settings (
      center_id TEXT PRIMARY KEY, center_name TEXT NOT NULL, phone_number TEXT NOT NULL,
      location_city TEXT NOT NULL, currency TEXT NOT NULL, updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE center_service_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT, center_id TEXT NOT NULL, school_year TEXT NOT NULL,
      service_key TEXT NOT NULL, billing_period TEXT NOT NULL CHECK (billing_period IN ('month','unit','year')),
      valid_from TEXT NOT NULL, price REAL NOT NULL, traiteur_share REAL,
      UNIQUE (center_id, school_year, service_key, billing_period)
    ) STRICT;
    CREATE TABLE subjects (id TEXT PRIMARY KEY, center_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, UNIQUE (center_id, name)) STRICT;
    CREATE TABLE etablissements (id TEXT PRIMARY KEY, center_id TEXT NOT NULL, name TEXT NOT NULL, UNIQUE (center_id, name)) STRICT;
    CREATE TABLE center_meal_mode_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      center_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('external_traiteur','in_house_kitchen')),
      effective_from TEXT NOT NULL CHECK (effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      created_by TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE (center_id, effective_from)
    ) STRICT;
  `);
  db = {
    prepare(sql: string) {
      let args: any[] = [];
      const stmt = {
        bind(...values: any[]) { args = values; return stmt; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() { return sqlite.prepare(sql).run(...args); },
      };
      return stmt;
    },
    async batch(stmts: any[]) { for (const s of stmts) await s.run(); },
  };
});

afterEach(() => sqlite.close());

function ctx(body: unknown) {
  return {
    env: { DB: db },
    request: new Request('https://app.example/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    data: { session: { email: 'x@example.invalid', token: 't', centerId: CENTER, role: 'admin' } },
  } as any;
}

const baseSettings = {
  centerName: 'Centre Test',
  phoneNumber: '71234567',
  locationCity: 'Tunis',
  currency: 'TND',
  servicePrices: { '2026/2027': { 'lunch:month': 150, 'lunch:unit': 8 } },
};

describe('PUT /api/settings — mode cantine choisi par le centre', () => {
  it('enregistre in_house_kitchen dans center_meal_mode_history', async () => {
    const res = await onRequestPut(ctx({ ...baseSettings, mealOperatingMode: 'in_house_kitchen' }));
    expect(res.status).toBe(200);
    const rows = sqlite.prepare('SELECT mode FROM center_meal_mode_history WHERE center_id = ?').all(CENTER) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].mode).toBe('in_house_kitchen');
  });

  it('bascule vers external_traiteur et conserve un historique (dernière ligne = mode courant)', async () => {
    await onRequestPut(ctx({ ...baseSettings, mealOperatingMode: 'in_house_kitchen' }));
    // Simule un jour différent pour autoriser une nouvelle ligne d'historique.
    sqlite.prepare('UPDATE center_meal_mode_history SET effective_from = ?').run('2026-01-01');
    await onRequestPut(ctx({ ...baseSettings, mealOperatingMode: 'external_traiteur' }));
    const rows = sqlite.prepare('SELECT mode, effective_from FROM center_meal_mode_history ORDER BY created_at DESC, id DESC').all() as any[];
    expect(rows.length).toBe(2);
    expect(rows[0].mode).toBe('external_traiteur');
  });

  it('est idempotent : re-PUT du même mode ne crée pas de ligne', async () => {
    await onRequestPut(ctx({ ...baseSettings, mealOperatingMode: 'external_traiteur' }));
    await onRequestPut(ctx({ ...baseSettings, mealOperatingMode: 'external_traiteur' }));
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM center_meal_mode_history').get() as any).n).toBe(1);
  });

  it('ignore une valeur de mode invalide (pas d\'écriture)', async () => {
    const res = await onRequestPut(ctx({ ...baseSettings, mealOperatingMode: 'nope' }));
    expect(res.status).toBe(200);
    expect((sqlite.prepare('SELECT COUNT(*) AS n FROM center_meal_mode_history').get() as any).n).toBe(0);
  });

  it('conserve les tarifs lors du changement de mode', async () => {
    await onRequestPut(ctx({ ...baseSettings, mealOperatingMode: 'in_house_kitchen' }));
    const prices = sqlite.prepare('SELECT service_key, billing_period, price FROM center_service_prices ORDER BY service_key, billing_period').all() as any[];
    expect(prices).toHaveLength(2);
    expect(prices.find(p => p.service_key === 'lunch' && p.billing_period === 'month').price).toBe(150);
  });
});
