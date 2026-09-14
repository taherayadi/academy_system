# System Academy — Center & Landing

This repository contains **only the public landing page and the center application**.

- Landing: product information, public pricing, advertisements and demo/trial request submission.
- Center workspace: students, academic tracking, attendance, courses, meals, staff, transport, finance, settings and backups.
- Center subscription: view the current subscription and submit/view its own renewal requests.

The SaaS administration console and its management APIs live in
[`taherayadi/academy_system_admin`](https://github.com/taherayadi/academy_system_admin).
There is no platform dashboard, platform navigation, center-account reset, pricing editor,
invoice administration, advertisement editor or renewal approval endpoint here.

## Architecture

React 19 + Vite + Cloudflare Pages Functions, bound to the existing shared D1 database
`academy-system-v2` as `DB`. The two applications are separate deployments, not a runtime mode switch.
Browser requests use relative `/api` URLs and never call the admin backend directly.

| Boundary | This application |
|---|---|
| Roles | `admin`, `super_admin`, `restricted_admin` (all center roles) |
| Session table | `center_sessions` |
| Host-only cookie | `tc_center_session` |
| Client storage | `tc_center_user`, `tc_center_token` |
| Current center | Determined from authenticated user/session, never a query parameter |
| Realtime subscription | Exact read-only `center.{id}` channel |

`platform_super_admin` cannot log in here. Unknown API routes return 404; removed methods
(e.g. PATCH/DELETE `/api/centers`) return 405. Legacy `tc_session`/`sessions` credentials
are intentionally not accepted after the split. Users must log in again.

## Development

Node **22.13+** (Node 22 recommended; SQLite integration tests use `node:sqlite`).

```sh
npm ci
npm run dev          # frontend, port 3000, /api proxy → 8788
npm run pages:dev    # separate terminal, Pages Functions on 8788
npm run lint
npm test
npm run build
```

For local Pages development build first (`npm run build`). Add server secrets to ignored
`.dev.vars`; client configuration belongs in ignored `.env`. See `.env.example`.
Optional: `IMAGEKIT_PRIVATE_KEY`, `PUBNUB_PUBLISH_KEY`, `PUBNUB_SUBSCRIBE_KEY`,
`PUBNUB_SECRET_KEY`; client PubNub subscribe key is `VITE_PUBNUB_SUBSCRIBE_KEY`.
No private key belongs in a `VITE_` variable.

## Database migrations and deployment

**The admin repository is the sole owner of all shared database migrations**, including
historical migrations 0001–0034 and the new `0035_separate_application_sessions.sql`.
Migrations were moved, not applied or used to delete live data. Do not reset the database
or replay historical migrations against an existing deployment.

Follow [DEPLOYMENT_SPLIT.md](DEPLOYMENT_SPLIT.md) to deploy the two applications together.
`wrangler.toml` retains the existing center Pages project and D1 binding. No changes have
been made to production services by editing this repository.

## Security scope

Role/session/deployment separation is enforced on the backend, not only in navigation.
Tests cover the fixed route inventory, foreign roles, cross-origin mutations, and real
SQLite session-table isolation. The shared D1 binding is **not** database-level privilege
isolation: both services are trusted database clients. Existing unrelated security-review
findings (e.g. legacy bulk-write behavior) still require follow-up; this migration is not
a certification that all historical vulnerabilities are fixed.
