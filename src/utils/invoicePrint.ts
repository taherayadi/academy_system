/**
 * Invoice print window (Finance tab + invoice dialog).
 *
 * The printable document is generated as a string and injected into a popup
 * with `document.write`. That injection point is the whole reason this module
 * exists: the popup is an `about:blank` document created by script, and such a
 * document INHERITS the opener's Content-Security-Policy (Chromium, Firefox,
 * WebKit). The console CSP (`public/_headers` and `addSecurityHeaders` in
 * `functions/api/_lib.ts`) is `script-src 'self'` — no `'unsafe-inline'` — so
 *
 *   - `<script>…</script>` written into the popup  → "Refused to execute
 *     inline script…"
 *   - `onclick="window.print()"` on the Imprimer button → "Refused to execute
 *     inline event handler…"
 *
 * Both are silently refused, which is why the invoice rendered (inline CSS is
 * allowed: `style-src 'self' 'unsafe-inline'`) while its print button did
 * nothing. Fix: the popup markup carries NO JavaScript at all — every
 * behaviour is attached from this module (an external, CSP-allowed script) via
 * `addEventListener`, exactly like the `index.html` polyfill that had to be
 * moved into its own file for the same reason.
 *
 * SECURITY: every operator-entered invoice field (notes, cheque number, center
 * name…) is untrusted for the generated document — each interpolated value
 * goes through `escapeHtml` before it reaches the HTML (see src/utils/html.ts).
 */
import type { CenterInvoice } from '../api';
import { escapeHtml } from './html';
import { BRAND_NAME, BRAND_FOOTER } from '../brand';

/** id of the in-page print button of the generated document. */

/** Brand teal — keep in sync with --color-accent-500 in src/index.css
 *  (this HTML runs in a standalone print window without the app CSS). */
const BRAND_HEX = '#257C86';

export const PRINT_BUTTON_ID = 'print-btn';

const tnDate = (ts?: number | null) => (ts ? new Date(ts).toLocaleDateString('ar-TN') : '—');

/**
 * Markup of the printable invoice — self-contained, print-ready and, above all,
 * script-free. `PRINT_BUTTON_ID` is wired by `openInvoicePrintWindow`.
 */
export function buildInvoicePrintDocument(inv: CenterInvoice): string {
  const esc = escapeHtml;
  const statusText = inv.status === 'paid' ? 'مدفوعة'
    : inv.status === 'overdue' ? 'متأخرة'
    : inv.status === 'cancelled' ? 'ملغاة' : 'قيد الانتظار';
  const payLine = inv.paymentMethod === 'cheque'
    ? `شيك${inv.chequeNumber ? ` رقم ${esc(inv.chequeNumber)}` : ''}${inv.chequeDate ? ` بتاريخ ${tnDate(inv.chequeDate)}` : ''}${inv.status !== 'paid' ? ' — قيد التحصيل' : ''}`
    : inv.paymentMethod === 'cash' ? 'نقدًا'
    : '—';
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8" />
<title>فاتورة ${esc(inv.invoiceNumber)}</title>
<style>
  /* Margin 0 supprime l'en-tête/pied de page du navigateur (date, titre, URL « blank », n° de page). */
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: auto; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #0f172a; padding: 40px 24px; background: #fff; }
  .sheet { max-width: 720px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 14px; padding: 36px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${BRAND_HEX}; padding-bottom: 18px; margin-bottom: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: 0.02em; }
  .muted { color: #64748b; font-size: 12px; }
  .badge { display: inline-block; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; border: 1px solid ${inv.status === 'paid' ? '#059669' : '#d97706'}; color: ${inv.status === 'paid' ? '#059669' : '#d97706'}; }
  .row { display: flex; justify-content: space-between; font-size: 13px; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; }
  .row b { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin: 22px 0; font-size: 13px; }
  th { text-align: right; background: #f1f5f9; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; }
  td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
  .total { text-align: left; font-size: 16px; font-weight: 800; margin-top: 10px; }
  .notes { margin-top: 16px; font-size: 12px; color: #475569; background: #f8fafc; border-radius: 8px; padding: 10px 12px; }
  .sign { display: flex; justify-content: flex-start; margin-top: 46px; }
  .signbox { text-align: center; }
  .signspace { height: 46px; }
  .signline { width: 230px; border-bottom: 1px solid #334155; }
  .signcap { font-size: 11px; font-weight: 700; color: #334155; margin-top: 6px; }
  footer { margin-top: 14px; font-size: 11px; color: #94a3b8; text-align: center; }
  @media print {
    body { padding: 0; }
    /* Le contenu porte lui-même ses marges → pas de 2e page vide. */
    .sheet { max-width: none; border: none; border-radius: 0; padding: 18mm 16mm; margin: 0; }
    /* CSP: no inline script allowed in this document → styles only. */
    .noprint { display: none !important; }
  }
</style></head><body>
<div class="sheet">
  <div class="head">
    <div><h1>فاتورة اشتراك</h1><div class="muted">${BRAND_NAME} — منصة إدارة المراكز</div></div>
    <div style="text-align:left"><div style="font-weight:800;font-size:14px">${esc(inv.invoiceNumber) || '—'}</div>
      <div class="muted">صدرت في ${tnDate(inv.createdAt)}</div>
      <div style="margin-top:8px"><span class="badge">${statusText}</span></div></div>
  </div>
  <div class="row"><span>المركز</span><b>${esc(inv.centerName) || '—'}</b></div>
  <div class="row"><span>الفترة المفوترة</span><b>${tnDate(inv.periodStart)} ← ${tnDate(inv.periodEnd)}</b></div>
  <div class="row"><span>طريقة الدفع</span><b>${payLine}</b></div>
  ${inv.paymentDate ? `<div class="row"><span>دُفعت في</span><b>${tnDate(inv.paymentDate)}</b></div>` : ''}
  <table><thead><tr><th>البيان</th><th style="text-align:left">المبلغ</th></tr></thead>
  <tbody><tr><td>اشتراك منصة SaaS — ${tnDate(inv.periodStart)} ← ${tnDate(inv.periodEnd)}</td>
  <td style="text-align:left;font-weight:700">${inv.amount.toFixed(2)} TND</td></tr></tbody></table>
  <div class="total">الإجمالي: ${inv.amount.toFixed(2)} دينار</div>
  ${inv.notes ? `<div class="notes"><b>ملاحظات:</b> ${esc(inv.notes)}</div>` : ''}
  <div class="sign"><div class="signbox">
    <div class="signspace"></div>
    <div class="signline"></div>
    <div class="signcap">توقيع ${BRAND_NAME}</div>
  </div></div>
  <footer>${BRAND_FOOTER} — وثيقة مولّدة من مساحة الإدارة.</footer>
  <div class="noprint" style="text-align:center;margin-top:18px">
    <button id="${PRINT_BUTTON_ID}" type="button" style="background:${BRAND_HEX};color:#fff;border:none;border-radius:8px;padding:10px 22px;font-weight:700;cursor:pointer">طباعة</button>
    <p style="font-size:11px;color:#94a3b8;margin-top:10px">Ctrl+P (⌘+P) أو القائمة ⋮ → «طباعة» · «حفظ بتنسيق PDF»</p>
  </div>
</div>
</body></html>`;
}

/** Minimal shape of the popup this module drives (mockable in tests). */
interface PrintWindow {
  document: Document & { write?: (s: string) => void; close?: () => void };
  print?: () => void;
  focus?: () => void;
  setTimeout?: typeof window.setTimeout;
  addEventListener?: typeof window.addEventListener;
  closed?: boolean;
}

const PRINT_DELAY_MS = 250;

function callPrint(win: PrintWindow) {
  if (win.closed) return;                       // popup dismissed meanwhile
  if (typeof win.print !== 'function') return; // jsdom / non-implementing hosts
  try { win.focus?.(); } catch { /* ignore — best-effort focus before print */ }
  win.print();
}

/**
 * Runs `fn` once the popup has finished loading (layout + fonts settled), so
 * the print preview matches what the operator sees.
 */
function whenPopupReady(win: PrintWindow, fn: () => void) {
  const doc = win.document;
  const schedule = (delay: number) => {
    const timer = typeof win.setTimeout === 'function' ? win.setTimeout.bind(win) : setTimeout;
    timer(fn, delay);
  };
  if (!doc || doc.readyState === 'complete') { schedule(PRINT_DELAY_MS); return; }
  if (typeof win.addEventListener === 'function') {
    win.addEventListener('load', () => schedule(PRINT_DELAY_MS), { once: true } as AddEventListenerOptions);
    // Safety net: some engines fire `load` before a document.write'd popup is
    // observed by the opener — a later timer covers that (callers guard the
    // auto-print with a one-shot flag, so the preview never opens twice).
    schedule(PRINT_DELAY_MS * 4);
    return;
  }
  schedule(PRINT_DELAY_MS);
}

export interface OpenInvoicePrintOptions {
  /** Open the browser print preview automatically (default true). */
  autoPrint?: boolean;
}

/**
 * Opens the printable invoice in a dedicated window and wires its print
 * button from here (never from inline JS — see the module comment).
 *
 * @returns `false` when the popup was blocked or its document was unreachable,
 * so the caller can explain what the operator has to change.
 */
export function openInvoicePrintWindow(
  inv: CenterInvoice,
  options: OpenInvoicePrintOptions = {}
): boolean {
  const { autoPrint = true } = options;
  const win = window.open('', '_blank', 'width=820,height=920') as (Window & PrintWindow) | null;
  if (!win || !win.document || typeof win.document.write !== 'function') return false;

  try {
    win.document.write(buildInvoicePrintDocument(inv));
    win.document.close?.();
  } catch {
    return false;
  }

  // The manual button: attached from the (external, CSP-allowed) bundle instead
  // of an onclick attribute, which the popup's inherited policy would refuse.
  // `document.close()` normally finishes the markup, but a retry on `load`
  // keeps the button working even on engines that parse it later.
  let buttonWired = false;
  const wirePrintButton = () => {
    if (buttonWired) return;
    const button = typeof win.document?.getElementById === 'function'
      ? win.document.getElementById(PRINT_BUTTON_ID)
      : null;
    if (!button || typeof button.addEventListener !== 'function') return;
    buttonWired = true;
    button.addEventListener('click', () => callPrint(win));
  };
  wirePrintButton();
  if (!buttonWired && typeof win.addEventListener === 'function') {
    win.addEventListener('load', wirePrintButton, { once: true } as AddEventListenerOptions);
  }

  win.focus?.();
  if (autoPrint) {
    // One-shot: `load` and the fallback timer must not queue two previews.
    let autoPrinted = false;
    whenPopupReady(win, () => {
      if (autoPrinted) return;
      autoPrinted = true;
      callPrint(win);
    });
  }
  return true;
}
