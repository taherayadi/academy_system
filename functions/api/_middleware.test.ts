import { describe, it, expect, vi } from 'vitest';
import { onRequest } from './_middleware';

vi.mock('./_lib', () => ({
  validateSession: vi.fn(async () => null), // personne n'est connecté
  json: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }),
}));

function ctx(pathname: string) {
  const next = vi.fn(async () => new Response('handler-reached'));
  return { context: { request: new Request(`https://x.test${pathname}`), env: { DB: {} }, next, data: {} }, next };
}

describe('functions/api/_middleware — public paths', () => {
  it.each([
    '/api/auth/login',
    '/api/public-pricing',
    '/api/advertisements/active', // la landing anonyme doit pouvoir charger les pubs
  ])('%s passe sans session', async (path) => {
    const { context, next } = ctx(path);
    const res = await onRequest(context as any);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('handler-reached');
    expect(next).toHaveBeenCalled();
  });

  it('bloque les autres routes sans session', async () => {
    const { context, next } = ctx('/api/advertisements/active?location=x&y=1');
    // query ≠ pathname exact → même route publique : doit rester autorisée.
    const res = await onRequest({ ...context, request: new Request('https://x.test/api/advertisements/active?location=landing_page') } as any);
    expect(res.status).toBe(200);
    void next;

    const blocked = ctx('/api/centers');
    const res2 = await onRequest(blocked.context as any);
    expect(res2.status).toBe(401);
  });
});
