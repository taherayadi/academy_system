import { Env, json, readBody, readExpenses, writeExpenses, createSingleExpense, deleteSingleExpense, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const expenses = await readExpenses(context.env.DB, centerId);
    return json(expenses);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات المصروفات.' }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const expense = await readBody(context.request);
    if (!expense || typeof expense !== 'object' || !expense.id) {
      return json({ error: 'بيانات المصروف غير صالحة.' }, 400);
    }
    await createSingleExpense(context.env.DB, expense, centerId);
    return json({ ok: true, expense });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر إضافة المصروف.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const expenses = await readBody(context.request);
    if (!Array.isArray(expenses)) {
      return json({ error: 'بيانات المصروفات غير صالحة.' }, 400);
    }
    await writeExpenses(context.env.DB, expenses, centerId);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات المصروفات.' }, 500);
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
      return json({ error: 'معرّف المصروف مطلوب.' }, 400);
    }
    await deleteSingleExpense(context.env.DB, id, centerId);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حذف المصروف.' }, 500);
  }
};
