/**
 * Date formatting utilities for the platform admin console.
 * Centralized to ensure consistent date display across components.
 */

/**
 * Formats a timestamp as a localized date string (dd-mm-yyyy short month).
 * Returns '—' for null/undefined timestamps.
 *
 * @param ts - Unix timestamp in milliseconds, or null/undefined
 * @returns Formatted date string in ar-TN locale (Latin digits), or '—'
 */
export function fmtDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('ar-TN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Formats a timestamp as a localized date string with long month name (ar-TN).
 * Returns '—' for null/undefined timestamps.
 *
 * @param ts - Unix timestamp in milliseconds, or null/undefined
 * @returns Formatted date string in ar-TN locale with long month, or '—'
 */
export function fmtDateLong(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('ar-TN', {
    month: 'long',
    year: 'numeric'
  });
}


/**
 * Arabic pluralization: `1 اليوم`, `2 يومان`, `3–10 أيام`, `11+ يومًا`.
 * Keeps numbers in Latin digits (ar-TN convention) and returns the full
 * "number + word" phrase.
 */
export function arPlural(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return `${n} ${one}`;
  if (n === 2) return `${n} ${two}`;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}
