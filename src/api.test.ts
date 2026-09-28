import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { submitDemoRequestApi, fetchPublicModulePricesApi, fetchActiveAdvertisementsApi, __resetActiveAdsCacheForTests } from './api';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  __resetActiveAdsCacheForTests();
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('submitDemoRequestApi', () => {
  it('POSTs the payload to /api/demo-requests', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 201 }));
    await submitDemoRequestApi({
      requestType: 'trial',
      fullName: 'Test User',
      academyName: 'Test Academy',
      email: 'test@test.tn',
      phone: '20123456',
      centerType: 'creche',
      requestedModules: ['scolaire', 'studentTimeSheets', 'finance']
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/demo-requests');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.centerType).toBe('creche');
    expect(body.requestedModules).toContain('scolaire');
  });

  it('surfaces server error messages', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'boom' }), { status: 400 }));
    await expect(submitDemoRequestApi({
      requestType: 'trial', fullName: 'a', academyName: 'b', email: 'c', phone: 'd'
    })).rejects.toThrow('boom');
  });
});

describe('fetchPublicModulePricesApi', () => {
  it('maps pricing rows into a module-key price map', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      schoolYear: '2026/2027',
      prices: [
        { module_key: 'scolaire', price: 20 },
        { module_key: 'studentTimeSheets', price: 0 },
        { module_key: 'finance', price: 20 }
      ]
    }), { status: 200 }));
    const prices = await fetchPublicModulePricesApi();
    expect(prices).toEqual({ scolaire: 20, studentTimeSheets: 0, finance: 20 });
  });

  it('propagates API failures', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    await expect(fetchPublicModulePricesApi()).rejects.toThrow('nope');
  });
});

describe('fetchActiveAdvertisementsApi', () => {
  it('queries by location and deduplicates concurrent/serial requests', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ advertisements: [{ id: 'ad1' }] }), { status: 200 }));

    const [a, b] = await Promise.all([
      fetchActiveAdvertisementsApi('landing_page'),
      fetchActiveAdvertisementsApi('landing_page')
    ]);
    expect(a).toEqual([{ id: 'ad1' }]);
    expect(b).toEqual([{ id: 'ad1' }]);
    // One network call despite two callers (cache + in-flight dedup).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/advertisements/active?location=landing_page');

    // Cache expiry forces a refetch.
    __resetActiveAdsCacheForTests();
    await fetchActiveAdvertisementsApi('landing_page');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('propagates API failures', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'ads down' }), { status: 500 }));
    await expect(fetchActiveAdvertisementsApi('landing_page')).rejects.toThrow('ads down');
  });
});
