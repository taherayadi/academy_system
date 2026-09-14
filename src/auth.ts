/**
 * Platform-console session bootstrap helpers.
 *
 * Storage keys are namespaced `tc_platform_*` so a browser shared with the
 * center application never mixes identities or bearer tokens. The HttpOnly
 * `tc_platform_session` cookie (minted by this app only) is the primary
 * credential; the localStorage token exists for the Bearer-compatibility
 * path and is validated server-side against `platform_sessions` only.
 */
import { UserAccount } from './types';
import { loginRequest, logoutRequest, changePasswordRequest, fetchSessionUserApi, setSessionToken } from './api';

const SESSION_KEY = 'tc_platform_user';

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
 * Clear local storage and instruct server to invalidate the platform session
 * cookie. Use for explicit user logout.
 */
export function clearSessionUser(): void {
  clearLocalSession();
  logoutRequest().catch(() => {
    // Ignore network errors on logout — the cookie will expire naturally.
  });
}

/** Server-side truth check used on boot (cookie or bearer token). */
export async function resolveSessionUser(): Promise<UserAccount | null> {
  try {
    const result = await fetchSessionUserApi();
    if (!result) {
      clearLocalSession();
      return null;
    }
    // Only a platform account may keep this console open; anything else
    // (should never happen — the backend enforces it) is treated as no
    // session and local state is wiped.
    if (result.user.role !== 'platform_super_admin') {
      clearLocalSession();
      return null;
    }
    saveSessionUser(result.user);
    return result.user;
  } catch {
    // Network hiccup: fall back to the locally cached platform identity.
    return loadSessionUser();
  }
}

export async function verifyPassword(email: string, password: string): Promise<{ user: UserAccount }> {
  return loginRequest(email, password);
}

export async function changeAccountPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await changePasswordRequest(currentPassword, newPassword);
}
