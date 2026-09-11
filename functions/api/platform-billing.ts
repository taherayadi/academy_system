import { Env, json, readBody, validateSession } from './_lib';

// GET /api/platform-billing — SaaS finance dashboard aggregates + invoices
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'غير مصرح. يتطلب صلاحيات Platform Admin.' }, 403);
    }

    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') || 'summary'; // summary | invoices | module-prices

    if (mode === 'module-prices') {
      const year = url.searchParams.get('year');
      const query = year
        ? 'SELECT * FROM module_prices WHERE school_year = ? ORDER BY module_key'
        : 'SELECT * FROM module_prices ORDER BY school_year DESC, module_key';
      const stmt = year ? env.DB.prepare(query).bind(year) : env.DB.prepare(query);
      const { results } = await stmt.all<any>();
      return json({ prices: results || [] });
    }

    if (mode === 'invoices') {
      const centerId = url.searchParams.get('centerId');
      const status = url.searchParams.get('status');
      const limit = Number(url.searchParams.get('limit')) || 100;

      let query = 'SELECT i.*, c.name as center_name FROM center_invoices i LEFT JOIN centers c ON i.center_id = c.id WHERE 1=1';
      const binds: any[] = [];
      if (centerId) { query += ' AND i.center_id = ?'; binds.push(centerId); }
      if (status) { query += ' AND i.status = ?'; binds.push(status); }
      query += ' ORDER BY i.created_at DESC LIMIT ?';
      binds.push(limit);

      const { results } = await env.DB.prepare(query).bind(...binds).all<any>();
      const formatted = (results || []).map(inv => ({
        id: inv.id,
        centerId: inv.center_id,
        centerName: inv.center_name || '',
        invoiceNumber: inv.invoice_number || '',
        periodStart: inv.period_start,
        periodEnd: inv.period_end,
        amount: Number(inv.amount),
        status: inv.status,
        paymentMethod: inv.payment_method || null,
        paymentDate: inv.payment_date || null,
        chequeNumber: inv.cheque_number || null,
        chequeDate: inv.cheque_date || null,
        notes: inv.notes || '',
        createdAt: inv.created_at
      }));
      return json({ invoices: formatted });
    }

    // Default: summary (MRR, collected revenue, pending invoices, centers by payment status)
    const [centersRes, invoicesRes, monthInvoicesRes, yearInvoicesRes, latestPaidRes] = await Promise.all([
      env.DB.prepare(`
        SELECT id, name, status, monthly_price, billing_cycle, subscription_ends_at
        FROM centers WHERE status != 'trial'
      `).all<any>(),
      env.DB.prepare('SELECT status, SUM(amount) as total FROM center_invoices GROUP BY status').all<any>(),
      env.DB.prepare(`
        SELECT SUM(amount) as total FROM center_invoices
        WHERE status = 'paid' AND payment_date >= ? AND payment_date < ?
      `).bind(monthStart(), monthEnd()).all<any>(),
      env.DB.prepare(`
        SELECT SUM(amount) as total FROM center_invoices
        WHERE status = 'paid' AND payment_date >= ? AND payment_date < ?
      `).bind(yearStart(), yearEnd()).all<any>(),
      // Latest PAID invoice per center drives MRR (normalised per month).
      // A center counts as soon as it has a paid invoice — even when its
      // billing window lies in the past (e.g. activation after an expired
      // trial), which is why a period-based filter used to show 0 TND.
      env.DB.prepare(`
        SELECT center_id, amount, period_start, period_end FROM center_invoices
        WHERE status = 'paid'
        ORDER BY center_id, period_end DESC
        LIMIT 1000
      `).all<any>()
    ]);

    const centers = centersRes.results || [];
    const invoicesByStatus = (invoicesRes.results || []).reduce((acc, r) => {
      acc[r.status] = Number(r.total) || 0;
      return acc;
    }, {} as Record<string, number>);

    const collectedThisMonth = Number(monthInvoicesRes.results?.[0]?.total) || 0;
    const collectedThisYear = Number(yearInvoicesRes.results?.[0]?.total) || 0;

    // MRR is computed from PAID invoices ONLY: each center contributes its
    // latest paid invoice, normalised to a month (annual invoices → /12,
    // e.g. 30-day windows → amount). Pending invoices and pending cheques
    // never count toward MRR.
    let mrr = 0;
    const MONTH_MS = 30.44 * 24 * 60 * 60 * 1000;
    const countedCenters = new Set<string>();
    (latestPaidRes.results || []).forEach((inv: { center_id?: string; amount?: number | string; period_start?: number; period_end?: number }) => {
      const cid = String(inv.center_id || '');
      if (countedCenters.has(cid)) return; // older paid invoices of this center are superseded
      countedCenters.add(cid);
      const months = Math.max(1, Math.round((Number(inv.period_end || 0) - Number(inv.period_start || 0)) / MONTH_MS));
      mrr += (Number(inv.amount) || 0) / months;
    });
    const activeCount = centers.filter(c => c.status === 'active').length;
    const suspendedCount = centers.filter(c => c.status === 'suspended').length;
    const expiredCount = centers.filter(c => c.status === 'expired').length;

    // Centers by payment status (active with sub ending soon, overdue, suspended)
    const now = Date.now();
    const soon = now + 7 * 86400000; // 7 days
    const endingSoon = centers.filter(c => c.status === 'active' && c.subscription_ends_at && c.subscription_ends_at > now && c.subscription_ends_at <= soon);
    const overdue = centers.filter(c => c.status === 'active' && c.subscription_ends_at && c.subscription_ends_at < now);

    return json({
      summary: {
        mrr,
        collectedThisMonth,
        collectedThisYear,
        pendingInvoices: invoicesByStatus.pending || 0,
        overdueInvoices: invoicesByStatus.overdue || 0,
        activeCount,
        suspendedCount,
        expiredCount,
        endingSoonCount: endingSoon.length,
        overdueCount: overdue.length
      },
      centersByStatus: {
        endingSoon: endingSoon.map(c => ({ id: c.id, name: c.name, subscriptionEndsAt: c.subscription_ends_at })),
        overdue: overdue.map(c => ({ id: c.id, name: c.name, subscriptionEndsAt: c.subscription_ends_at }))
      }
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في جلب البيانات المالية.' }, 500);
  }
};

// POST /api/platform-billing — create invoice or update module prices
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'غير مصرح.' }, 403);
    }

    const body = await readBody(request);
    const action = String(body.action || 'create-invoice').trim();

    if (action === 'create-invoice') {
      const centerId = String(body.centerId || '').trim();
      const amount = Number(body.amount) || 0;
      const periodStart = Number(body.periodStart) || Date.now();
      const periodEnd = Number(body.periodEnd) || Date.now();
      const notes = String(body.notes || '').trim();

      if (!centerId) return json({ error: 'معرف المركز مطلوب.' }, 400);

      const id = crypto.randomUUID();
      const createdAt = Date.now();
      const invoiceNumber = `INV-${new Date(createdAt).getFullYear()}-${String(id).slice(0, 8).toUpperCase()}`;

      await env.DB.prepare(`
        INSERT INTO center_invoices (id, center_id, invoice_number, period_start, period_end, amount, status, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).bind(id, centerId, invoiceNumber, periodStart, periodEnd, amount, notes, createdAt).run();

      return json({ success: true, invoiceId: id, invoiceNumber }, 201);
    }

    if (action === 'update-module-prices') {
      const year = String(body.year || '').trim();
      const prices = body.prices as Array<{ module_key: string; price: number }>;
      if (!year || !Array.isArray(prices)) return json({ error: 'year et prices requis.' }, 400);

      const stmts: D1PreparedStatement[] = [];
      prices.forEach(p => {
        stmts.push(env.DB.prepare(`
          INSERT INTO module_prices (school_year, module_key, price, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (school_year, module_key) DO UPDATE SET price = excluded.price
        `).bind(year, p.module_key, p.price, Date.now()));
      });

      await env.DB.batch(stmts);
      return json({ success: true });
    }

    return json({ error: 'Action inconnue.' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في إنشاء الفاتورة.' }, 500);
  }
};

// PATCH /api/platform-billing — update invoice
export const onRequestPatch: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'غير مصرح.' }, 403);
    }

    const body = await readBody(request);
    const id = String(body.id || '').trim();
    if (!id) return json({ error: 'معرف الفاتورة مطلوب.' }, 400);

    const existing = await env.DB.prepare('SELECT status, payment_date FROM center_invoices WHERE id = ?').bind(id).first<any>();
    if (!existing) return json({ error: 'الفاتورة غير موجودة.' }, 404);

    const updates: string[] = [];
    const binds: any[] = [];

    if (body.status !== undefined) {
      const targetStatus = String(body.status).trim();
      updates.push('status = ?');
      binds.push(targetStatus);
      // Revenue is recognised only for paid invoices: stamp the collection
      // date when an invoice BECOMES paid, and clear it when it stops being
      // paid. Editing an already-paid invoice must not move its payment date.
      if (body.paymentDate === undefined) {
        const wasPaid = existing.status === 'paid';
        if (targetStatus === 'paid' && !wasPaid) {
          updates.push('payment_date = ?');
          binds.push(Date.now());
        } else if (targetStatus !== 'paid' && wasPaid) {
          updates.push('payment_date = ?');
          binds.push(null);
        }
      }
    }
    if (body.amount !== undefined) { updates.push('amount = ?'); binds.push(Number(body.amount)); }
    if (body.paymentMethod !== undefined) {
      const method = String(body.paymentMethod ?? '').trim();
      // Cheque payments are kept pending ("chèque en attente") until encashed
      // — they are never counted as revenue. Encashing = status → 'paid'.
      // Only 'cash' and 'cheque' are accepted; anything else is cleared.
      updates.push('payment_method = ?');
      binds.push(method === 'cash' || method === 'cheque' ? method : null);
    }
    if (body.chequeNumber !== undefined) {
      updates.push('cheque_number = ?');
      binds.push(body.chequeNumber ? String(body.chequeNumber).trim() : null);
    }
    if (body.chequeDate !== undefined) {
      updates.push('cheque_date = ?');
      binds.push(body.chequeDate ? Number(body.chequeDate) : null);
    }
    if (body.paymentDate !== undefined) { updates.push('payment_date = ?'); binds.push(body.paymentDate ? Number(body.paymentDate) : null); }
    if (body.notes !== undefined) { updates.push('notes = ?'); binds.push(String(body.notes).trim()); }
    if (body.periodStart !== undefined) { updates.push('period_start = ?'); binds.push(Number(body.periodStart)); }
    if (body.periodEnd !== undefined) { updates.push('period_end = ?'); binds.push(Number(body.periodEnd)); }

    if (updates.length > 0) {
      binds.push(id);
      await env.DB.prepare(`UPDATE center_invoices SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في تحديث الفاتورة.' }, 500);
  }
};

// DELETE /api/platform-billing — delete invoice
export const onRequestDelete: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const session = await validateSession(env.DB, request);
    if (!session || (session.role !== 'super_admin' && session.role !== 'platform_super_admin')) {
      return json({ error: 'غير مصرح.' }, 403);
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'معرف الفاتورة مطلوب.' }, 400);

    await env.DB.prepare('DELETE FROM center_invoices WHERE id = ?').bind(id).run();
    return json({ success: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'خطأ في حذف الفاتورة.' }, 500);
  }
};

// Helper: start of current month
function monthStart(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
function monthEnd(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}
function yearStart(): number {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1).getTime();
}
function yearEnd(): number {
  const d = new Date();
  return new Date(d.getFullYear() + 1, 0, 1).getTime();
}
