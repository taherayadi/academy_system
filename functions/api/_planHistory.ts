// Shared writer for the per-center plan audit trail (migration 0029).
// History is informational: a missing table (migration not applied yet) or
// a failing INSERT must NEVER break a plan mutation, so everything is
// swallowed here.
export async function logPlanHistory(
  db: D1Database,
  entry: {
    centerId: string;
    action: string;
    details: string;
    amount?: number | null;
    invoiceNumber?: string | null;
  }
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO center_plan_history (id, center_id, action, details, amount, invoice_number, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      entry.centerId,
      String(entry.action || '').slice(0, 40),
      String(entry.details || '').slice(0, 500),
      entry.amount === null || entry.amount === undefined ? null : Number(entry.amount),
      entry.invoiceNumber || null,
      Date.now()
    ).run();
  } catch {
    // no such table (migration 0029 pending) → skip silently
  }
}

export async function fetchPlanHistory(db: D1Database, centerId: string, limit = 50): Promise<any[]> {
  try {
    const { results } = await db.prepare(`
      SELECT id, action, details, amount, invoice_number, created_at
      FROM center_plan_history WHERE center_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).bind(centerId, limit).all<any>();
    return (results || []).map(h => ({
      id: h.id,
      action: h.action,
      details: h.details || '',
      amount: h.amount === null || h.amount === undefined ? null : Number(h.amount),
      invoiceNumber: h.invoice_number || null,
      createdAt: h.created_at,
    }));
  } catch {
    return [];
  }
}
