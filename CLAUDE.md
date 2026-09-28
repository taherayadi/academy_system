# Repository guide

This is the **public landing application only**. Do not reintroduce center
workspace UI, authentication, platform administration UI, routes or a
deployment-mode switch.

- Frontend: `src/App.tsx` renders only `LandingPage` plus the two public ad
  surfaces (`AdvertisementCarousel`, `AdvertisementInterstitial`); React/Vite/Tailwind.
- Backend: Cloudflare Pages Functions in `functions/api`; shared helpers in `_lib.ts`.
- There are **no authenticated routes here** — no sessions, no cookies, no user
  accounts. The center workspace and the admin console are separate applications.
- `_deployment.ts` marks this as the landing application (fixed source config).
  `_middleware.ts` maintains the exact route/method inventory (3 public routes);
  update it when adding routes.
- Landing-only public APIs: GET `/api/public-pricing`, GET
  `/api/advertisements/active`, POST `/api/demo-requests`. Demo management,
  pricing editing and advertisement editing are not part of this repo.
- Browser API calls stay same-origin (`/api`); Vite proxies local requests to
  Pages port 8788.
- The admin repository owns all shared D1 migrations. Do not create a competing
  migration sequence here.
- Run `npm run lint`, `npm test`, `npm run build`. Node 22.13+ recommended.
