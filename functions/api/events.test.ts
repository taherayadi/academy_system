import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestGet, onRequestPost, onRequestPut, onRequestDelete } from './events';
import { Env } from './_lib';

// Mock _lib helpers
vi.mock('./_lib', async () => {
  const actual = await vi.importActual('./_lib');
  return {
    ...actual,
    getContextCenterId: vi.fn(),
    readEvents: vi.fn(),
    writeEvents: vi.fn(),
    createEvent: vi.fn(),
    deleteEvent: vi.fn(),
    readBody: vi.fn(),
  };
});

import { getContextCenterId, readEvents, writeEvents, createEvent, deleteEvent, readBody } from './_lib';

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

    it('returns 400 if a single-object payload is invalid', async () => {
      const putContext = {
        ...mockContext,
        request: new Request('https://example.com/api/events', {
          method: 'PUT',
          body: JSON.stringify({ not: 'an array' }),
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');
      (readBody as any).mockResolvedValue({ not: 'an array' });
      (createEvent as any).mockRejectedValue(new Error('بيانات الفعالية غير صالحة.'));

      const response = await onRequestPut(putContext);
      expect(response.status).toBe(400);
      const data = await response.json() as { error?: string };
      expect(data.error).toBe('بيانات الفعالية غير صالحة.');
      expect(createEvent).toHaveBeenCalledWith(mockEnv.DB, { not: 'an array' }, 'center_123');
      expect(writeEvents).not.toHaveBeenCalled();
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

    it('routes a single object to the targeted createEvent (parity with POST)', async () => {
      const single = { id: 'evt_9', name: 'Trip' };
      const putContext = {
        ...mockContext,
        request: new Request('https://example.com/api/events', {
          method: 'PUT',
          body: JSON.stringify(single),
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');
      (readBody as any).mockResolvedValue(single);
      (createEvent as any).mockResolvedValue(undefined);

      const response = await onRequestPut(putContext);
      expect(response.status).toBe(200);
      expect(createEvent).toHaveBeenCalledWith(mockEnv.DB, single, 'center_123');
      expect(writeEvents).not.toHaveBeenCalled();
    });
  });

  describe('onRequestPost', () => {
    it('creates ONE event via the targeted helper (never the full list)', async () => {
      const single = { id: 'evt_9', name: 'Trip' };
      const postContext = {
        ...mockContext,
        request: new Request('https://example.com/api/events', {
          method: 'POST',
          body: JSON.stringify(single),
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');
      (readBody as any).mockResolvedValue(single);
      (createEvent as any).mockResolvedValue(undefined);

      const response = await onRequestPost(postContext);
      expect(response.status).toBe(200);
      expect(createEvent).toHaveBeenCalledWith(mockEnv.DB, single, 'center_123');
      expect(writeEvents).not.toHaveBeenCalled();
    });

    it('returns 400 if the payload is an array', async () => {
      const postContext = {
        ...mockContext,
        request: new Request('https://example.com/api/events', {
          method: 'POST',
          body: JSON.stringify([]),
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');
      (readBody as any).mockResolvedValue([]);

      const response = await onRequestPost(postContext);
      expect(response.status).toBe(400);
      const data = await response.json() as { error?: string };
      expect(data.error).toBe('بيانات الفعالية غير صالحة.');
      expect(createEvent).not.toHaveBeenCalled();
    });

    it('maps a foreign-center rejection to 400', async () => {
      const postContext = {
        ...mockContext,
        request: new Request('https://example.com/api/events', {
          method: 'POST',
          body: JSON.stringify({ id: 'evt_other', name: 'Trip' }),
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');
      (readBody as any).mockResolvedValue({ id: 'evt_other', name: 'Trip' });
      (createEvent as any).mockRejectedValue(new Error('الفعالية غير موجودة.'));

      const response = await onRequestPost(postContext);
      expect(response.status).toBe(400);
      const data = await response.json() as { error?: string };
      expect(data.error).toBe('الفعالية غير موجودة.');
    });
  });

  describe('onRequestDelete', () => {
    it('deletes ONE event by id via the targeted helper', async () => {
      const deleteContext = {
        ...mockContext,
        request: new Request('https://example.com/api/events?id=evt_1', {
          method: 'DELETE',
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');
      (deleteEvent as any).mockResolvedValue(undefined);

      const response = await onRequestDelete(deleteContext);
      expect(response.status).toBe(200);
      expect(deleteEvent).toHaveBeenCalledWith(mockEnv.DB, 'evt_1', 'center_123');
      expect(writeEvents).not.toHaveBeenCalled();
    });

    it('returns 400 when the id is missing', async () => {
      const deleteContext = {
        ...mockContext,
        request: new Request('https://example.com/api/events', {
          method: 'DELETE',
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');

      const response = await onRequestDelete(deleteContext);
      expect(response.status).toBe(400);
      const data = await response.json() as { error?: string };
      expect(data.error).toBe('معرّف الفعالية مفقود.');
      expect(deleteEvent).not.toHaveBeenCalled();
    });

    it('maps a foreign/unknown event to 400', async () => {
      const deleteContext = {
        ...mockContext,
        request: new Request('https://example.com/api/events?id=evt_foreign', {
          method: 'DELETE',
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');
      (deleteEvent as any).mockRejectedValue(new Error('الفعالية غير موجودة.'));

      const response = await onRequestDelete(deleteContext);
      expect(response.status).toBe(400);
      const data = await response.json() as { error?: string };
      expect(data.error).toBe('الفعالية غير موجودة.');
    });
  });
});
