# System Academy

A full-stack, web-based management application for student tutoring centers, built for the Tunisian education system.

## Overview

System Academy is a Cloudflare Pages application backed by a Cloudflare D1 (SQLite) database. It manages every aspect of a student tutoring center — student enrollment, grade tracking, meal planning, staff payroll, course scheduling, and AI-powered data analysis.

## Key Features

### Student Management
- Full student profiles: name, birth date, grade, parent information (mother & father), siblings, authorized persons, allergies, academic history
- Electronic signatures for registration confirmation
- AI-powered PDF import from scanned registration forms (Google Gemini)
- Service enrollment: Suivi, Étude, Library, and Meals per student

### Étude Module
- Weekly time-slot scheduling (Monday–Saturday)
- Teacher assignment per slot
- Student enrollment per slot with attendance tracking
- Extra-hours detection outside the teacher's regular schedule

### Academic Tracking (Suivi Scolaire)
- Track grades per trimester per subject
- Tunisian curriculum: Arabic, French, Math, Physics, SVT, English, IT, Philosophy, History-Geography, Economics
- Devoir 1, Devoir 2, and Synthèse grades
- Average calculations and at-risk student identification

### External Courses & Revision Sessions
- External teacher management (subject, grade level, monthly fee)
- Per-session attendance and payment tracking
- Teacher share vs. center share revenue split
- Global student register shared across all courses

### Meals Module
- Weekly meal plan editor (Monday–Friday)
- Subscription or unit payment modes
- Daily attendance tracking and dish popularity analysis

### Finance
- Student payment ledger with receipt generation
- Service-based income breakdown (Suivi, Étude, Library, Meals, Courses, Revision, Assurance, Inscription)
- Expense tracking by category
- Cheque payment management with cashing status
- Monthly financial summaries

### Staff Management
- Employee profiles, contract type, CNSS number, salary, subjects
- Weekly schedule, monthly timesheets, leave & advance workflows
- Payslip generation with CNSS deductions, bonus, extra hours

### Data Analysis (AI-Powered)
- Center performance per school year, trimester, month
- Per-service income breakdown with visual bars
- AI-generated insights (Google Gemini)

### Settings & Administration
- Configurable fee structure per academic year
- Center information (name, phone, city)
- Gemini API key configuration
- JSON backup export/import
- Multi-user authentication (Super Admin / Restricted Admin)

## Tech Stack

| Layer | Technology |
|---|---|
| **Hosting** | Cloudflare Pages |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS 4 |
| **UI** | Lucide React icons, Motion animations |
| **Database** | Cloudflare D1 (SQLite) |
| **AI** | Google Gemini API |
| **API** | Cloudflare Pages Functions |
| **Testing** | Vitest |

## Project Structure

```
system_academy/
├── functions/            # Cloudflare Pages Functions (API + D1 access)
│   └── api/              # Route handlers + _lib.ts data layer
├── migrations/           # D1 SQL migrations (0001_init.sql = full schema)
├── src/
│   ├── components/       # Feature modules (Dashboard, Finance, Staff, etc.)
│   ├── utils/            # AI helpers, logging, formatting
│   ├── App.tsx           # Root state management
│   ├── api.ts            # API client
│   └── types.ts          # TypeScript interfaces & helpers
└── wrangler.toml         # Cloudflare config (Pages + D1 binding)
```

## Running Locally

### Prerequisites
- Node.js (suggested 18+ LTS)
- A Cloudflare account with D1 + Pages

### Install
```bash
npm install
```

### Development
```bash
npm run dev
```

### Pages Functions dev (local)
```bash
npm run pages:dev
```

### Database migrations
```bash
npm run d1:migrate:local    # apply to local D1
npm run d1:migrate          # apply to remote D1
```

### Tests
```bash
npm test
```

## Realtime live sync (PubNub) & polling fallback

Subscription events (renewal accepted/refused, plan changes, center edits, new
renewal requests) reach the center app and the platform dashboard in ~2 seconds
through **PubNub pub/sub** instead of waiting for the polling cycle. Messages
are **"refetch" signals only**: on receipt every client re-runs the same
fetch/snapshot/toast handlers it already had — pushed payloads are never
trusted.

### Architecture

| Piece | Role |
|---|---|
| `functions/api/_pubnub.ts` | Server-side helper: `publish()` (REST, plain `fetch`) and `grantToken()` (PAM v3 token signed with the secret key via Web Crypto HMAC-SHA256). Silent no-op (console.warn, never throws) when keys are missing. |
| `GET /api/pubnub-grant` | Returns a short-TTL token scoped to the caller: a center gets **read on `center.{ownId}` only**, a platform admin **read on `platform`**. Answers `{ enabled: false }` when the key set is absent. |
| `src/realtime/pubnubClient.ts` | Browser client: fetches the grant, subscribes (one shared PubNub connection per tab), refreshes the token halfway through its TTL, and exposes an `active`/`fallback` state. |
| `src/hooks/usePubNubSync.ts` | React hook: invokes the existing handler on each signal. While its state is `active` the consumer pauses polling. |
| `src/hooks/useLiveSync.ts` | **Polling fallback — unchanged.** Automatically resumed whenever PubNub is not `active`. |

Publish points (fire-and-forget via `context.waitUntil`, can never fail the
request): `POST /api/renewal-requests` → `platform`; `PATCH
/api/renewal-requests` (approved AND rejected, both the direct and the
skipApply/modal path) → `center.{id}` + `platform`; `POST /api/center-plans`
(every action that mutates the center: set-plan, add-trial, remove-plan, …) →
`center.{id}` + `platform`; `POST`/`PATCH /api/centers` → `center.{id}` +
`platform`.

### How the fallback works

- **Keys present, PubNub healthy** — messages trigger refetches (~2 s end-to-end),
  polling is paused (zero polling traffic).
- **Keys missing / grant refused / PubNub disconnects** — the hook flips to
  `fallback` and the existing `useLiveSync` polling (30 s cadence, 5 s while a
  request is pending) takes over transparently. Without keys the app behaves
  exactly as before this feature, with zero console errors.

### Where to get keys & where to set them

1. Create a free account at [admin.pubnub.com](https://admin.pubnub.com/) and
   copy the key set's **Publish / Subscribe / Secret** keys.
2. **Server** — Cloudflare Dashboard → **Workers & Pages → (the Pages project)
   → Settings → Environment variables** → add `PUBNUB_PUBLISH_KEY`,
   `PUBNUB_SUBSCRIBE_KEY`, `PUBNUB_SECRET_KEY` — **set them for both
   Production and Preview**. Read only via the `env` bindings in
   `functions/api/_lib.ts` (`Env` interface). **Never** put the values in
   `wrangler.toml [vars]` (that file is committed). For local dev use a
   gitignored `.dev.vars` file (see `.dev.vars.example`) with
   `wrangler pages dev`.
3. **Client** — same Dashboard path: add `VITE_PUBNUB_PUBLISH_KEY` and
   `VITE_PUBNUB_SUBSCRIBE_KEY` (Production + Preview). Vite bakes them in at
   build time and the code reads them only via `import.meta.env`. For local
   dev use a gitignored `.env` file (see `.env.example`).

> ⚠️ Never commit real keys anywhere in the repo — not in code, not in tests
> (tests use fake `test-key` fixtures), not in docs. If a key ever leaks into
> git history, rotate it in the PubNub dashboard.

## License

Private — internal use.
