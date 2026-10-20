import { Env, json, readBody, getContextCenterId } from './_lib';

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

const TRIP_TYPES = ['to_school', 'to_center'] as const;
type TripType = (typeof TRIP_TYPES)[number];

const WEEKDAY_BY_DAY: Record<string, number> = {
  lundi: 1, monday: 1, 'الأثنين': 1, 'الاثنين': 1,
  mardi: 2, tuesday: 2, 'الثلاثاء': 2,
  mercredi: 3, wednesday: 3, 'الأربعاء': 3, 'الاربعاء': 3,
  jeudi: 4, thursday: 4, 'الخميس': 4,
  vendredi: 5, friday: 5, 'الجمعة': 5,
  samedi: 6, saturday: 6, 'السبت': 6,
  dimanche: 7, sunday: 7, 'الأحد': 7, 'الاحد': 7
};

function parseWeekday(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7) {
    return value;
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;
    if (/^[1-7]$/.test(raw)) return Number(raw);
    return WEEKDAY_BY_DAY[raw] ?? WEEKDAY_BY_DAY[raw.toLowerCase()] ?? null;
  }
  return null;
}

function validTime(value: string): boolean {
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

function validTripType(value: string): value is TripType {
  return (TRIP_TYPES as readonly string[]).includes(value);
}

function normalizeStudentIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.map(item => str(item).trim()).filter(Boolean);
  return Array.from(new Set(ids));
}

async function findUnknownStudents(DB: D1Database, centerId: string, studentIds: string[]): Promise<string[]> {
  if (studentIds.length === 0) return [];
  const placeholders = studentIds.map(() => '?').join(', ');
  const res = await DB
    .prepare(`SELECT id FROM students WHERE center_id = ? AND id IN (${placeholders})`)
    .bind(centerId, ...studentIds)
    .all();
  const found = new Set((res.results || []).map((row: any) => str(row.id)));
  return studentIds.filter(id => !found.has(id));
}

async function staffBelongsToCenter(DB: D1Database, centerId: string, staffId: string): Promise<boolean> {
  const row = await DB
    .prepare('SELECT 1 FROM staff WHERE id = ? AND center_id = ?')
    .bind(staffId, centerId)
    .first();
  return Boolean(row);
}

function readTripBody(body: any) {
  return {
    staffId: body.staffId !== undefined ? body.staffId : body.staff_id,
    weekday: body.weekday !== undefined ? body.weekday : body.day,
    departureTime: body.departureTime !== undefined ? body.departureTime : body.departure_time,
    tripType: body.tripType !== undefined ? body.tripType : body.trip_type,
    notes: body.notes,
    studentIds: body.studentIds !== undefined ? body.studentIds : body.student_ids
  };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const weekdayParam = url.searchParams.get('weekday') ?? url.searchParams.get('day');
    const staffId = url.searchParams.get('staffId') || '';

    let sql = `SELECT id, staff_id, weekday, departure_time, trip_type, notes, created_at, updated_at
               FROM transport_trips WHERE center_id = ?`;
    const binds: any[] = [centerId];

    if (weekdayParam != null && weekdayParam !== '') {
      const weekday = parseWeekday(weekdayParam);
      if (weekday == null) return json({ error: 'weekday غير صالح (1-7).' }, 400);
      sql += ' AND weekday = ?';
      binds.push(weekday);
    }
    if (staffId) {
      sql += ' AND staff_id = ?';
      binds.push(staffId);
    }
    sql += ' ORDER BY weekday ASC, departure_time ASC, created_at ASC';

    const [tripRes, studentRes] = await Promise.all([
      context.env.DB.prepare(sql).bind(...binds).all(),
      context.env.DB
        .prepare(
          `SELECT ts.trip_id, ts.student_id
           FROM transport_trip_students ts
           JOIN students s ON s.id = ts.student_id AND s.center_id = ts.center_id
           WHERE ts.center_id = ?
           ORDER BY ts.position ASC, ts.student_id ASC`
        )
        .bind(centerId)
        .all()
    ]);

    const studentsByTrip = new Map<string, string[]>();
    for (const row of (studentRes.results || []) as any[]) {
      const tripId = str(row.trip_id);
      const list = studentsByTrip.get(tripId) || [];
      list.push(str(row.student_id));
      studentsByTrip.set(tripId, list);
    }

    const trips = ((tripRes.results || []) as any[]).map(row => ({
      id: str(row.id),
      staffId: row.staff_id == null ? null : str(row.staff_id),
      weekday: Number(row.weekday),
      departureTime: str(row.departure_time),
      tripType: str(row.trip_type),
      notes: str(row.notes),
      studentIds: studentsByTrip.get(str(row.id)) || [],
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    }));

    return json(trips);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر تحميل رحلات النقل.' }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات غير صالحة.' }, 400);
    }

    const parsed = readTripBody(body);
    const id = str(body.id) || crypto.randomUUID();
    const staffIdRaw = parsed.staffId;
    const staffId = staffIdRaw == null || staffIdRaw === '' ? null : str(staffIdRaw);
    const weekday = parseWeekday(parsed.weekday);
    const departureTime = str(parsed.departureTime);
    const tripType = str(parsed.tripType);
    const notes = str(parsed.notes);
    const studentIds = normalizeStudentIds(parsed.studentIds);

    if (weekday == null) return json({ error: 'weekday مطلوب ويجب أن يكون بين 1 و 7.' }, 400);
    if (!validTime(departureTime)) return json({ error: 'departureTime غير صالح (HH:MM).' }, 400);
    if (!validTripType(tripType)) return json({ error: 'tripType غير صالح.' }, 400);
    if (studentIds == null || studentIds.length === 0) {
      return json({ error: 'يجب اختيار تلميذ واحد على الأقل.' }, 400);
    }

    if (staffId && !(await staffBelongsToCenter(context.env.DB, centerId, staffId))) {
      return json({ error: 'السائق غير موجود في هذا المركز.' }, 404);
    }
    const unknownStudents = await findUnknownStudents(context.env.DB, centerId, studentIds);
    if (unknownStudents.length > 0) {
      return json({ error: 'بعض التلاميذ غير موجودين في هذا المركز.' }, 404);
    }

    const now = Date.now();
    const stmts: D1PreparedStatement[] = [
      context.env.DB.prepare(
        `INSERT INTO transport_trips
           (id, center_id, staff_id, weekday, departure_time, trip_type, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, centerId, staffId, weekday, departureTime, tripType, notes, now, now),
      ...studentIds.map((studentId, position) =>
        context.env.DB.prepare(
          `INSERT INTO transport_trip_students (trip_id, center_id, student_id, position)
           VALUES (?, ?, ?, ?)`
        ).bind(id, centerId, studentId, position)
      )
    ];

    await context.env.DB.batch(stmts);
    return json({ ok: true, id });
  } catch (err: any) {
    console.error('Error:', err);
    const msg = err?.message || '';
    if (msg.includes('UNIQUE')) return json({ error: 'الرحلة موجودة مسبقاً.' }, 409);
    if (msg.includes('CHECK') || msg.includes('FOREIGN KEY')) return json({ error: 'بيانات الرحلة غير صالحة.' }, 400);
    return json({ error: 'تعذر إنشاء الرحلة.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'بيانات غير صالحة.' }, 400);
    }

    const id = str(body.id);
    if (!id) return json({ error: 'id مطلوب.' }, 400);

    const existing = await context.env.DB
      .prepare('SELECT id FROM transport_trips WHERE id = ? AND center_id = ?')
      .bind(id, centerId)
      .first();
    if (!existing) return json({ error: 'الرحلة غير موجودة في هذا المركز.' }, 404);

    const has = (camel: string, snake: string) => body[camel] !== undefined || body[snake] !== undefined;
    const sets: string[] = [];
    const binds: any[] = [];
    let studentIdsToWrite: string[] | null = null;

    if (has('staffId', 'staff_id')) {
      const raw = body.staffId !== undefined ? body.staffId : body.staff_id;
      const staffId = raw == null || raw === '' ? null : str(raw);
      if (staffId && !(await staffBelongsToCenter(context.env.DB, centerId, staffId))) {
        return json({ error: 'السائق غير موجود في هذا المركز.' }, 404);
      }
      sets.push('staff_id = ?');
      binds.push(staffId);
    }

    if (has('weekday', 'day')) {
      const weekday = parseWeekday(body.weekday !== undefined ? body.weekday : body.day);
      if (weekday == null) return json({ error: 'weekday غير صالح (1-7).' }, 400);
      sets.push('weekday = ?');
      binds.push(weekday);
    }

    if (has('departureTime', 'departure_time')) {
      const departureTime = str(body.departureTime !== undefined ? body.departureTime : body.departure_time);
      if (!validTime(departureTime)) return json({ error: 'departureTime غير صالح (HH:MM).' }, 400);
      sets.push('departure_time = ?');
      binds.push(departureTime);
    }

    if (has('tripType', 'trip_type')) {
      const tripType = str(body.tripType !== undefined ? body.tripType : body.trip_type);
      if (!validTripType(tripType)) return json({ error: 'tripType غير صالح.' }, 400);
      sets.push('trip_type = ?');
      binds.push(tripType);
    }

    if (body.notes !== undefined) {
      sets.push('notes = ?');
      binds.push(str(body.notes));
    }

    if (has('studentIds', 'student_ids')) {
      const normalized = normalizeStudentIds(body.studentIds !== undefined ? body.studentIds : body.student_ids);
      if (normalized == null || normalized.length === 0) {
        return json({ error: 'يجب اختيار تلميذ واحد على الأقل.' }, 400);
      }
      const unknownStudents = await findUnknownStudents(context.env.DB, centerId, normalized);
      if (unknownStudents.length > 0) {
        return json({ error: 'بعض التلاميذ غير موجودين في هذا المركز.' }, 404);
      }
      studentIdsToWrite = normalized;
    }

    if (sets.length === 0 && studentIdsToWrite == null) {
      return json({ error: 'لا توجد حقول للتحديث.' }, 400);
    }

    sets.push('updated_at = ?');
    binds.push(Date.now(), id, centerId);

    const stmts: D1PreparedStatement[] = [
      context.env.DB
        .prepare(`UPDATE transport_trips SET ${sets.join(', ')} WHERE id = ? AND center_id = ?`)
        .bind(...binds)
    ];

    if (studentIdsToWrite) {
      stmts.push(
        context.env.DB
          .prepare('DELETE FROM transport_trip_students WHERE trip_id = ? AND center_id = ?')
          .bind(id, centerId),
        ...studentIdsToWrite.map((studentId, position) =>
          context.env.DB.prepare(
            `INSERT INTO transport_trip_students (trip_id, center_id, student_id, position)
             VALUES (?, ?, ?, ?)`
          ).bind(id, centerId, studentId, position)
        )
      );
    }

    await context.env.DB.batch(stmts);
    return json({ ok: true });
  } catch (err: any) {
    console.error('Error:', err);
    const msg = err?.message || '';
    if (msg.includes('UNIQUE')) return json({ error: 'الرحلة موجودة مسبقاً.' }, 409);
    if (msg.includes('CHECK') || msg.includes('FOREIGN KEY')) return json({ error: 'بيانات الرحلة غير صالحة.' }, 400);
    return json({ error: 'تعذر تحديث الرحلة.' }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id') || '';
    if (!id) return json({ error: 'id مطلوب.' }, 400);

    const existing = await context.env.DB
      .prepare('SELECT id FROM transport_trips WHERE id = ? AND center_id = ?')
      .bind(id, centerId)
      .first();
    if (!existing) return json({ error: 'الرحلة غير موجودة في هذا المركز.' }, 404);

    await context.env.DB
      .prepare('DELETE FROM transport_trip_students WHERE trip_id = ? AND center_id = ?')
      .bind(id, centerId)
      .run();
    await context.env.DB
      .prepare('DELETE FROM transport_trips WHERE id = ? AND center_id = ?')
      .bind(id, centerId)
      .run();

    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حذف الرحلة.' }, 500);
  }
};
