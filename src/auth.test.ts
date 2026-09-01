import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadSessionUser,
  saveSessionUser,
  clearLocalSession,
} from './auth';

const SESSION_KEY = 'tc_user';

const mockUser = {
  email: 'test@example.com',
  name: 'Test User',
  role: 'super_admin' as const,
  description: 'test',
};

describe('auth session management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('saveSessionUser', () => {
    it('stores user in localStorage as JSON', () => {
      saveSessionUser(mockUser);
      const raw = localStorage.getItem(SESSION_KEY);
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!)).toEqual(mockUser);
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
});
