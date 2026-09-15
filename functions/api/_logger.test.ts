import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logError } from './_logger';

describe('logError', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs Error instances with message only (no stack)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('something broke');
    logError('test-context', err);
    expect(spy).toHaveBeenCalledOnce();
    const msg = spy.mock.calls[0][0] as string;
    expect(msg).toBe('[platform] test-context: something broke');
    // Stack trace must NOT appear in the log string
    expect(msg).not.toContain('at ');
  });

  it('logs non-Error values via String()', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('ctx', 'raw string error');
    expect(spy.mock.calls[0][0]).toBe('[platform] ctx: raw string error');
  });

  it('logs null/undefined without crashing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('ctx', null);
    expect(spy.mock.calls[0][0]).toBe('[platform] ctx: null');
    logError('ctx', undefined);
    expect(spy.mock.calls[1][0]).toBe('[platform] ctx: undefined');
  });

  it('logs numeric errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('ctx', 42);
    expect(spy.mock.calls[0][0]).toBe('[platform] ctx: 42');
  });

  // ─── Defensive secret-stripping ────────────────────────────────────────────
  it('masks password fragments in the message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('ctx', new Error('SELECT failed password=Sup3rSekret'));
    const msg = spy.mock.calls[0][0] as string;
    expect(msg).toContain('password=***');
    expect(msg).not.toContain('Sup3rSekret');
  });

  it('masks Bearer tokens in the message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('ctx', 'unauthorized Bearer tok_platform_12345');
    const msg = spy.mock.calls[0][0] as string;
    expect(msg).toContain('Bearer ***');
    expect(msg).not.toContain('tok_platform_12345');
  });

  it('leaves ordinary messages unchanged', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('ctx', new Error('update center failed'));
    expect(spy.mock.calls[0][0]).toBe('[platform] ctx: update center failed');
  });
});