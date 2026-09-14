/**
 * HTML-escaping for strings injected into generated documents
 * (invoice print windows opened via `document.write`).
 *
 * Invoice fields are operator-entered data (notes, cheque numbers, center
 * names fed by demo-request conversions…) — they are UNTRUSTED input for the
 * print window, so every interpolated value must pass through here before it
 * reaches the generated HTML.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
