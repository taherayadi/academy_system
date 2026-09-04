import { Env, json, readBody, readExpenses, writeExpenses, getContextCenterId } from './_lib';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const centerId = getContextCenterId(context);
    const expenses = await readExpenses(context.env.DB, centerId);
    return json(expenses);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات المصروفات.' }, 500);
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
