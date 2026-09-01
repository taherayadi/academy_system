import { Env, json, readBody, readExpenses, writeExpenses } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const expenses = await readExpenses(env.DB);
    return json(expenses);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر قراءة بيانات المصاريف.' }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const expenses = await readBody(request);
    if (!Array.isArray(expenses)) {
      return json({ error: 'بيانات المصاريف غير صالحة.' }, 400);
    }
    await writeExpenses(env.DB, expenses);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'تعذر حفظ بيانات المصاريف.' }, 500);
  }
};
