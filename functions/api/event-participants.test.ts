import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost, onRequestDelete } from './event-participants';
import { Env } from './_lib';

// Mock _lib helpers
vi.mock('./_lib', async () => {
  const actual = await vi.importActual('./_lib');
  return {
    ...actual,
    getContextCenterId: vi.fn(),
    addEventParticipant: vi.fn(),
    removeEventParticipant: vi.fn(),
    readBody: vi.fn(),
  };
});

import { getContextCenterId, addEventParticipant, removeEventParticipant, readBody } from './_lib';

describe('Event Participants API', () => {
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
    request: new Request('https://example.com/api/event-participants', {
      method: 'POST',
    }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('onRequestPost', () => {
    it('adds ONE participant into ONE event (never the full events list)', async () => {
      const eventId = 'evt_1';
      const participant = { id: 'prt_1', participantName: 'Ali' };

      const postContext = {
        ...mockContext,
        request: new Request('https://example.com/api/event-participants', {
          method: 'POST',
          body: JSON.stringify({ eventId, participant }),
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');
      (readBody as any).mockResolvedValue({ eventId, participant });
      (addEventParticipant as any).mockResolvedValue(undefined);

      const response = await onRequestPost(postContext);
      expect(response.status).toBe(200);
      const data = await response.json() as { ok?: boolean };
      expect(data.ok).toBe(true);
      expect(addEventParticipant).toHaveBeenCalledWith(mockEnv.DB, eventId, participant, 'center_123');
    });

    it('returns 400 if the body is an array', async () => {
      const postContext = {
        ...mockContext,
        request: new Request('https://example.com/api/event-participants', {
          method: 'POST',
          body: JSON.stringify([]),
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');
      (readBody as any).mockResolvedValue([]);

      const response = await onRequestPost(postContext);
      expect(response.status).toBe(400);
      const data = await response.json() as { error?: string };
      expect(data.error).toBe('بيانات المشارك غير صالحة.');
      expect(addEventParticipant).not.toHaveBeenCalled();
    });

    it('maps a missing-eventId error to 400', async () => {
      const postContext = {
        ...mockContext,
        request: new Request('https://example.com/api/event-participants', {
          method: 'POST',
          body: JSON.stringify({ eventId: '', participant: { id: 'prt_1' } }),
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');
      (readBody as any).mockResolvedValue({ eventId: '', participant: { id: 'prt_1' } });
      (addEventParticipant as any).mockRejectedValue(new Error('معرّف الفعالية مفقود.'));

      const response = await onRequestPost(postContext);
      expect(response.status).toBe(400);
      const data = await response.json() as { error?: string };
      expect(data.error).toBe('معرّف الفعالية مفقود.');
    });
  });

  describe('onRequestDelete', () => {
    it('removes ONE participant from ONE event', async () => {
      const deleteContext = {
        ...mockContext,
        request: new Request('https://example.com/api/event-participants?eventId=evt_1&participantId=prt_1', {
          method: 'DELETE',
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');
      (removeEventParticipant as any).mockResolvedValue(undefined);

      const response = await onRequestDelete(deleteContext);
      expect(response.status).toBe(200);
      const data = await response.json() as { ok?: boolean };
      expect(data.ok).toBe(true);
      expect(removeEventParticipant).toHaveBeenCalledWith(mockEnv.DB, 'evt_1', 'prt_1', 'center_123');
    });

    it('returns 400 when a param is missing', async () => {
      const deleteContext = {
        ...mockContext,
        request: new Request('https://example.com/api/event-participants?eventId=evt_1', {
          method: 'DELETE',
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');

      const response = await onRequestDelete(deleteContext);
      expect(response.status).toBe(400);
      const data = await response.json() as { error?: string };
      expect(data.error).toBe('معرّف الفعالية أو المشارك مفقود.');
      expect(removeEventParticipant).not.toHaveBeenCalled();
    });

    it('maps a foreign-event error to 400', async () => {
      const deleteContext = {
        ...mockContext,
        request: new Request('https://example.com/api/event-participants?eventId=evt_foreign&participantId=prt_1', {
          method: 'DELETE',
        }),
      };

      (getContextCenterId as any).mockReturnValue('center_123');
      (removeEventParticipant as any).mockRejectedValue(new Error('الفعالية غير موجودة.'));

      const response = await onRequestDelete(deleteContext);
      expect(response.status).toBe(400);
      const data = await response.json() as { error?: string };
      expect(data.error).toBe('الفعالية غير موجودة.');
    });
  });
});
