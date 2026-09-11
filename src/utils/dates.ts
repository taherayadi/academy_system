export const DAY_MS = 86400000;

/** Jours entiers restants avant l'échéance (0 = aujourd'hui, négatif = dépassé). */
export function daysUntil(ts?: number | null, now: number = Date.now()): number | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  return Math.ceil((ts - now) / DAY_MS);
}

/** « 15 mars 2026 » — format court et stable pour les échéances. */
export function formatDate(ts?: number | null): string {
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return '—';
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** « il y a 3 jours » / « dans 5 jours » — pour les historiques. */
export function relativeDays(ts?: number | null, now: number = Date.now()): string {
  const days = daysUntil(ts, now);
  if (days === null) return '—';
  if (days === 0) return "aujourd'hui";
  if (days > 0) return `dans ${days} jour${days > 1 ? 's' : ''}`;
  const past = Math.abs(days);
  return `il y a ${past} jour${past > 1 ? 's' : ''}`;
}
