import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestGet, onRequestPut } from './events';
import { Env } from './_lib';

// Mock _lib helpers
vi.mock('./_lib', async () => {
  const actual = await vi.importActual('./_lib');
  return {
    ...actual,
    getContextCenterId: vi.fn(),
    readEvents: vi.fn(),
    writeEvents: vi.fn(),
    readBody: vi.fn(),
  };
});

import { getContextCenterId, readEvents, writeEvents, readBody } from './_lib';

describe('Events API', () => {
  const mockEnv: Env = {
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn(),
          all: vi.fn(),
        }),
      }),
    } as any,
  };

  const mockContext = {
    env: mockEnv,
    request: new Request('https://example.com/api/events', {
      method: 'GET',
    }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('onRequestGet', () => {
    it('returns events for the authenticated center', async () => {
      const centerId = 'center_123';
      const mockEvents = [{ id: 'evt_1', name: 'School Trip' }];

      (getContextCenterId as any).mockReturnValue(centerId);
      (readEvents as any).mockResolvedValue(mockEvents);

      const response = await onRequestGet(mockContext);
      const data = await response.json() as { id?: string; name?: string }[];

      expect(response.status).toBe(200);
      expect(data).toEqual(mockEvents);
      expect(getContextCenterId).toHaveBeenCalledWith(mockContext);
      expect(readEvents).toHaveBeenCalledWith(mockEnv.DB, centerId);
    });

    it('returns 500 on unexpected error', async () => {
      (getContextCenterId as any).mockImplementation(() => {
        throw new Error('Critical failure');
      });

      const response = await onRequestGet(mockContext);
      expect(response.status).toBe(500);
      const data = await response.json() as { error?: string };
      expect(data.error).toBe('تعذر قراءة بيانات الفعاليات.');
    });
  });

  describe('onRequestPut', () => {
    it('successfully saves events snapshot', async () => {
      const centerId = 'center_123';
      const mockEvents = [{ id: 'evt_1', name: 'School Trip' }];

      const putContext = {
        ...mockContext,
        request: new Request('https://example.com/api/events', {
          method: 'PUT',
          body: JSON.stringify(mockEvents),
        }),
      };

      (getContextCenterId as any).mockReturnValue(centerId);
      (readBody as any).mockResolvedValue(mockEvents);
      (writeEvents as any).mockResolvedValue(undefined);

      const response = await onRequestPut(putContext);
      const data = await response.json() as { ok?: boolean };

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(writeEvents).toHaveBeenCalledWith(mockEnv.DB, mockEvents, centerId);
    });

    it('returns 400 if payload is not an array', async () => {
      const putContext = {
        ...mockContext,
        request: new Request('https://example.com/api/events', {
          method: 'PUT',
          body: JSON.stringify({ not: 'an array' }),
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');
      (readBody as any).mockResolvedValue({ not: 'an array' });

      const response = await onRequestPut(putContext);
      expect(response.status).toBe(400);
      const data = await response.json() as { error?: string };
      expect(data.error).toBe('بيانات الفعاليات غير صالحة.');
    });

    it('returns 500 on unexpected error', async () => {
      const putContext = {
        ...mockContext,
        request: new Request('https://example.com/api/events', {
          method: 'PUT',
          body: JSON.stringify([]),
        }),
      };

      (getContextCenterId as any).mockImplementation(() => {
        throw new Error('DB Error');
      });

      const response = await onRequestPut(putContext);
      expect(response.status).toBe(500);
      const data = await response.json() as { error?: string };
      expect(data.error).toBe('تعذر حفظ بيانات الفعاليات.');
    });
  });
});
