# EduSphère — Landing

This repository contains **only the public landing page** for EduSphère.

- Product information (hero, features, module catalogue).
- Public pricing: read-only module prices with the base/add-on simulator.
- Advertisements: public carousel and interstitial surfaces.
- Demo/trial request submission.

There is **no authenticated experience here**. The center workspace (students,
academic tracking, finance, staff, …) and the SaaS administration console are
separate applications in their own repositories. Any login CTA on the landing
page redirects to the center application's URL.

## Architecture

React 19 + Vite + Tailwind 4 frontend, Cloudflare Pages Functions backend bound
to the shared D1 database `academy-system-v2` as `DB`. Browser requests use
relative `/api` URLs and never call another backend directly.

The backend exposes exactly three public routes (see `functions/api/_middleware.ts`):

| Route | Method | Purpose |
|---|---|---|
| `/api/public-pricing` | GET | Public read-only module prices |
| `/api/advertisements/active` | GET | Active ads for the landing surface |
| `/api/demo-requests` | POST | Public demo/trial request submission |

Unknown routes return 404; wrong methods return 405. There are no sessions,
no cookies and no authenticated endpoints in this deployment.

## Development

Node **22.13+** recommended.

```sh
npm ci
npm run dev          # frontend, port 3000, /api proxy → 8788
npm run pages:dev    # separate terminal, Pages Functions on 8788
npm run lint
npm test
npm run build
```

The only backend dependency is the D1 binding; no secrets are required for
local development. The `demo_requests`, `platform_advertisements` and
`module_prices` tables are owned by the admin repository's shared migrations —
do not create a competing migration sequence here.

## Deployment

`npm run build` produces the static bundle in `dist/`; `wrangler pages deploy`
publishes it with the Pages Functions. `wrangler.toml` keeps the shared D1
binding used by the three public routes.
