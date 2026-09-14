import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadSessionUser,
  saveSessionUser,
  clearLocalSession,
} from './auth';

vi.mock('./api', () => ({
  loginRequest: vi.fn(),
  logoutRequest: vi.fn().mockResolvedValue(undefined),
  changePasswordRequest: vi.fn().mockResolvedValue(undefined),
  fetchSessionUserApi: vi.fn().mockResolvedValue(null),
  setSessionToken: vi.fn(),
  getSessionToken: vi.fn().mockReturnValue(null),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

import { fetchSessionUserApi } from './api';
import { resolveSessionUser } from './auth';

// The platform application must never reuse the center app's storage keys.
const SESSION_KEY = 'tc_platform_user';
const LEGACY_CENTER_KEY = 'tc_user';
const LEGACY_CENTER_TOKEN_KEY = 'tc_token';

const mockUser = {
  email: 'test@example.com',
  name: 'Test User',
  role: 'platform_super_admin' as const,
  description: 'test',
};

describe('auth session management (platform namespace)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('saveSessionUser', () => {
    it('stores user in localStorage as JSON under the platform key', () => {
      saveSessionUser(mockUser);
      const raw = localStorage.getItem(SESSION_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!)).toEqual(mockUser);
    });

    it('never touches the center app keys', () => {
      saveSessionUser(mockUser);
      expect(localStorage.getItem(LEGACY_CENTER_KEY)).toBeNull();
      expect(localStorage.getItem(LEGACY_CENTER_TOKEN_KEY)).toBeNull();
    });
  });

  describe('loadSessionUser', () => {
    it('returns null when no session exists', () => {
      expect(loadSessionUser()).toBeNull();
    });

    it('returns parsed user when session exists', () => {
      localStorage.setItem(SESSION_KEY, JSON.stringify(mockUser));
      const user = loadSessionUser();
      expect(user).toEqual(mockUser);
    });

    it('returns null when stored value is invalid JSON', () => {
      localStorage.setItem(SESSION_KEY, 'not-valid-json');
      expect(loadSessionUser()).toBeNull();
    });

    it('returns null when stored value is empty string', () => {
      localStorage.setItem(SESSION_KEY, '');
      expect(loadSessionUser()).toBeNull();
    });
  });

  describe('clearLocalSession', () => {
    it('removes session from localStorage', () => {
      localStorage.setItem(SESSION_KEY, JSON.stringify(mockUser));
      expect(localStorage.getItem(SESSION_KEY)).toBeTruthy();
      clearLocalSession();
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    });

    it('does not throw when no session exists', () => {
      expect(() => clearLocalSession()).not.toThrow();
    });
  });

  describe('resolveSessionUser — server is the authority', () => {
    it('accepts a platform_super_admin confirmed by /api/auth/me', async () => {
      vi.mocked(fetchSessionUserApi).mockResolvedValueOnce({ user: mockUser });
      const user = await resolveSessionUser();
      expect(user).toEqual(mockUser);
      expect(localStorage.getItem(SESSION_KEY)).toBeTruthy();
    });

    it('clears local state when the server has no session', async () => {
      saveSessionUser(mockUser);
      vi.mocked(fetchSessionUserApi).mockResolvedValueOnce(null);
      const user = await resolveSessionUser();
      expect(user).toBeNull();
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    });

    it('refuses to accept a center-role identity even if returned', async () => {
      saveSessionUser(mockUser);
      vi.mocked(fetchSessionUserApi).mockResolvedValueOnce({
        user: { ...mockUser, role: 'admin' as any, centerId: 'c1' },
      });
      const user = await resolveSessionUser();
      expect(user).toBeNull();
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    });
  });
});
