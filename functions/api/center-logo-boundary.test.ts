import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateSession } from './_lib';
import { onRequestPost as saveLogo } from './center-logo';
import { onRequestPost as uploadLogo } from './upload-logo';

vi.mock('./_lib', () => ({
  validateSession: vi.fn(),
  json: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }),
  readBody: (request: Request) => request.json(),
}));

beforeEach(() => vi.mocked(validateSession).mockReset());
describe('center logo authorization', () => {
  it.each(['platform_super_admin', 'unknown', ''])('rejects non-center role %s before reading or forwarding an upload', async role => {
    vi.mocked(validateSession).mockResolvedValue({ email: 'test@example.invalid', token: 'test', centerId: 'c1', role });
    for (const handler of [saveLogo, uploadLogo]) {
      const request = new Request('https://center.example/api/center-logo', { method: 'POST', body: 'invalid body' });
      const db = { prepare: vi.fn() };
      const res = await handler({ env: { DB: db }, request } as any);
      expect(res.status).toBe(403);
      expect(request.bodyUsed).toBe(false);
      expect(db.prepare).not.toHaveBeenCalled();
    }
  });
  it('does not fall back to a default tenant when center identity is missing', async () => {
    vi.mocked(validateSession).mockResolvedValue({ email: 'test@example.invalid', token: 'test', centerId: '', role: 'admin' });
    for (const handler of [saveLogo, uploadLogo]) expect((await handler({ env: { DB: {} }, request: new Request('https://center.example', { method: 'POST' }) } as any)).status).toBe(403);
  });
});
