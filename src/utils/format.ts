/**
 * Date formatting utilities for the platform admin console.
 * Centralized to ensure consistent date display across components.
 */

/**
 * Formats a timestamp as a localized date string (dd-mm-yyyy short month).
 * Returns '—' for null/undefined timestamps.
 *
 * @param ts - Unix timestamp in milliseconds, or null/undefined
 * @returns Formatted date string in fr-TN locale, or '—'
 */
export function fmtDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('fr-TN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Formats a timestamp as a localized date string with long month name (fr-FR).
 * Returns '—' for null/undefined timestamps.
 *
 * @param ts - Unix timestamp in milliseconds, or null/undefined
 * @returns Formatted date string in fr-FR locale with long month, or '—'
 */
export function fmtDateLong(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric'
  });
}