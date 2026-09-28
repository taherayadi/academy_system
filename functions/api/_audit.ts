/**
 * Lightweight audit logging helper.
 *
 * The `audit_log` table is OPTIONAL — the helper is resilient by design:
 * if the table does not exist (e.g. an older D1 snapshot), the call
 * logs a warning and returns silently. It MUST NEVER throw or reject.
 *
 * Audit events are server-side only. PII is limited to email; passwords,
 * tokens, and session identifiers are NEVER logged.
 *
 * D1 schema (admin repo migration, when available):
 *   CREATE TABLE IF NOT EXISTS audit_log (
 *     id INTEGER PRIMARY KEY AUTOINCREMENT,
 *     email TEXT NOT NULL,
 *     action TEXT NOT NULL,
 *     entity_type TEXT,
 *     entity_id TEXT,
 *     details TEXT,
 *     ip TEXT,
 *     created_at INTEGER NOT NULL
 *   );
 *   CREATE INDEX idx_audit_email ON audit_log(email);
 *   CREATE INDEX idx_audit_created ON audit_log(created_at);
 */
import type { Env } from './_lib';

export type AuditAction =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'password_change'
  | 'demo_request'
  | 'logo_upload'
  | 'center_settings_change'
  | 'session_expired';

interface AuditEvent {
  email: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  details?: string;
  ip: string;
}

/**
 * Record an audit event. Fire-and-forget: never throws, never rejects.
 * @param env Cloudflare environment (DB binding + client IP from request).
 * @param request Incoming request (for IP extraction).
 * @param event The audit event to record.
 */
export async function logAudit(
  env: Env,
  request: Request,
  event: AuditEvent
): Promise<void> {
  try {
    const ip = event.ip || 'unknown';
    await env.DB
      .prepare(
        `INSERT INTO audit_log (email, action, entity_type, entity_id, details, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        event.email,
        event.action,
        event.entityType || null,
        event.entityId || null,
        event.details || null,
        ip,
        Date.now()
      )
      .run();
  } catch {
    // Table may not exist in older deployments — silent fallback.
    console.warn('[audit] could not write audit event');
  }
}
