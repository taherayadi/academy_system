import { Env, json, readBody, getContextCenterId } from './_lib';

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

function validDate(d: any): boolean {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function validSchoolYear(y: any): boolean {
  return typeof y === 'string' && /^\d{4}\/\d{4}$/.test(y);
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const studentId = url.searchParams.get('studentId') || undefined;
    const serviceKey = url.searchParams.get('serviceKey') || undefined;
    const schoolYear = url.searchParams.get('schoolYear') || undefined;
    let sql = 'SELECT * FROM student_service_enrollments WHERE center_id = ?';
    const binds: any[] = [centerId];
    if (studentId) { sql += ' AND student_id = ?'; binds.push(studentId); }
    if (serviceKey) { sql += ' AND service_key = ?'; binds.push(serviceKey); }
    if (schoolYear) { sql += ' AND school_year = ?'; binds.push(schoolYear); }
    sql += ' ORDER BY school_year DESC, service_key ASC, valid_from ASC';
    const res = await context.env.DB.prepare(sql).bind(...binds).all();
    return json(res.results || []);
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر قراءة تسجيلات الخدمات.' }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object') return json({ error: 'بيانات غير صالحة.' }, 400);

    const id = str(body.id) || crypto.randomUUID();
    const studentId = str(body.studentId ?? body.student_id);
    const serviceKey = str(body.serviceKey || body.service_key);
    const schoolYear = str(body.schoolYear || body.school_year);
    const billingMode = str(body.billingMode || body.billing_mode) || 'subscription';
    const monthlyPrice = body.monthlyPrice ?? body.monthly_price;
    const annualPrice = body.annualPrice ?? body.annual_price;
    const unitPrice = body.unitPrice ?? body.unit_price;
    const validFrom = str(body.validFrom || body.valid_from);
    const validTo = body.validTo ?? body.valid_to;

    if (!studentId) return json({ error: 'studentId مطلوب.' }, 400);
    if (!serviceKey) return json({ error: 'serviceKey مطلوب.' }, 400);
    if (!validSchoolYear(schoolYear)) return json({ error: 'schoolYear غير صالح (YYYY/YYYY).' }, 400);
    if (!['subscription', 'unit'].includes(billingMode)) return json({ error: 'billingMode غير صالح.' }, 400);
    if (!validDate(validFrom)) return json({ error: 'validFrom غير صالح (YYYY-MM-DD).' }, 400);
    if (validTo != null && validTo !== '' && (!validDate(validTo) || str(validTo) < validFrom)) {
      return json({ error: 'validTo غير صالح.' }, 400);
    }

    const exists = await context.env.DB.prepare('SELECT 1 FROM students WHERE id = ? AND center_id = ?')
      .bind(studentId, centerId).first();
    if (!exists) return json({ error: 'التلميذ غير موجود في هذا المركز.' }, 404);

    await context.env.DB.prepare(
      `INSERT INTO student_service_enrollments (id, center_id, student_id, service_key, school_year, billing_mode, monthly_price, annual_price, unit_price, valid_from, valid_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, centerId, studentId, serviceKey, schoolYear, billingMode,
      monthlyPrice == null || monthlyPrice === '' ? null : num(monthlyPrice),
      annualPrice == null || annualPrice === '' ? null : num(annualPrice),
      unitPrice == null || unitPrice === '' ? null : num(unitPrice),
      validFrom,
      validTo == null || validTo === '' ? null : str(validTo)
    ).run();

    return json({ ok: true, id });
  } catch (err: any) {
    console.error('Error:', err);
    const msg = err?.message || '';
    if (msg.includes('UNIQUE')) return json({ error: 'تسجيل موجود مسبقاً لهذا التلميذ والخدمة والسنة وبداية الصلاحية.' }, 409);
    if (msg.includes('FOREIGN KEY')) return json({ error: 'خدمة أو تلميذ غير صالح.' }, 400);
    return json({ error: 'تعذر إنشاء تسجيل الخدمة.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (!body || typeof body !== 'object') return json({ error: 'بيانات غير صالحة.' }, 400);
    const id = str(body.id);
    if (!id) return json({ error: 'id مطلوب.' }, 400);

    const sets: string[] = [];
    const binds: any[] = [];

    if (body.billingMode !== undefined || body.billing_mode !== undefined) {
      const bm = str(body.billingMode ?? body.billing_mode);
      if (!['subscription', 'unit'].includes(bm)) return json({ error: 'billingMode غير صالح.' }, 400);
      sets.push('billing_mode = ?'); binds.push(bm);
    }
    if (body.monthlyPrice !== undefined || body.monthly_price !== undefined) {
      const v = body.monthlyPrice ?? body.monthly_price;
      sets.push('monthly_price = ?'); binds.push(v == null || v === '' ? null : num(v));
    }
    if (body.annualPrice !== undefined || body.annual_price !== undefined) {
      const v = body.annualPrice ?? body.annual_price;
      sets.push('annual_price = ?'); binds.push(v == null || v === '' ? null : num(v));
    }
    if (body.unitPrice !== undefined || body.unit_price !== undefined) {
      const v = body.unitPrice ?? body.unit_price;
      sets.push('unit_price = ?'); binds.push(v == null || v === '' ? null : num(v));
    }
    if (body.validFrom !== undefined || body.valid_from !== undefined) {
      const v = str(body.validFrom ?? body.valid_from);
      if (!validDate(v)) return json({ error: 'validFrom غير صالح.' }, 400);
      sets.push('valid_from = ?'); binds.push(v);
    }
    if (body.validTo !== undefined || body.valid_to !== undefined) {
      const v = body.validTo ?? body.valid_to;
      if (v == null || v === '') { sets.push('valid_to = NULL'); }
      else {
        const vs = str(v);
        if (!validDate(vs)) return json({ error: 'validTo غير صالح.' }, 400);
        sets.push('valid_to = ?'); binds.push(vs);
      }
    }
    if (body.serviceKey !== undefined || body.service_key !== undefined) { sets.push('service_key = ?'); binds.push(str(body.serviceKey ?? body.service_key)); }
    if (body.schoolYear !== undefined || body.school_year !== undefined) {
      const v = str(body.schoolYear ?? body.school_year);
      if (!validSchoolYear(v)) return json({ error: 'schoolYear غير صالح.' }, 400);
      sets.push('school_year = ?'); binds.push(v);
    }

    if (sets.length === 0) return json({ error: 'لا توجد حقول للتحديث.' }, 400);
    binds.push(id, centerId);
    const res = await context.env.DB.prepare(`UPDATE student_service_enrollments SET ${sets.join(', ')} WHERE id = ? AND center_id = ?`).bind(...binds).run();
    if (!res.meta.changes) return json({ error: 'تسجيل الخدمة غير موجود في هذا المركز.' }, 404);
    return json({ ok: true });
  } catch (err: any) {
    console.error('Error:', err);
    const msg = err?.message || '';
    if (msg.includes('UNIQUE')) return json({ error: 'تسجيل موجود مسبقاً لهذا التلميذ والخدمة والسنة وبداية الصلاحية.' }, 409);
    if (msg.includes('CHECK') || msg.includes('FOREIGN KEY')) return json({ error: 'بيانات غير صالحة.' }, 400);
    return json({ error: 'تعذر تحديث تسجيل الخدمة.' }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    const id = url.searchParams.get('id') || '';
    if (!id) return json({ error: 'id مطلوب.' }, 400);
    const res = await context.env.DB.prepare('DELETE FROM student_service_enrollments WHERE id = ? AND center_id = ?').bind(id, centerId).run();
    if (!res.meta.changes) return json({ error: 'تسجيل الخدمة غير موجود في هذا المركز.' }, 404);
    return json({ ok: true });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'تعذر حذف تسجيل الخدمة.' }, 500);
  }
};
