/**
 * Regression tests for the invoice print window.
 *
 * Why these exist: the print popup is an `about:blank` document created by
 * script, so it INHERITS the app's CSP (`script-src 'self'`, served through
 * public/_headers + functions/api/_lib.ts). Inline `<script>` and inline
 * `onclick` written into it are refused by the browser, which silently killed
 * both the auto-print and the 🖨 Imprimer button. The generated document must
 * therefore stay script-free, and the button must work when its listener is
 * attached from this module.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { buildInvoicePrintDocument, openInvoicePrintWindow, PRINT_BUTTON_ID } from './invoicePrint';
import type { CenterInvoice } from '../api';

const invoice: CenterInvoice = {
  id: 'i1', centerId: 'c1', centerName: 'Centre Horizon', invoiceNumber: 'INV-2026-0002',
  periodStart: new Date(2026, 7, 1).getTime(), periodEnd: new Date(2026, 7, 31).getTime(),
  amount: 45, status: 'paid', paymentMethod: 'cash', paymentDate: new Date(2026, 7, 3).getTime(),
  notes: 'Merci !', createdAt: new Date(2026, 7, 1).getTime(),
};

/** `<script>` blocks and inline event handlers are what the CSP refuses. */
const INLINE_SCRIPT = /<script\b/i;
const INLINE_HANDLER = /\son[a-z]+\s*=\s*["']/i;
const JAVASCRIPT_URL = /javascript\s*:/i;

describe('buildInvoicePrintDocument — CSP-safe markup', () => {
  it('contains no inline script, no inline event handler and no javascript: URL', () => {
    const html = buildInvoicePrintDocument(invoice);
    expect(html).not.toMatch(INLINE_SCRIPT);
    expect(html).not.toMatch(INLINE_HANDLER);
    expect(html).not.toMatch(JAVASCRIPT_URL);
  });

  it('keeps the printable invoice content and the print-ready page setup', () => {
    const html = buildInvoicePrintDocument(invoice);
    expect(html).toContain('INV-2026-0002');
    expect(html).toContain('Centre Horizon');
    expect(html).toContain('مدفوعة');
    expect(html).toContain('@page');
    expect(html).toContain('margin: 0');
    expect(html).toContain('توقيع منصة SaaS');
    expect(html).toContain(`id="${PRINT_BUTTON_ID}"`);
  });

  it('escapes every untrusted field so markup cannot smuggle a handler', () => {
    const hostile: CenterInvoice = {
      ...invoice,
      status: 'pending', paymentMethod: 'cheque', chequeDate: invoice.paymentDate ?? Date.now(),
      centerName: `<img src=x onerror="alert(1)">`,
      chequeNumber: `" onfocus="alert(2)" data-x="`,
      notes: `</div><script>alert(3)</script>`,
    };
    const html = buildInvoicePrintDocument(hostile);
    expect(html).not.toMatch(INLINE_SCRIPT);
    expect(html).not.toMatch(INLINE_HANDLER);
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(html).toContain('&quot; onfocus=&quot;alert(2)&quot;');
    expect(html).toContain('&lt;script&gt;alert(3)&lt;/script&gt;');
  });
});

/** A popup stand-in with a real DOM, so `getElementById` + click behave like a browser. */
function makeFakePopup() {
  const host = document.createElement('div');
  const written: string[] = [];
  const print = vi.fn();
  const doc = {
    readyState: 'complete' as const,
    write: (html: string) => {
      written.push(html);
      host.innerHTML = html.replace(/<\/?(?:!DOCTYPE|html|head|body)\b[^>]*>/gi, '');
    },
    close: vi.fn(),
    getElementById: (id: string) => host.querySelector(`#${id}`),
  };
  const win = {
    document: doc,
    print,
    focus: vi.fn(),
    closed: false,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
    addEventListener: vi.fn(),
  };
  return { win, print, written, host };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 400));

describe('openInvoicePrintWindow — the 🖨 Imprimer button must work', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('prints when the button is clicked (listener attached from this module)', async () => {
    const { win, print, written } = makeFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);

    expect(openInvoicePrintWindow(invoice, { autoPrint: false })).toBe(true);
    expect(written.join('')).toContain('INV-2026-0002');

    const button = win.document.getElementById(PRINT_BUTTON_ID) as HTMLElement;
    expect(button).toBeTruthy();
    // Nothing printed by itself: this is the reported bug (dead button).
    expect(print).not.toHaveBeenCalled();

    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(1);

    // And it stays clickable: a second print is a second, deliberate action.
    fireEvent.click(button);
    expect(print).toHaveBeenCalledTimes(2);
  });

  it('opens the print preview automatically once the popup is ready, only once', async () => {
    const { win, print } = makeFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);

    expect(openInvoicePrintWindow(invoice)).toBe(true);
    await flush();
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('survives a popup-blocked window.open instead of failing silently', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(openInvoicePrintWindow(invoice)).toBe(false);
    expect(openSpy).toHaveBeenCalled();
  });

  it('does not print into a popup the operator already closed', async () => {
    const { win, print } = makeFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    openInvoicePrintWindow(invoice);
    win.closed = true;
    await flush();
    expect(print).not.toHaveBeenCalled();
  });
});
