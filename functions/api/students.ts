import { Env, json, readBody, readStudents, writeStudents, createSingleStudent, updateSingleStudent, deleteSingleStudent, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const students = await readStudents(context.env.DB, centerId);
    return json(students);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات التلاميذ.' }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const student = await readBody(context.request);
    if (!student || typeof student !== 'object' || !student.id) {
      return json({ error: 'بيانات التلميذ غير صالحة.' }, 400);
    }
    await createSingleStudent(context.env.DB, student, centerId);
    return json({ ok: true, student });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر إضافة التلميذ.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const body = await readBody(context.request);
    if (Array.isArray(body)) {
      await writeStudents(context.env.DB, body, centerId);
      return json({ ok: true });
    }
    if (body && typeof body === 'object' && body.id) {
      await updateSingleStudent(context.env.DB, body, centerId);
      return json({ ok: true, student: body });
    }
    return json({ error: 'بيانات التلميذ غير صالحة.' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر تعديل بيانات التلميذ.' }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const url = new URL(context.request.url);
    let id = url.searchParams.get('id');
    if (!id) {
      const body = await readBody(context.request).catch(() => ({}));
      id = body?.id;
    }
    if (!id) {
      return json({ error: 'معرّف التلميذ مطلوب.' }, 400);
    }
    await deleteSingleStudent(context.env.DB, id, centerId);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حذف التلميذ.' }, 500);
  }
};
