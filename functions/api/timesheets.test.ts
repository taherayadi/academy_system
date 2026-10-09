import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPut } from './timesheets';

// Régression : les pointages doublons (staff + date + créneau) ne devono
// jamais créer plusieurs lignes. writeTimesheets déduplique côté serveur,
// et le PUT remplace tout le domaine par un jeu dédupliqué.

const CENTER = 'c1';

let sqlite: DatabaseSync;
let db: any;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE timesheets (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      date TEXT NOT NULL,
      slot_time TEXT,
      status TEXT NOT NULL,
      leave_reason TEXT,
      leave_status TEXT,
      notes TEXT,
      hours_worked REAL,
      extra_hours REAL
    ) STRICT;
  `);
  db = {
    prepare(sql: string) {
      let args: any[] = [];
      const stmt = {
        bind(...values: any[]) { args = values; return stmt; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() {
          const r = sqlite.prepare(sql).run(...args);
          return { meta: { changes: Number(r.changes), last_row_id: r.lastInsertRowid }, success: true };
        },
      };
      return stmt;
    },
    async batch(stmts: any[]) {
      for (const s of stmts) await s.run();
    },
  };
});

afterEach(() => sqlite.close());

function ctx(method: string, body?: unknown) {
  return {
    env: { DB: db },
    request: new Request('https://app.example/api/timesheets', {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
    data: { session: { email: 'x@example.invalid', token: 't', centerId: CENTER, role: 'admin' } },
  } as any;
}

describe('/api/timesheets — upsert par (staff, date, créneau)', () => {
  it('PUT déduplique les doublons staff+date+slot_time et garde la dernière occurrence', async () => {
    const entries = [
      { id: 'a', staffId: 't1', date: '2026-10-09', slotTime: '16:00 - 18:00', status: 'present' },
      { id: 'b', staffId: 't1', date: '2026-10-09', slotTime: '16:00 - 18:00', status: 'absent' },
      { id: 'c', staffId: 't1', date: '2026-10-09', slotTime: '08:00 - 10:00', status: 'present' },
      { id: 'd', staffId: 't2', date: '2026-10-09', slotTime: '16:00 - 18:00', status: 'present' },
    ];

    const res = await onRequestPut(ctx('PUT', entries));
    expect(res.status).toBe(200);

    const rows = sqlite.prepare('SELECT * FROM timesheets ORDER BY id').all() as any[];
    expect(rows.length).toBe(3);
    const dup = rows.find(r => r.staff_id === 't1' && r.date === '2026-10-09' && r.slot_time === '16:00 - 18:00');
    expect(dup).toBeTruthy();
    expect(dup.status).toBe('absent'); // dernière occurrence gagnante
  });

  it('PUT répété avec les mêmes données ne duplique pas les lignes', async () => {
    const entries = [
      { id: 'x1', staffId: 't1', date: '2026-10-09', slotTime: '16:00 - 18:00', status: 'present' },
      { id: 'x2', staffId: 't2', date: '2026-10-09', status: 'present' }, // journées sans créneau
      { id: 'x3', staffId: 't2', date: '2026-10-09', status: 'retard' },
    ];
    await onRequestPut(ctx('PUT', entries));
    await onRequestPut(ctx('PUT', entries));

    const rows = sqlite.prepare('SELECT * FROM timesheets ORDER BY id').all() as any[];
    expect(rows.length).toBe(2); // t1 (créneau) + t2 (journée, dédoublonné)
    const dayRow = rows.find(r => r.staff_id === 't2');
    expect(dayRow.status).toBe('retard');
  });

  it('GET lit les données sauvegardées', async () => {
    await onRequestPut(ctx('PUT', [{ id: 'g1', staffId: 't1', date: '2026-10-09', slotTime: '16:00 - 18:00', status: 'present' }]));
    const res = await onRequestGet(ctx('GET'));
    expect(res.status).toBe(200);
    const body = (await (res as Response).json()) as any[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0]).toMatchObject({ staffId: 't1', date: '2026-10-09', slotTime: '16:00 - 18:00', status: 'present' });
  });
});
