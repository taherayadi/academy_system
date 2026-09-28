import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateSession } from './_lib';
import { onRequestPost as uploadLogoHandler } from './upload-logo';
import { logAudit } from './_audit';

vi.mock('./_lib', async importOriginal => {
  const actual = await importOriginal<typeof import('./_lib')>();
  return {
    ...actual,
    validateSession: vi.fn(),
  };
});

describe('Security Controls Test Suite', () => {
  describe('Upload Logo Endpoint (SVG blocking & file limits)', () => {
    const validSession = {
      email: 'admin@academy.tn',
      token: 'session-token-123',
      centerId: 'center_test_1',
      role: 'admin',
    };

    beforeEach(() => {
      vi.mocked(validateSession).mockReset();
    });

    it('blocks SVG uploads with 400 Bad Request', async () => {
      vi.mocked(validateSession).mockResolvedValue(validSession);

      const formData = new FormData();
      const svgFile = new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'logo.svg', {
        type: 'image/svg+xml',
      });
      formData.append('file', svgFile);

      const request = new Request('https://academy.test/api/upload-logo', {
        method: 'POST',
        body: formData,
      });

      const env = {
        DB: {},
        IMAGEKIT_PRIVATE_KEY: 'test_private_key',
      };

      const res = await uploadLogoHandler({
        env: env as any,
        request,
      } as any);

      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string };
      expect(data.error).toContain('صيغة الصورة غير مدعومة');
    });

    it('blocks files larger than 2MB with 400 Bad Request', async () => {
      vi.mocked(validateSession).mockResolvedValue(validSession);

      const formData = new FormData();
      // 2.5 MB fake png
      const largeContent = new Uint8Array(2.5 * 1024 * 1024);
      const largeFile = new File([largeContent], 'big-logo.png', {
        type: 'image/png',
      });
      formData.append('file', largeFile);

      const request = new Request('https://academy.test/api/upload-logo', {
        method: 'POST',
        body: formData,
      });

      const env = {
        DB: {},
        IMAGEKIT_PRIVATE_KEY: 'test_private_key',
      };

      const res = await uploadLogoHandler({
        env: env as any,
        request,
      } as any);

      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string };
      expect(data.error).toContain('حجم الصورة كبير جداً');
    });
  });

  describe('Audit Logging Resilience', () => {
    it('does not throw or reject when D1 audit_log table does not exist', async () => {
      const failingDb = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockRejectedValue(new Error('no such table: audit_log')),
          }),
        }),
      };

      const request = new Request('https://academy.test/api/auth/login');
      await expect(
        logAudit({ DB: failingDb as any }, request, {
          email: 'test@example.com',
          action: 'login_success',
          ip: '127.0.0.1',
        })
      ).resolves.toBeUndefined();
    });

    it('writes to audit_log table when table is available', async () => {
      const runMock = vi.fn().mockResolvedValue({ success: true });
      const bindMock = vi.fn().mockReturnValue({ run: runMock });
      const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });
      const mockDb = { prepare: prepareMock };

      const request = new Request('https://academy.test/api/auth/login');
      await logAudit({ DB: mockDb as any }, request, {
        email: 'test@example.com',
        action: 'login_success',
        entityType: 'center',
        entityId: 'c1',
        ip: '1.2.3.4',
      });

      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_log'));
      expect(bindMock).toHaveBeenCalledWith(
        'test@example.com',
        'login_success',
        'center',
        'c1',
        null,
        '1.2.3.4',
        expect.any(Number)
      );
      expect(runMock).toHaveBeenCalled();
    });
  });
});
