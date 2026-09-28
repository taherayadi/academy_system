# Two deployments, one D1 database

## Ownership

| Capability | academy_system | academy_system_admin |
|---|---|---|
| Landing, public prices, demo submission | Yes | No |
| Center operational workspace | Yes | No |
| Own-center subscription summary and renewal request | Yes | No |
| Center creation, plan/pricing management, invoices, ads, renewal decisions | No | Yes |
| Database migrations | No | Sole owner |
| Sessions/cookie | center_sessions / tc_center_session | platform_sessions / tc_platform_session |
| Allowed account roles | admin, super_admin, restricted_admin | platform_super_admin |

The same `users` and `centers` rows remain in the existing database. Center `super_admin`
is **not** a platform role. Neither role promotion nor password changes are performed
by migration 0035. No center/student/payment data is copied or deleted by that migration.

## Safe rollout

1. Back up/export the production D1 database and verify the backup. Audit existing platform
   accounts and ensure at least one unique, working `platform_super_admin` credential.
   Verify that every center user has the correct explicit `users.center_id`; missing/invalid
   associations are rejected rather than silently assigned to the default tenant.
   Do not promote all center administrators. The admin repo includes an offline provisioning
   script for a new account if necessary; do not use a published/default password.
2. In the **admin repository**, inspect applied migration history, then apply pending migrations:
   `npx wrangler d1 migrations list academy-system-v2 --remote`, then
   `npm run d1:migrate`. Existing deployments should already have 0001–0034; the intended
   new migration is 0035. Never reset migration history or reapply all old SQL blindly.
3. Create a separate Cloudflare Pages project named `system-academy-admin` using the admin repo.
   Build command `npm run build`; output directory `dist`; Node version 22.
   Set `DB` to the **same existing** `academy-system-v2` D1 database in the same Cloudflare account.
4. Configure each project's server secrets independently (ImageKit and optional PubNub).
   Add only public client configuration at build time. No cross-service API URL or CORS
   bridge is needed. Use distinct HTTPS hostnames; session cookies have no Domain attribute.
5. Deploy the admin application first and verify platform login, center list, pricing,
   billing and renewal decisions on an isolated preview database before production.
   The old combined center application still exists until the following step, so keep this
   overlap short and restrict access to old platform functionality during the cutover.
6. Deploy this repository to the existing `system-academy` center Pages project.
   Require all users to log in again. Do not migrate old bearer tokens into either new table.
7. Verify: landing and anonymous demo submission work; center accounts see only their center;
   center credentials are denied on admin; platform credentials are denied on center;
   removed center `/api/platform-*` routes return 404, management methods return 405;
   renewals submitted on center appear in admin and decisions become visible on center.
8. Remove old deployments/custom-domain aliases serving the combined application and review
   Cloudflare preview access. Old revisions must not remain publicly reachable as a bypass.
   Expire/delete legacy `sessions` rows once rollback is no longer needed.

**Do not point untrusted public previews at production D1.** Give previews an isolated
D1 copy/test database and separate third-party keys. Configure bindings in the Cloudflare
project as appropriate; the committed production D1 ID is not an access credential.

## Local development with a shared local D1

Both projects can use Wrangler's same persistence directory to simulate the shared database.
From the admin checkout (replace the absolute directory with your local path):

```sh
npx wrangler d1 migrations apply academy-system-v2 --local --persist-to /absolute/path/shared-d1
npm run build
npx wrangler pages dev dist --ip 0.0.0.0 --port 8789 --persist-to /absolute/path/shared-d1
```

From the center checkout:

```sh
npm run build
npx wrangler pages dev dist --ip 0.0.0.0 --port 8788 --persist-to /absolute/path/shared-d1
```

Each serves its own built frontend and API at one origin. For simultaneous Vite development,
use center frontend 3000/API 8788 and admin frontend 3001/API 8789 (admin Vite proxy is configured
for 8789). Host-only cookies do not isolate ports on localhost; distinct cookie names do.
The browser never needs to call the other app's port directly.

## Rollback and limitations

Migration 0035 is additive; leave its tables in place during rollback. Do not remove/reseed
users or centers. Rolling back to the old combined service reintroduces its security issues
and old credential acceptance; prefer fixing forward and restrict access during emergencies.

Separate backends enforce application authorization, not SQL-user/table privileges. Both D1
bindings retain database access. A backend compromise is still a shared-database risk.
Bearer-token storage is now namespaced but remains JavaScript-readable (a cookie-only migration
is separate work). Other pre-split review items remain tracked in the historical review in the
admin repository. Expired/suspended centers still cannot start a normal center session; renewal
access for already-expired accounts needs a dedicated restricted flow, not an anonymous exception.
