import { UserAccount } from './types';
import { loginRequest, logoutRequest, changePasswordRequest, setSessionToken } from './api';

const SESSION_KEY = 'tc_user';

export function loadSessionUser(): UserAccount | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSessionUser(user: UserAccount): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function clearLocalSession(): void {
  localStorage.removeItem(SESSION_KEY);
  setSessionToken(null);
}

/**
 * Clear local storage and instruct server to invalidate session cookie.
 * Use for explicit user logout.
 */
export function clearSessionUser(): void {
  clearLocalSession();
  logoutRequest().catch(() => {
    // Ignore network errors on logout — the cookie will expire naturally.
  });
}

export async function verifyPassword(email: string, password: string): Promise<UserAccount> {
  return loginRequest(email, password);
}

export async function changeAccountPassword(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await changePasswordRequest(email, currentPassword, newPassword);
}
