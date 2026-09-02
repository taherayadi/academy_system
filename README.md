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

## License

Private — internal use.
