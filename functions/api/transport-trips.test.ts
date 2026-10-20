import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRequestDelete, onRequestGet, onRequestPost, onRequestPut } from './transport-trips';

const CENTER = 'c1';
const OTHER = 'c2';
const STAFF = 'staff_1';
const OTHER_STAFF = 'staff_2';
const STUDENT_1 = 'st_1';
const STUDENT_2 = 'st_2';
const OTHER_STUDENT = 'st_other';

let sqlite: DatabaseSync;
let db: any;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE staff (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL
    ) STRICT;
    CREATE TABLE students (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL,
      UNIQUE (center_id, id)
    ) STRICT;
    CREATE TABLE transport_trips (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL,
      staff_id TEXT,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
      departure_time TEXT NOT NULL CHECK (departure_time GLOB '[0-2][0-9]:[0-5][0-9]'),
      trip_type TEXT NOT NULL CHECK (trip_type IN ('to_school','to_center')),
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE transport_trip_students (
      trip_id TEXT NOT NULL,
      center_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (trip_id, student_id)
    ) STRICT;
  `);
  sqlite.prepare('INSERT INTO staff (id, center_id) VALUES (?, ?)').run(STAFF, CENTER);
  sqlite.prepare('INSERT INTO staff (id, center_id) VALUES (?, ?)').run(OTHER_STAFF, OTHER);
  for (const id of [STUDENT_1, STUDENT_2]) {
    sqlite.prepare('INSERT INTO students (id, center_id) VALUES (?, ?)').run(id, CENTER);
  }
  sqlite.prepare('INSERT INTO students (id, center_id) VALUES (?, ?)').run(OTHER_STUDENT, OTHER);

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
    async batch(stmts: any[]) { for (const stmt of stmts) await stmt.run(); },
  };
});

afterEach(() => sqlite.close());

function ctx(method: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown, query = '') {
  return {
    env: { DB: db },
    request: new Request(`https://app.example/api/transport-trips${query}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    data: { session: { email: 'x@example.invalid', token: 't', centerId: CENTER, role: 'admin' } },
  } as any;
}

const tripRows = () => sqlite.prepare('SELECT * FROM transport_trips ORDER BY id').all() as any[];
const passengerRows = () => sqlite.prepare('SELECT * FROM transport_trip_students ORDER BY trip_id, position').all() as any[];

describe('/api/transport-trips', () => {
  it('POST crée un trajet manuel avec son staff_id et ses élèves', async () => {
    const res = await onRequestPost(ctx('POST', {
      staffId: STAFF,
      weekday: 1,
      departureTime: '07:30',
      tripType: 'to_school',
      notes: 'Départ centre',
      studentIds: [STUDENT_2, STUDENT_1],
    }));

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toMatch(/[0-9a-f-]{36}/);

    const trips = tripRows();
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({
      id: data.id,
      center_id: CENTER,
      staff_id: STAFF,
      weekday: 1,
      departure_time: '07:30',
      trip_type: 'to_school',
      notes: 'Départ centre',
    });
    expect(passengerRows()).toEqual([
      expect.objectContaining({ trip_id: data.id, center_id: CENTER, student_id: STUDENT_2, position: 0 }),
      expect.objectContaining({ trip_id: data.id, center_id: CENTER, student_id: STUDENT_1, position: 1 }),
    ]);
  });

  it('POST accepte les clés snake_case et un jour arabe', async () => {
    const res = await onRequestPost(ctx('POST', {
      staff_id: STAFF,
      day: 'الثلاثاء',
      departure_time: '16:15',
      trip_type: 'to_center',
      student_ids: [STUDENT_1],
    }));

    expect(res.status).toBe(200);
    expect(tripRows()[0]).toMatchObject({ weekday: 2, departure_time: '16:15', trip_type: 'to_center' });
  });

  it('POST refuse les élèves ou le staff d’un autre centre', async () => {
    const badStudent = await onRequestPost(ctx('POST', {
      staffId: STAFF, weekday: 1, departureTime: '07:30', tripType: 'to_school', studentIds: [OTHER_STUDENT],
    }));
    expect(badStudent.status).toBe(404);

    const badStaff = await onRequestPost(ctx('POST', {
      staffId: OTHER_STAFF, weekday: 1, departureTime: '07:30', tripType: 'to_school', studentIds: [STUDENT_1],
    }));
    expect(badStaff.status).toBe(404);
    expect(tripRows()).toHaveLength(0);
  });

  it('POST refuse un trajet sans élève ou avec des champs invalides', async () => {
    expect((await onRequestPost(ctx('POST', {
      staffId: STAFF, weekday: 1, departureTime: '07:30', tripType: 'to_school', studentIds: [],
    }))).status).toBe(400);
    expect((await onRequestPost(ctx('POST', {
      staffId: STAFF, weekday: 8, departureTime: '07:30', tripType: 'to_school', studentIds: [STUDENT_1],
    }))).status).toBe(400);
    expect((await onRequestPost(ctx('POST', {
      staffId: STAFF, weekday: 1, departureTime: '25:00', tripType: 'to_school', studentIds: [STUDENT_1],
    }))).status).toBe(400);
  });

  it('GET retourne les trajets du centre avec leurs studentIds et filtre par jour', async () => {
    await onRequestPost(ctx('POST', {
      staffId: STAFF, weekday: 1, departureTime: '07:30', tripType: 'to_school', studentIds: [STUDENT_1],
    }));
    await onRequestPost(ctx('POST', {
      staffId: STAFF, weekday: 2, departureTime: '16:00', tripType: 'to_center', studentIds: [STUDENT_2],
    }));
    sqlite.prepare(`
      INSERT INTO transport_trips (id, center_id, staff_id, weekday, departure_time, trip_type, notes, created_at, updated_at)
      VALUES ('other_trip', ?, ?, 1, '08:00', 'to_school', '', 1, 1)
    `).run(OTHER, OTHER_STAFF);

    const res = await onRequestGet(ctx('GET'));
    expect(res.status).toBe(200);
    const trips = await res.json() as any[];
    expect(trips).toHaveLength(2);
    expect(trips.map(t => t.studentIds).flat().sort()).toEqual([STUDENT_1, STUDENT_2]);

    const filtered = await onRequestGet(ctx('GET', undefined, '?weekday=2'));
    expect(filtered.status).toBe(200);
    const dayTrips = await filtered.json() as any[];
    expect(dayTrips).toHaveLength(1);
    expect(dayTrips[0]).toMatchObject({ weekday: 2, tripType: 'to_center', studentIds: [STUDENT_2] });
  });

  it('PUT met à jour le staff, le jour, le type et remplace les élèves', async () => {
    const created = await onRequestPost(ctx('POST', {
      staffId: STAFF, weekday: 1, departureTime: '07:30', tripType: 'to_school', studentIds: [STUDENT_1],
    }));
    const { id } = await created.json() as any;

    const res = await onRequestPut(ctx('PUT', {
      id,
      weekday: 3,
      departureTime: '12:45',
      tripType: 'to_center',
      studentIds: [STUDENT_2],
    }));

    expect(res.status).toBe(200);
    expect(tripRows()[0]).toMatchObject({ weekday: 3, departure_time: '12:45', trip_type: 'to_center' });
    expect(passengerRows()).toEqual([
      expect.objectContaining({ trip_id: id, student_id: STUDENT_2 }),
    ]);
  });

  it('PUT refuse un trajet d’un autre centre ou une mise à jour vide', async () => {
    expect((await onRequestPut(ctx('PUT', { id: 'missing', departureTime: '08:00' }))).status).toBe(404);

    const created = await onRequestPost(ctx('POST', {
      staffId: STAFF, weekday: 1, departureTime: '07:30', tripType: 'to_school', studentIds: [STUDENT_1],
    }));
    const { id } = await created.json() as any;
    expect((await onRequestPut(ctx('PUT', { id }))).status).toBe(400);
  });

  it('DELETE supprime le trajet et ses élèves', async () => {
    const created = await onRequestPost(ctx('POST', {
      staffId: STAFF, weekday: 1, departureTime: '07:30', tripType: 'to_school', studentIds: [STUDENT_1, STUDENT_2],
    }));
    const { id } = await created.json() as any;

    const res = await onRequestDelete(ctx('DELETE', undefined, `?id=${id}`));
    expect(res.status).toBe(200);
    expect(tripRows()).toHaveLength(0);
    expect(passengerRows()).toHaveLength(0);
  });

  it('DELETE est limité au centre de la session', async () => {
    sqlite.prepare(`
      INSERT INTO transport_trips (id, center_id, staff_id, weekday, departure_time, trip_type, notes, created_at, updated_at)
      VALUES ('other_trip', ?, ?, 1, '08:00', 'to_school', '', 1, 1)
    `).run(OTHER, OTHER_STAFF);

    const res = await onRequestDelete(ctx('DELETE', undefined, '?id=other_trip'));
    expect(res.status).toBe(404);
    expect(tripRows()).toHaveLength(1);
  });
});
