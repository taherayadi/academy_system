<!-- SYNC IMPACT REPORT
Resolution: constitution-template via resolve-template.ps1 (success)
Version change: none → 1.0.0 (initial ratification; prior file was the unratified placeholder scaffold)
Modified principles: none (all five principles newly defined)
Added sections: Core Principles (I–V), Security & Session Isolation,
  Development Workflow & Quality Gates, Governance
Removed sections: none (placeholder scaffold replaced in full)
Follow-up TODOs: none
-->

# EduSphère (System Academy) Constitution

## Core Principles

### I. Deployment Split Is Non-Negotiable

This repository contains ONLY the public landing page and the center
application. Platform administration UI, platform routes, center-account
reset, pricing editors, advertisement editors, invoice administration, or
renewal-approval endpoints MUST NOT be reintroduced here, and a
deployment-mode switch MUST NOT be created. `platform_super_admin` MUST NOT
be able to authenticate to this application. The SaaS admin console lives in
its own repository and remains the sole owner of all shared D1 migrations;
this repository MUST NOT create a competing migration sequence or replay
historical migrations against a live deployment.

Rationale: the two applications are separate deployments, not runtime
modes. Mixing them re-opens cross-tenant attack surface that the split was
performed to close.

### II. Tenant Isolation by Authenticated Context

Center identity MUST always be derived from the authenticated session —
never from a query parameter or client-supplied payload. Every data query
and mutation MUST verify tenant ownership against the caller's center.
Only center roles (`admin`, `super_admin`, `restricted_admin`) MAY
authenticate. Session state MUST live in `center_sessions` with the
host-only `tc_center_session` cookie; legacy shared `tc_session`/`sessions`
credentials MUST be rejected. The shared D1 binding is trusted-client
access, not database-level privilege isolation, so application-level
ownership checks are the actual isolation boundary and MUST NOT be skipped.

Rationale: one shared database serves multiple deployments; a missing
ownership predicate is a cross-tenant data leak.

### III. Security by Default (NON-NEGOTIABLE)

Every externally reachable endpoint MUST enforce authentication (except the
fixed public set: login, logout, demo-request submission, public pricing,
active advertisements), rate limiting on unauthenticated writes, and
audit logging on security-relevant events. Uploads MUST whitelist content
types (SVG is permanently rejected) and cap payload size (2 MB). Secrets
MUST live in `.dev.vars`/server bindings and MUST NOT appear in any
`VITE_` variable. Client tokens MUST NOT be persisted to `localStorage`;
the HttpOnly session cookie is the sole credential carrier. Error
responses MUST NOT echo internal upstream details.

Rationale: these controls were adopted after a documented security
remediation (SECURITY_PLAN); regression here is a production incident, not
a style issue.

### IV. Exact Contract Surface

`functions/api/_middleware.ts` maintains the exact route/method inventory;
adding, removing, or changing any API route MUST update that inventory in
the same change. Unknown routes MUST return 404 and removed methods MUST
return 405. Browser API calls MUST stay same-origin (relative `/api`
URLs); the frontend MUST never call the admin backend directly. Landing
public APIs are limited to GET pricing, GET active ads, and POST demo
requests. Every new route MUST arrive with tests covering foreign roles,
cross-origin mutations, and session isolation.

Rationale: the route inventory is the enforceable statement of what this
deployment is; drift between it and handlers silently widens the attack
surface.

### V. Test-First Verification

No change is complete without: `npm run lint` (tsc), `npm test` (vitest,
including real SQLite integration tests via `node:sqlite` on Node 22.13+),
and `npm run build` passing. Security-relevant behavior (SVG rejection,
rate limits, token storage, role rejection, route inventory) MUST be
covered by automated tests, and fixes MUST land together with the test
that proves them. Manual verification alone is not acceptance.

Rationale: the test suite encodes the split, isolation, and security
contracts above; it is the only mechanism that keeps them true while the
application evolves.

## Security & Session Isolation Constraints

- Session table: `center_sessions`; cookie: host-only, `HttpOnly`,
  `SameSite=Strict`, `Secure`, `Path=/`; name `tc_center_session`.
- Client storage keys are limited to non-sensitive display data
  (`tc_center_user`); the raw session token MUST NOT be stored client-side.
- Audit events MUST NOT contain passwords, tokens, or PII beyond email;
  audit logging MUST degrade gracefully (never break the request path).
- The realtime subscription is an exact read-only `center.{id}` channel.
- `GET /api/centers` returns only the caller's center; renewal routes are
  center-scoped. No center-management mutation routes exist here.
- Dependabot/npm-audit findings in dependencies MUST be triaged; known
  historical findings outside this repository's scope remain tracked in
  the security review documents and are not closed by this constitution.

## Development Workflow & Quality Gates

1. Branches: center/landing work happens on this repository's feature
   branches; the admin repository is separate and owns shared migrations.
2. Local development: `npm run dev` (frontend, port 3000, `/api` proxy to
   8788) plus `npm run pages:dev` (Functions, port 8788) in a second
   terminal; a local Pages build requires `npm run build` first.
3. Quality gates, all mandatory before merge: `npm run lint`, `npm test`,
   `npm run build`.
4. Environment: Node 22.13+ is required (SQLite integration tests use
   `node:sqlite`). Server secrets belong in ignored `.dev.vars`; client
   configuration in ignored `.env` (see `.env.example`).
5. Deployment follows `DEPLOYMENT_SPLIT.md`; no deployment proceeds with
   failing gates, and no production database reset or historical migration
   replay is ever performed.

## Governance

This constitution supersedes any conflicting practice, README guidance, or
ad-hoc decision within this repository. Amendments MUST be documented in
this file with an updated version and amendment date, follow the semantic
versioning policy below, and state a migration or compatibility plan for
any behavior they change. All pull requests and code reviews MUST verify
compliance with Principles I–V; a reviewer MUST reject changes that
reintroduce platform administration surface, weaken tenant-ownership
checks, bypass a quality gate, or add routes without updating the
middleware inventory. Complexity or exceptions MUST be justified in the
pull request description, not assumed.

**Version**: 1.0.0 | **Ratified**: 2026-09-23 | **Last Amended**: 2026-09-23
