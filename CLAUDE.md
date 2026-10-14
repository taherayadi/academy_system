# Repository guide

This is the **center and public landing application**. Do not reintroduce platform administration UI, routes or a deployment-mode switch.

- Frontend: `src/App.tsx`, center modules under `src/components`, React/Vite/Tailwind.
- Backend: Cloudflare Pages Functions in `functions/api`; shared tenant data helpers in `_lib.ts`.
- Authentication: center roles `admin`, `super_admin` only. `platform_super_admin` belongs to the other application.
- `_deployment.ts` is fixed source configuration. `_middleware.ts` maintains the exact route/method inventory; update it when adding routes.
- `center_sessions` and host-only `tc_center_session` are isolated from the other application's credentials. Never accept the legacy shared session table/cookie.
- Derive center identity from the authenticated context; every data query/mutation must verify tenant ownership.
- Landing-only public APIs: GET pricing/active ads, POST demo requests; demo management is not part of this repo.
- GET `/api/centers` returns only the caller's center; renewal GET/POST are center-scoped. There are no center-management mutation routes here.
- Browser API calls stay same-origin (`/api`); Vite proxies local requests to Pages port 8788.
- The admin repository owns all shared D1 migrations. Do not create a competing migration sequence here. The authoritative in-repo schema is `migrations/0001_initial_schema.sql` (used by `functions/api/*.test.ts` node:sqlite fixtures).
- Run `npm run lint`, `npm test`, `npm run build`. Node 22.13+ is needed for SQLite integration tests.
- See `README.md` and `DEPLOYMENT_SPLIT.md` for operation and rollout instructions.

## Session log (branch `academy_system/login_center`)

Revision séances (قر ClassExternal) — fixed and verified, all committed-staged? (pending):

- **Persist revision tutors as external students.** `revision_seance_students.student_id` FK → `students(id)`, so writers now upsert a `students` row (`student_type='external'`, prefix ids `rev_st_*`) before linking. Names/phones are read back via `LEFT JOIN students` in `readRevisionSeances`; no more bogus `student_name/parent_phone/paid_seance` columns.
- **Paid séance = payment-backed.** A paid student gets a `payments` row `service_key='revision'`, `ref_type='revision_seance'`, `ref_id=seanceId`, `amount = teacherShare+centerShare`, deterministic id `revpay_{seance}_{student}`; `revision_seance_students.paid_payment_id` references it. Reminder: migration's `payments.school_year` and `revision_seances.school_year` are GLOB-constrained `YYYY/YYYY` — the module's default year comes from `getCurrentAcademicYear()`.
- **Granular endpoints** (client no longer PUTs the whole list for a new séance or student):
  - `POST /api/revision-seances` → `createRevisionSeance` (upsert one séance + pupils).
  - `POST /api/revision-students` → `addRevisionStudent` (one pupil into an existing center-owned séance; 400 `غير موجود`/`غير صالحة`/`مفقود` on bad input). Also used for the ✓ paid toggle — it restores the deterministic payment on paid and deletes the detached `payments` row on unpaid.
  - `DELETE /api/revision-students?seanceId=&studentId=` → `removeRevisionStudent` (targeted removal: deletes the link, the séance payment, and the backing `students` row). `App.tsx` `handleRemoveRevisionStudent` splits pure state from the API call.
  - `DELETE /api/revision-seances?id=` → `deleteRevisionSeance` (targeted séance removal: deletes its payments, links, the séance, then any now-orphan `students` rows). `App.tsx` `handleDeleteRevisionSeance` splits pure state from the API call.
  - `PUT /api/revision-seances` accepts **either** the full array (domain rewrite, for edit/delete/removals) **or** a single seance object → `createRevisionSeance` (pointage/attendance rewrite of only that séance). `updateRevisionSeanceApi` in `src/api.ts` sends the single object.
  - Registered in `_middleware.ts` ROUTES. `revision-students.ts` is a sibling file (no folder/file collision).
- **Isolation from external register.** `readExternalStudents` and the `writeExternalStudents` delete now exclude students referenced by `revision_seance_students`, so revision tutors never appear in the external-courses register nor get cascade-deleted. They remain greppable as `student_type='external'` with `rev_st_*` ids.
- **Fee bug fixed.** Add-Student modal amount now = `selected.teacherShare + selected.centerShare` (was the form default `seanceFee` 70+10=80 / stale edited values).
- Frontend plumbing: `src/api.ts` `createRevisionSeanceApi` / `updateRevisionSeanceApi` / `addRevisionStudentApi` / `removeRevisionStudentApi` / `deleteRevisionSeanceApi`; `App.tsx` `handleCreateRevisionSeance` / `handleUpdateRevisionSeance` / `handleDeleteRevisionSeance` / `handleAddRevisionStudent` / `handleRemoveRevisionStudent` (all go through `commitDomain`); `SeanceRevisionModule.tsx` uses the new props when present (paid toggle → single student, pointage → single séance, student removal → targeted DELETE, séance delete → targeted DELETE), falling back to full-list otherwise.
- Tests: new `functions/api/revision-seances.test.ts` (node:sqlite fixture = snapshot schema + `revision` service; 11 cases incl. FK, cross-center rejection, unpaid-toggle cleanup, targeted student/seance removal, orphan cleanup, single-seance pointage rewrite). `external-students.test.ts` fixture got the two `revision_*` tables added so its existing 7 cases query them. Backend suite: 21 files / 171 pass. Frontend: `npm run lint`, `npm run build` clean; 14 pre-existing failures (`FinanceModule` 7, `MealsModule` 2, `dataSafety.roundtrip` 5) — untouched.

Prior this session: FinanceModule external-courses rows grouped per student with collapse, center/teacher share cards + per-teacher table; ExternalCoursesModule unlock button for late-join students. Both retained, lint/tests as documented above.

External-course roster removal — targeted delete (this session):

- `DELETE /api/courses?courseId=&studentId=` → `removeCourseEnrollment` (`_lib.ts`): verifies the course belongs to the caller's center then deletes the single `course_enrollments` row. `_middleware.ts` `/api/courses` now `["GET","PUT","DELETE"]`.
- Frontend: `src/api.ts` `removeCourseStudentApi`; `App.tsx` `handleRemoveCourseStudent` (state + `commitDomain`); `ExternalCoursesModule.tsx` `handleRemoveStudent` uses the granular prop when present (`onRemoveCourseStudent`), falling back to the full-list PUT. Assurance payments/register rows are untouched, matching the previous full-PUT semantics (only the enrollment link is removed).
- Tests: `external-students.test.ts` gained targeted-removal + cross-center-rejection cases (note: write `external_courses` before `writeExternalStudents` — the register attendance FK references `external_courses`). Backend suite: 21 files / 169 pass. Frontend unchanged (14 pre-existing failures).

External-course FULL course deletion — targeted delete (this session):

- `DELETE /api/courses?id=` → `deleteCourse` (`_lib.ts`): verifies center ownership then deletes the single `external_courses` row; the schema FKs CASCADE to `course_enrollments` + `external_course_sessions` + `course_session_attendance` and NULL `external_attendance.course_id`. Same handler branches: `?id=` = delete course, `?courseId=&studentId=` = remove enrollment.
- Frontend: `src/api.ts` `deleteCourseApi`; `App.tsx` `handleDeleteCourse` (purges `courses` **and** `sessions` state locally, one `commitDomain` call — no session PUT); `ExternalCoursesModule.tsx` `onDeleteCourse?` prop used by the course-deletion confirm, falling back to the old full-list PUT of courses+sessions.
- Tests: `external-students.test.ts` gained targeted course-delete (enrollments cascaded, external register preserved) + cross-center rejection. Backend suite: 21 files / 173 pass.
