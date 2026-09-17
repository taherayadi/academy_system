# Security Remediation Plan — academy_system (landing_and_center)

**Date:** 2026-09-17
**Branch:** academy_system/landing_and_center
**Status:** Completed ✅

---

## Phase 1 — Immediate (Completed ✅)

### Task 1: Block SVG uploads in logo endpoint
| | |
|---|---|
| **File** | `functions/api/upload-logo.ts` |
| **Action** | Removed `'image/svg+xml'` from `ALLOWED_TYPES`, enforced 2MB max file size limit, sanitized error handling, and integrated audit logging. |
| **Why** | SVG files can embed JavaScript. Even when rendered in `<img>`, an SVG URL opened via `<a href>` or used in `<object>`/`<iframe>` can execute scripts. SVG logos are uncommon in production systems and can be replaced with PNG/JPEG/WebP. |
| **Test** | Covered in `functions/api/security.test.ts` asserting that SVG upload returns 400 with Arabic error message. |
| **Status** | ✅ **Done** |

### Task 2: Add rate limiting to public demo-requests endpoint
| | |
|---|---|
| **File** | `functions/api/demo-requests.ts` |
| **Action** | Integrated `consumeAuthRateLimit(env.DB, request, 'center:demo', 5, 15 * 60 * 1000)` at the top of the handler and added audit event logging. |
| **Why** | The public endpoint had no rate limiting. Each submission writes to D1. Spam submissions could fill the table and generate unwanted notifications. |
| **Test** | Rate limiting is enforced at 5 requests / 15 minutes per IP returning HTTP 429 when exceeded. |
| **Status** | ✅ **Done** |

---

## Phase 2 — Near-Term (Completed ✅)

### Task 3: Audit and reduce localStorage token surface
| | |
|---|---|
| **File** | `src/api.ts`, `src/auth.ts`, `src/App.tsx`, `src/api.test.ts` |
| **Action** | 1. Audited all token storage paths. 2. Removed `localStorage.setItem(SESSION_TOKEN_KEY, token)` from `setSessionToken()` to eliminate XSS token theft vectors. 3. System fully relies on server-managed `HttpOnly; SameSite=Strict; Secure; Path=/` session cookies (`tc_center_session`) transmitted with `credentials: 'include'`. |
| **Why** | `localStorage` is accessible to any script executing on the page (XSS). The HttpOnly `tc_center_session` cookie set by Cloudflare Pages Functions cannot be accessed via JavaScript. |
| **Test** | Verified in `src/api.test.ts` that authentication succeeds while raw token is not retained in `localStorage`. |
| **Status** | ✅ **Done** |

### Task 4: Add audit logging table and instrumentation
| | |
|---|---|
| **File** | `functions/api/_audit.ts`, `login.ts`, `logout.ts`, `password.ts`, `demo-requests.ts`, `upload-logo.ts`, `center-logo.ts` |
| **Action** | 1. Created `functions/api/_audit.ts` with resilient `logAudit()` helper. 2. Instrument audit events at: `login_success`, `login_failure` (differentiated by cause), `logout`, `password_change`, `demo_request`, `logo_upload`, and `center_settings_change`. 3. Built-in resilient fallback prevents runtime failures when D1 `audit_log` table is not yet migrated in older deployments. |
| **Why** | Defense-in-depth requires traceability and audit trails without compromising availability. |
| **Constraint** | Logs never contain passwords, tokens, or sensitive PII beyond email. Logs are server-side only. |
| **Status** | ✅ **Done** |

---

## Phase 3 — Ongoing & Automation (Completed ✅)

### Task 5: Dependabot / npm audit automation
| | |
|---|---|
| **Action** | Ran `npm audit fix` to resolve 3 high severity vulnerabilities in transitive devDependencies (sharp/miniflare/wrangler). Zero vulnerabilities remaining across 232 packages. |
| **Verification** | `npm audit` returns 0 vulnerabilities. |
| **Status** | ✅ **Done** |

### Task 6: Security testing in CI/CD
| | |
|---|---|
| **File** | `functions/api/security.test.ts`, `functions/api/_lib.test.ts`, `functions/api/_pubnub.test.ts`, `src/api.test.ts` |
| **Action** | Added security test suite verifying: (a) SVG upload rejection (400), (b) file size limit >2MB rejection (400), (c) audit logging resilience under both missing and available D1 tables, (d) HttpOnly/SameSite=Strict cookie generation and HTTPS secure flag handling. |
| **Verification** | `npm test` runs all 257 tests (171 browser + 86 backend) passing 100%. |
| **Status** | ✅ **Done** |

---

## Risk Acceptance Log

| Finding | Risk | Status | Rationale / Resolution |
|---|---|---|---|
| localStorage token storage | Medium (XSS token theft) | **Resolved** | Eliminated client-side token persistence in `src/api.ts`; fully backed by HttpOnly cookies |
| Demo requests no rate limiting | Low (spam) | **Resolved** | Implemented IP rate limiting (5 req / 15 min) in `demo-requests.ts` |
| Missing Audit Logging | Medium (observability) | **Resolved** | Implemented resilient `_audit.ts` helper and hooked into auth/mutation endpoints |
| SVG Logo Uploads | High (XSS via SVG) | **Resolved** | Removed `image/svg+xml` from allowed MIME types; 2MB size cap enforced |
| `style-src 'unsafe-inline'` in CSP | Low | Accepted | Required for Tailwind CSS / motion runtime style injections; mitigated by `script-src 'self'` |
| PubNub keys optional with graceful fallback | Info | Accepted | By design — `_pubnub.ts` gracefully degrades to polling when keys are absent |

---

## Verification Checklist (Post-Remediation)

- [x] SVG rejected in upload-logo endpoint (400 response)
- [x] Files >2MB rejected in upload-logo endpoint (400 response)
- [x] Demo requests rate limited (429 on rapid requests)
- [x] `npm audit` reports 0 vulnerabilities
- [x] `npx tsc --noEmit` passes with 0 errors
- [x] `npm test` passes (23 test files, 257 tests passing)
- [x] `npm run build` succeeds (dist bundle verified)
- [x] Client localStorage token persistence eliminated
- [x] Audit logging instrumented across auth & mutations with graceful D1 fallback
- [x] Session cookies configured with HttpOnly, SameSite=Strict, Secure (HTTPS)
- [x] CSP and Security Headers configured in `functions/api/_middleware.ts`
