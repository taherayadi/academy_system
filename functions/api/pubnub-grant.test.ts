import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestGet } from './pubnub-grant';
import { APPLICATION } from './_deployment';
import { validateSession } from './_lib';
import { grantToken } from './_pubnub';
vi.mock('./_lib', () => ({ validateSession: vi.fn(), json: (value: unknown, status = 200) => new Response(JSON.stringify(value), { status }) }));
vi.mock('./_pubnub', () => ({ PUBNUB_GRANT_TTL_SECONDS: 600, grantToken: vi.fn(async () => 'grant-token') }));
beforeEach(() => { vi.mocked(validateSession).mockReset(); vi.mocked(grantToken).mockClear(); });
describe('fixed application realtime scope', () => {
  const allowed = String(APPLICATION) === 'center' ? ['admin', 'super_admin', 'restricted_admin'] : ['platform_super_admin'];
  const denied = String(APPLICATION) === 'center' ? ['platform_super_admin'] : ['admin', 'super_admin', 'restricted_admin'];
  it.each(allowed)('grants exact read-only scope to %s', async role => {
    vi.mocked(validateSession).mockResolvedValue({ role, email: 'test@example.invalid', token: 'test', centerId: 'c1' });
    const res = await onRequestGet({ env: { DB: {} }, request: new Request('https://app.example/api/pubnub-grant') } as any);
    expect(res.status).toBe(200);
    const channel = String(APPLICATION) === 'center' ? 'center.c1' : 'platform';
    expect((await res.json() as any).channels).toEqual([channel]);
    expect(vi.mocked(grantToken).mock.calls[0][2]).toEqual({ channels: { [channel]: { read: true } } });
  });
  it.each(denied)('does not grant tokens to %s', async role => {
    vi.mocked(validateSession).mockResolvedValue({ role, email: 'test@example.invalid', token: 'test', centerId: 'c1' });
    const res = await onRequestGet({ env: { DB: {} }, request: new Request('https://app.example/api/pubnub-grant') } as any);
    expect(res.status).toBe(401); expect(grantToken).not.toHaveBeenCalled();
  });
});
