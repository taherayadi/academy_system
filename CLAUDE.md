# Repository guide

This is the **center and public landing application**. Do not reintroduce platform administration UI, routes or a deployment-mode switch.

- Frontend: `src/App.tsx`, center modules under `src/components`, React/Vite/Tailwind.
- Backend: Cloudflare Pages Functions in `functions/api`; shared tenant data helpers in `_lib.ts`.
- Authentication: center roles `admin`, `super_admin`, `restricted_admin` only. `platform_super_admin` belongs to the other application.
- `_deployment.ts` is fixed source configuration. `_middleware.ts` maintains the exact route/method inventory; update it when adding routes.
- `center_sessions` and host-only `tc_center_session` are isolated from the other application's credentials. Never accept the legacy shared session table/cookie.
- Derive center identity from the authenticated context; every data query/mutation must verify tenant ownership.
- Landing-only public APIs: GET pricing/active ads, POST demo requests; demo management is not part of this repo.
- GET `/api/centers` returns only the caller's center; renewal GET/POST are center-scoped. There are no center-management mutation routes here.
- Browser API calls stay same-origin (`/api`); Vite proxies local requests to Pages port 8788.
- The admin repository owns all shared D1 migrations. Do not create a competing migration sequence here.
- Run `npm run lint`, `npm test`, `npm run build`. Node 22.13+ is needed for SQLite integration tests.
- See `README.md` and `DEPLOYMENT_SPLIT.md` for operation and rollout instructions.
