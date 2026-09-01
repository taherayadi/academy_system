# Teen Center

A comprehensive desktop management application for student tutoring centers, built specifically for the Tunisian education system. Developed for **Teen Center** in Sfax, Tunisia.

![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)

---

## Overview

Teen Center is a full-stack, offline-first desktop application designed to manage every aspect of a student tutoring center — from student enrollment and grade tracking to meal planning, staff payroll, and AI-powered data analysis. The application runs entirely on a local machine with no internet connection required after installation.

---

## Key Features

### Student Management
- **Full student profiles**: name, birth date, grade, parent information (mother & father), siblings, authorized persons, allergies, academic history
- **Electronic signatures** for registration confirmation
- **AI-powered PDF import**: extract student data directly from scanned registration forms using Google Gemini AI
- **Service enrollment**: toggle Suivi, Teen Center, Library, and Meals per student

### Academic Tracking (Suivi Scolaire)
- Track grades per trimester (Trimestre 1, 2, 3) per subject
- Supports the full Tunisian curriculum: Arabic, French, Math, Physics, SVT, English, IT, Philosophy, History-Geography, Economics
- Devoir 1, Devoir 2 (Math only), and Synthèse grades
- Average calculations and at-risk student identification

### Teen Center Étude
- Weekly time-slot scheduling (Monday–Saturday)
- Teacher assignment per slot
- Student enrollment per slot with attendance tracking
- Extra-hours detection for sessions outside the teacher's regular schedule

### External Courses
- Manage courses with external teachers (subject, grade level, monthly fee)
- Per-session attendance and payment tracking
- Teacher share vs. center share revenue split
- Global student register shared across all courses

### Revision Sessions
- One-time revision sessions with external teachers
- Per-student attendance and payment tracking
- Revenue split between teacher and center

### Meals Module
- Weekly meal plan editor (Monday–Friday)
- Subscription mode (monthly fee) or unit mode (per-dish payment)
- Daily meal attendance tracking
- Dish popularity analysis

### Finance
- Complete student payment ledger with receipt generation
- Service-based income breakdown (Suivi, Étude, Library, Meals, Courses, Revision, Assurance, Inscription)
- Expense tracking by category (Telecom, Water, Electricity, CNSS, Salaries, Rent, etc.)
- Cheque payment management with cashing status
- Monthly financial summaries

### Staff Management
- Employee profiles: contract type (CDI/CDD/Vacation), CNSS number, salary, subjects
- Weekly schedule management
- Monthly timesheets with attendance, absence, and late tracking
- Leave request workflow (approve/reject)
- Advance request workflow
- Payslip generation with CNSS deductions, bonus, extra hours
- Printable official payslip template

### Data Analysis (AI-Powered)
- Analyze center performance per school year, trimester, or month
- Per-service income breakdown with visual percentage bars
- Meal popularity ranking
- Weekly meal plan visualization
- External courses and revision session statistics
- AI-generated insights and recommendations to increase revenue (powered by Gemini 3.6 Flash)
- Export analysis as text file

### Settings & Administration
- Configurable fee structure per academic year
- Center information (name, phone, city)
- Subject list management
- Gemini API key configuration for AI features
- JSON backup export and import
- Multi-user authentication (Super Admin / Restricted Admin)

### Additional Features
- Custom scrollbars and modern UI with RTL Arabic support
- Close confirmation dialog in Electron
- Dashed empty states for better UX
- Pagination across all modules (students, payments, staff, courses, meals)
- Search bars in all enrollment dialogs
- Daily server-side logging with error tracking
- React ErrorBoundary for crash recovery

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Desktop** | Electron 35 (NSIS installer, ASAR packaging) |
| **Frontend** | React 19, TypeScript, Vite 6, Tailwind CSS 4 |
| **UI** | Lucide React icons, Motion (Framer) animations |
| **Backend** | Express 4, bundled via esbuild into single file |
| **Database** | SQLite (better-sqlite3) with WAL mode |
| **AI** | Google Gemini API (gemini-3.6-flash) for PDF extraction and data analysis |
| **Testing** | Playwright E2E tests, Vitest unit tests |
| **Build** | electron-builder (NSIS setup + portable) |

---

## Architecture

```
teen_center_local/
├── electron/
│   └── main.cjs              # Electron main process, BrowserWindow, utilityProcess fork
├── server/
│   ├── index.ts              # Express server entry point, logging, error handler
│   ├── routes.ts             # API routes, authentication, session management
│   ├── data.ts               # Read/write helpers for each SQLite table
│   ├── db.ts                 # Schema definition, migrations, seed data
│   └── logger.ts             # Daily file logging (logs/ folder)
├── server-dist/              # Bundled server output (single file via esbuild)
├── src/
│   ├── components/
│   │   ├── Dashboard.tsx              # Overview with stats and quick actions
│   │   ├── StudentRegistrationModule.tsx  # Full student CRUD with AI import
│   │   ├── SuiviScolaireModule.tsx    # Grade tracking per trimester
│   │   ├── TeenCenterModule.tsx       # Time-slot scheduling and enrollment
│   │   ├── ExternalCoursesModule.tsx  # External course management
│   │   ├── SeanceRevisionModule.tsx   # One-time revision sessions
│   │   ├── LibraryModule.tsx          # Library enrollment and fees
│   │   ├── MealsModule.tsx            # Meal plans, subscriptions, attendance
│   │   ├── FinanceModule.tsx          # Payment ledger, expenses, receipts
│   │   ├── StaffManagementModule.tsx  # Staff CRUD, timesheets, payslips
│   │   ├── DataAnalysisModule.tsx     # AI-powered analytics dashboard
│   │   ├── SettingsModule.tsx         # Center config, fees, backup/restore
│   │   ├── LoginScreen.tsx            # Authentication screen
│   │   ├── Toast.tsx                  # Notification system with dedup
│   │   ├── ErrorBoundary.tsx          # React crash recovery
│   │   └── ConfirmDialog.tsx          # Reusable confirmation modal
│   ├── utils/
│   │   ├── logger.ts         # Client-side error logging (sends to server)
│   │   ├── aiExtract.ts      # Gemini AI PDF extraction
│   │   └── aiAnalysis.ts     # Gemini AI data analysis
│   ├── types.ts              # TypeScript interfaces, fee helpers, constants
│   ├── App.tsx               # Root component, state management, server sync
│   ├── api.ts                # Fetch helpers for all API endpoints
│   ├── auth.ts               # Session persistence (localStorage)
│   └── index.css             # Global styles, custom scrollbars, print styles
├── tests/
│   ├── seed-full-app.ts      # Bulk database seeder for testing
│   └── e2e-full-app.spec.ts  # Playwright E2E tests (8 tests)
├── data/                     # SQLite database (auto-created, gitignored)
├── logs/                     # Daily log files (auto-created, gitignored)
└── release/                  # Build output (NSIS installer + unpacked files)
```

---

## Default Login Credentials

| Email | Password | Role | Access Level |
|---|---|---|---|
| `teen_center@gmail.com` | `teen_center` | Super Admin | Full access to all modules |
| `teens_center@gmail.com` | `teens_center` | Restricted Admin | Student tracking only (no external courses, meals, settings) |

> **Important**: Change default passwords immediately after first login via the Settings page.

---

## Getting Started

### For End Users

1. Download `Teen Center Setup 1.0.0.exe`
2. Double-click to run the installer
3. Choose installation directory (or use default)
4. Launch from the desktop shortcut
5. Login with the default credentials above

See [installation.md](installation.md) for detailed installation guide, backup/restore instructions, and troubleshooting.

### For Developers

#### Prerequisites

- [Node.js](https://nodejs.org) v18+ LTS
- Windows 10/11
- (Optional) Python — for building native modules from source
- (Optional) Visual Studio Build Tools 2022 — for `@electron/rebuild`

#### Install Dependencies

```bash
npm install
```

#### Development Mode

```bash
npm run electron:dev
```

#### Run Tests

```bash
npm test              # Unit tests (Vitest)
npx playwright test   # E2E tests (Playend)
```

#### Build Installer

```bash
npm run electron:build
```

Output: `release/Teen Center Setup 1.0.0.exe`

#### Build Portable

```bash
npm run electron:build:portable
```

Output: `release/Teen Center 1.0.0.exe`

---

## License

Private — for internal use at Teen Center, Sfax, Tunisia.
