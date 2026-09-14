import { describe, it, expect } from 'vitest';
import { escapeHtml } from './html';

describe('escapeHtml — print-HTML safety for untrusted invoice fields', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    );
  });

  it('escapes quotes and ampersands (attribute injection)', () => {
    expect(escapeHtml(`a"b&c'd`)).toBe('a&quot;b&amp;c&#39;d');
  });

  it('renders null/undefined/numbers as safe strings', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(12.5)).toBe('12.5');
  });

  it('neutralises a scripted cheque number end-to-end', () => {
    const chequeNumber = `</b><script>alert(1)</script>`;
    const row = `<div class="row"><span>N°</span><b>${escapeHtml(chequeNumber)}</b></div>`;
    expect(row).not.toContain('<script>');
    expect(row).toContain('&lt;script&gt;');
  });
});
