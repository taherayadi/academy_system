# Security Review Report — academy_system (landing_and_center)

**Date:** 2026-09-17
**Branch:** academy_system/landing_and_center
**Scope:** Frontend (`src/`), Backend Cloudflare Pages Functions (`functions/api/`), shared helpers (`functions/api/_lib.ts`, `_middleware.ts`, `_deployment.ts`, `_validate-env.ts`)

---

## Executive Summary

A comprehensive security review of the academy system center application was conducted covering authentication, authorization, session management, input validation, SQL injection prevention, XSS/CSRF defenses, security headers, secrets management, error handling, and dependency posture. The application demonstrates **strong security fundamentals** — bcrypt password hashing, HttpOnly/SameSite=Strict session cookies, parameterized D1 queries, tenant-scoped data access, role-based authorization, auth rate limiting, and security headers. The existing `SECURITY_REPORT.md` remediation work (fixed prompt defenses, enhanced CSP, env validation helpers, standardized error messages) was verified and confirmed effective.

**Overall Posture: Grade A (95/100)** — confirmed from prior review; no new critical/high findings identified in this pass.

Two medium-priority findings and three low-priority recommendations are documented below.

---

## Findings

### MEDIUM — Session Token Storage in localStorage (AUTH-XSS)

| | |
|---|---|
| **Location** | `src/api.ts:6` (`SESSION_TOKEN_KEY = 'tc_center_token'`), `src/api.ts:28-35` (`setSessionToken`/`getSessionToken`), `src/auth.ts:4` (`SESSION_KEY = 'tc_center_user'`) |
| **Risk** | Cross-Site Scripting (XSS) token theft |
| **Severity** | Medium |

**Description:** The client stores the session bearer token in `localStorage` (`tc_center_token`) and the user profile in `localStorage` (`tc_center_user`). While the server also sets an `HttpOnly; SameSite=Strict` cookie (`tc_center_session`) and the middleware accepts either the cookie or the Bearer token for auth (`_lib.ts:207-224`), the Bearer-token path is actively used by the client (`api.ts:42-44`). Any successful XSS on the page can exfiltrate the token from `localStorage`, granting the attacker full API access as that user.

**Evidence:**
```typescript
// src/api.ts:30 — token stored in localStorage
if (token) localStorage.setItem(SESSION_TOKEN_KEY, token);

// src/auth.ts:16 — user profile stored in localStorage
localStorage.setItem(SESSION_KEY, JSON.stringify(user));
```

**Recommendation:** Migrate session state to an `HttpOnly` cookie (set by the server on `/api/auth/login`) and read it automatically by the browser on every same-origin request. Remove the `localStorage.setItem(SESSION_TOKEN_KEY)` and `localStorage.setItem(SESSION_KEY)` calls. If the SPA architecture requires client-side token access (e.g. for an interceptors pattern), at minimum:
1. Sanitize all user-rendered content (no `dangerouslySetInnerHTML` found ✅ but validate all new code).
2. Implement a strict Content-Security-Policy with `script-src 'self'` (current CSP already requires this ✅).
3. Add runtime XSS defenses (DOMPurify for any rich-text rendering).

**Current mitigation:** The strict CSP (`script-src 'self'`, no `'unsafe-inline'`/`'unsafe-eval'` for scripts) makes typical XSS injection harder. The `_lib.ts` server-side also accepts the `tc_center_session` HttpOnly cookie as an alternative auth path.

---

### MEDIUM — SVG Upload Allowed in Logo Upload (UPLOAD-XSS)

| | |
|---|---|
| **Location** | `functions/api/upload-logo.ts:5` |
| **Risk** | Stored XSS via SVG content |
| **Severity** | Medium |

**Description:** `upload-logo.ts` allows `image/svg+xml` as an accepted file type:

```typescript
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
```

SVG files are XML documents that can embed JavaScript (`<script>` tags, `<foreignObject>`, event handlers like `onload`, XSS via `<set>`/`<animate>`). When an SVG is subsequently rendered via `<img src="...">` it typically does **not** execute scripts (browsers treat SVGs in `<img>` tags as images). However, if the URL is ever rendered via an `<a href>` link opened in a context that processes the SVG as a document, or if an `<object>`/`<iframe>` tag is used, the script would execute.

The logo URL is stored in the database (`upload-logo.ts:51` returns `ikData.url`) and later displayed in `LoginScreen.tsx:80` via `<img src={icon}>` (safe image tag). The `saveCenterLogoApi` path stores a URL that is rendered by the center application.

**Recommendation:** Remove `'image/svg+xml'` from `ALLOWED_TYPES` unless there is a documented requirement for SVG logos. SVG logos are uncommon in enterprise/production systems; PNG/JPEG/WebP cover 99% of use cases. If SVG support is needed, implement server-side SVG sanitization (strip `<script>`, event handlers, foreignObject) before uploading to ImageKit.

---

### LOW — PubNub `.env.example` Contains Placeholder Keys (INFO)

| | |
|---|---|
| **Location** | `.env.example:7-8` |
| **Risk** | Information disclosure / credential probing |
| **Severity** | Low |

**Description:** `.env.example` contains:
```
VITE_PUBNUB_PUBLISH_KEY=demo
VITE_PUBNUB_SUBSCRIBE_KEY=demo
```
While these are explicitly placeholders (not real keys) and the file is intentionally committed (per `.gitignore:14: !.env.example`), any automated scanner that flags `demo` as a credential is a false positive. This is acceptable.

**Current status:** ✅ No action required — `demo` is clearly a placeholder and `_pubnub.ts:44-50` returns `null` (graceful fallback to polling) when real keys are absent.

---

### LOW — Public Demo Requests Endpoint Lacks Rate Limiting (RATE-DEMO)

| | |
|---|---|
| **Location** | `functions/api/demo-requests.ts` (public endpoint, no auth) |
| **Risk** | Denial of service / spam |
| **Severity** | Low |

**Description:** The `POST /api/demo-requests` endpoint is public (listed in the `PUBLIC` set in `_middleware.ts:6`) but has no rate limiting. A malicious actor could submit unlimited demo requests, filling the database and generating unwanted notifications.

**Recommendation:** Add a lightweight rate limiter (e.g. 5 requests per IP per 15 minutes) or integrate Cloudflare Bot Management / Turnstile challenge on the landing form. Note: the endpoint already writes to D1 (synchronous, not fire-and-forget) so each submission has a real cost.

---

### LOW — Missing Audit Logging for Sensitive Operations (AUDIT)

| | |
|---|---|
| **Location** | All API handlers (`functions/api/`) |
| **Risk** | Insufficient accountability for privileged actions |
| **Severity** | Low |

**Description:** The application does not log audit events for sensitive operations (login success/failure, password changes, session creation/destruction, data mutations). `login.ts` does not log successful logins. `password.ts` logs no password change events. `logout.ts` logs only on error (`console.error`).

**Recommendation:** Add structured audit logging (to a D1 table or Cloudflare Logs) for: successful/failed logins, password changes, role changes, center setting modifications, and demo request submissions. Ensure logs do not contain PII beyond email and do not contain passwords/tokens.

---

## Confirmed Secure (from prior review and verified in this pass)

| Control | Verification |
|---|---|
| **Password hashing** — bcrypt, salt 10 | `_lib.ts:112-119` — `bcrypt.genSalt(10)` + `bcrypt.hash`/`bcrypt.compare` |
| **SQL injection prevention** — all parameterized | Verified: `.bind()` used in login, students, state, sessions, public-pricing, renewal-requests, demo-requests, upload-logo, center-logo, password change |
| **Session cookies** — HttpOnly, SameSite=Strict, Secure when HTTPS | `_lib.ts:281-290` — `makeSessionCookie` / `clearSessionCookie` |
| **Auth rate limiting** — 10 req/min on auth endpoints | `_lib.ts:152-189` — `consumeAuthRateLimit` / `resetAuthRateLimit` on `login.ts` and `password.ts` |
| **Authorization** — role-based via `isDeploymentRole` | `_deployment.ts:3-5` — only `admin`, `super_admin`, `restricted_admin` allowed |
| **Tenant isolation** — all queries scoped by `center_id` | Verified: students.ts, state.ts, sessions.ts, courses.ts, expenses.ts, etc. all use `getContextCenterId(context)` → `context.data.session.centerId` |
| **Session validation** — expiry + center status check | `_lib.ts:251-265` — `validateSession` checks `expires_at > now`, role, and `getCenterAccessState` (trial/subscription/suspended/expired) |
| **Security headers** — CSP, X-Frame-Options, Referrer-Policy | `_middleware.ts:30-47` — full CSP with `script-src 'self'`, `frame-src 'none'`, `object-src 'none'` |
| **Error handling** — generic error messages | `SECURITY_REPORT.md` confirms all 47 catch blocks fixed; `login.ts:110`, `password.ts:58`, `logout.ts:21` return fixed Arabic messages |
| **No hardcoded secrets** | Confirmed — `_deployment.ts:2` is a constant string (`'center'`), not a secret |
| **Environment variable validation** | `_validate-env.ts` — `requireImageKitKey()` enforced at route entry in `upload-logo.ts` |
| **`.env*` in `.gitignore`** | `.gitignore:13` — `!.env.example` (example intentionally committed) |
| **File upload validation** | `upload-logo.ts:28-33` — type whitelist + 2MB size limit |
| **Input sanitization** | `demo-requests.ts:6-16` — all fields `String(...).trim()`; `login.ts:22-23` — email lowercased, both trimmed |
| **Cross-origin protection** | `_middleware.ts:20-22` — non-GET requests with mismatched `Origin` rejected with 403 |
| **CSP** — `style-src 'self' 'unsafe-inline'` | Intentional for Tailwind CSS at build time; documented tradeoff in `SECURITY_REPORT.md` |
| **Cache control** — `no-store` on all responses | `_middleware.ts:31` + `_lib.ts:94` (`json` helper sets `Cache-Control: no-store`) |
| **XSS** — no `dangerouslySetInnerHTML`, no `eval()`/`Function()` | Grep confirmed absent across all `.ts/.tsx` files |
| **Password change validation** — 12 char minimum, 72 byte max | `password.ts:31-33` — explicit length and byte limit check |
| **User enumeration prevention** — generic login error | `login.ts:36, 41` — both invalid email and wrong password return the same "كلمة السر غير صحيحة" message |
| **PubNub graceful fallback** | `_pubnub.ts:44-50` — returns null (no throw) when keys missing; client falls back to polling |

---

## Security Posture Summary

| Category | Status | Notes |
|---|---|---|
| Authentication | ✅ Secure | bcrypt, rate-limited, role-enforced, generic error messages |
| Authorization | ✅ Secure | `isDeploymentRole` checks, tenant isolation on all endpoints |
| Session Management | ⚠️ Medium | HttpOnly cookie set server-side; but token also stored in localStorage |
| SQL Injection | ✅ Secure | All D1 queries parameterized with `.bind()` |
| XSS | ✅ Mostly Secure | No `dangerouslySetInnerHTML`, no `eval()`, strict CSP; SVG upload is vector |
| CSRF | ✅ Adequate | SameSite=Strict cookies; non-GET cross-origin rejected by middleware |
| Security Headers | ✅ Secure | CSP, X-Frame-Options, Referrer-Policy, X-Content-Type-Options all set |
| Rate Limiting | ⚠️ Partial | Auth endpoints protected; public demo-requests endpoint unprotected |
| Secrets Management | ✅ Secure | No hardcoded secrets; env vars via Cloudflare Pages bindings |
| Error Handling | ✅ Secure | Generic messages; internal details to console only |
| File Upload | ⚠️ Medium | Type/size validated; SVG format allows embedded scripts |
| Audit Logging | ⚠️ Low | No structured audit trail for sensitive operations |
| Input Validation | ✅ Secure | All endpoints trim/validate input before use |

---

## Remediation Priority

1. **HIGH** — Remove `image/svg+xml` from `upload-logo.ts` ALLOWED_TYPES (or add server-side SVG sanitization)
2. **MEDIUM** — Plan migration away from `localStorage` token storage toward HttpOnly-only auth (longer-term; assess risk vs. SPA architecture needs)
3. **LOW** — Add rate limiting to public demo-requests endpoint
4. **LOW** — Add audit logging for login, password change, and privileged mutations
