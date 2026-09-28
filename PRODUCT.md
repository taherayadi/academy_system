# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, two surfaces, one deployment:

- **Public landing:** Tunisian after-school center (سنتر) directors evaluating System Academy. They arrive curious, evaluate in French, and the success action is submitting a demo/trial request (confirmed by the owner — the funnel's front door, not login traffic).
- **Center workspace:** the same center's directors and staff (roles `admin`, `super_admin`, `restricted_admin`) running daily operations. Platform operators are **not** users here — the SaaS admin console is a separate product in a separate repo (`taherayadi/academy_system_admin`).

## Product Purpose

Two surfaces shipped as one app: (1) the **public landing** — product information, public pricing, advertisements, and demo/trial request submission; (2) the **center workspace** — students, academic tracking (suivi scolaire, étude), attendance, courses, meals, library, events & outings, formations, transport, staff, finance, settings and backups, plus subscription status and the center's own renewal requests. Success = centers run their daily operations here and renew; the landing's job is done when a demo request is submitted.

## Positioning

System Academy is the only all-in-one Arabic/RTL management platform for Tunisian after-school centers: étude supervision, suivi scolaire, canteen, library, events & outings, formations and operational finance in one workspace. The landing sells that promise; the workspace is what delivers it. The platform console (separate repo) manages the business *of* the platform; this app is the product centers actually live in.

## Operating Context

- Funnel: a director reads the landing → submits a demo/trial request → the platform console (other repo) converts it into a trial → paid subscription → the center logs into this workspace.
- Public pricing on the landing is **fetched live** from the public pricing endpoint (`src/utils/pricing.ts`) — the same source of truth the platform console administers. The landing never hardcodes prices.
- Advertisements shown inside the workspace (`AdvertisementCarousel`, `AdvertisementInterstitial`) are authored in the platform console; this app only renders them.
- Tunisian business context: Arabic UI inside the workspace, French as the evaluation/business language, TND currency.

## Capabilities and Constraints

- React 19 + Vite SPA + Cloudflare Pages Functions, bound to the shared D1 database `academy-system-v2` shared with the admin app. The two applications are separate deployments, not a runtime mode switch. Browser requests use relative `/api` URLs and never call the admin backend directly.
- Access: center roles only (`admin`, `super_admin`, `restricted_admin`); `platform_super_admin` cannot log in here. Sessions in `center_sessions`, host-only cookie `tc_center_session`. Realtime is a read-only PubNub `center.{id}` channel with graceful degradation to polling.
- Renewal requests: centers submit and view their own; approval lives in the admin console only.
- Landing sections: hero, base offer, modules, pricing, FAQ, contact + demo request form.
- No marketing assets, testimonials, or benchmarks exist in the repo; none may be fabricated.

## Brand Commitments

- Product name: **System Academy** (المنصة — System Academy).
- **The public landing is French, LTR — deliberately.** Confirmed by the owner as a binding choice: directors evaluate in French. This is a commitment, not a localization gap.
- **The center workspace is Arabic-first RTL** — a binding product commitment, not a locale option.

## Evidence on Hand

- `README.md` (architecture, security scope, split-deployment boundary), `DEPLOYMENT_SPLIT.md`.
- Working code: `src/components/LandingPage.tsx` (full landing: hero, base, modules, pricing, FAQ, contact), `Dashboard.tsx` + ~30 module components, `AdvertisementCarousel`/`AdvertisementInterstitial`, `SubscriptionStatusCard`, `RenewalModule`, `src/utils/pricing.ts` (public pricing loader).
- Test suites pin the route inventory, role separation, and session isolation (`api.test.ts`, `auth.test.ts`, module tests).

## Product Principles

1. **The landing sells only what the workspace truly does** — every public claim maps 1:1 to a shipped module; nothing is marketed that isn't in the app.
2. **The demo request is the funnel's front door** — the landing is judged by demo/trial requests submitted, not by page beauty alone.
3. **Arabic-first workspace, French storefront** — RTL is binding inside the app; the landing deliberately speaks the director's evaluation language.
4. **One source of truth for prices** — public pricing is fetched live; what the operator sets is exactly what prospects see, never hardcoded and never stale.
5. **Center trust is the product** — centers renew because daily operations work; the workspace is the deliverable and the landing only opens the door.

## Accessibility & Inclusion

- Center workspace: Arabic-first RTL layout is the baseline requirement; figures and codes stay machine-readable (Latin digits, TND).
- Landing: French LTR. No other product-specific accessibility standard has been established yet.
