# Phase 0 Research: Cross-Feature Verification & Release Readiness

**Feature**: `006-cross-feature-verification` | **Date**: 2026-09-23

No NEEDS CLARIFICATION items — the spec pins composition semantics (intersection of
visibility), the immutable legacy baseline, and the closure list. Research resolves
the verification-design choices.

## R1 — Composed test strategy: renders vs per-feature re-runs

**Decision**: Composed suites render the app shell (or invoke handlers) with
**combined configurations** in a single render/call — crèche + étude-without-staff +
both new modules in one pass — rather than re-running each feature's quickstart in
isolation. Per-feature quickstarts are re-run only on the composed configurations
(cross-feature walkthroughs), as the spec's FR-014 states.

**Rationale**: Cross-feature interference (the thing this feature hunts) only
manifests when features are active simultaneously; isolated re-runs prove nothing
new. Single-render composition also catches provider/state conflicts that
sequential per-feature testing would mask.

**Alternatives considered**: only manual composed walkthroughs — rejected: not
repeatable, violates the gates principle; full E2E browser suite — rejected: heavy
new infrastructure for states the component-level renders already reach.

## R2 — Configuration factories

**Decision**: A `src/testing/programConfig.ts` factory builds composed center
configurations (`type`, enabled modules, role) with defaults equal to the legacy
passthrough (unknown type, empty module list). Composed suites consume the factory;
the factory's own test pins the defaults.

**Rationale**: One definition of each composed configuration keeps the matrix
(data-model.md) and the tests in lockstep; defaults-as-legacy makes the factory
self-documenting about the passthrough guarantee (FR-004).

**Alternatives considered**: inline literal configs per test — rejected: drift
between suites reproducing "the same" configuration; fixtures on disk — rejected:
heavier, harder to keep in sync with type changes.

## R3 — Catalog coherence assertions

**Decision**: The coherence suite imports the catalog once and asserts: (a) both
consumer surfaces render from that same source (their imports/components are
resolved and rendered in the test), (b) presets match the tier rules per key,
(c) `derivePlanFromModules` matches for representative selections, and (d) every
catalog key maps to a registered module key/tab (no phantom entries).

**Rationale**: (d) is the novel cross-check — it catches the "listed but not
buildable" failure mode the spec calls out (FR-009), which no per-feature test
covers.

**Alternatives considered**: snapshot tests of the rendered catalog — rejected:
brittle against label copy edits; comparing rendered DOM strings across surfaces —
rejected: indirect; asserting the shared source is the robust invariant.

## R4 — Round-trip tests without mutation side effects

**Decision**: Round-trip suites operate on in-memory state through the same props
the app uses (flip type prop, toggle module lists, compose skill-catalog saves),
asserting reveal/verbatim-restoration on re-render. No test writes to persistent
storage; the persistence-layer guarantees are already covered by the features'
handler suites.

**Rationale**: The round-trip guarantees are presentation-layer invariants (hiding
never destroys); exercising them at the render boundary proves FR-010 without
duplicating storage tests.

**Alternatives considered**: database round-trips — rejected: duplicates 001/005
handler coverage; manual-only verification — rejected: not repeatable in gates.

## R5 — Concurrency cascade test

**Decision**: The cascade-under-concurrency check simulates two sequential saves
with different document states (session A removes a skill; session B, stale,
evaluates it) through the domain write path and asserts the stored result follows
the defined rules: latest write wins as a whole document; cascade applies within
it; no orphaned evaluations survive; unrelated evaluations intact.

**Rationale**: The spec's FR-011 names concurrent edits explicitly; modeling the
stale-second-writer through the real write function catches ordering bugs the
single-writer tests cannot.

**Alternatives considered**: real two-client integration with PubNub — rejected:
out of scope, nondeterministic; pure unit test of the dedupe helper — rejected:
misses the cascade interaction.

## R6 — Integration-fix protocol

**Decision**: When a composed test exposes a cross-feature bug, the fix lands in
the owning feature's production file, in the same change as the failing composed
test, and the composed test moves to green in that same change. No fix is deferred
to "later" and no composed test is skipped or weakened.

**Rationale**: Mirrors the constitution's fix-with-test rule at program level;
keeps 006's deliverable honest (a verification feature that skips failures is
worthless).

**Alternatives considered**: TODO-marking failures as known issues — rejected:
contradicts the gates; weakening legacy tests to make composed ones pass —
rejected: FR-006 forbids it explicitly.

---

# Revision B research — remarks alignment (`center-type-module-rules.md`)

## R7 — Where does module × center-type compatibility live?

**Decision**: Extend the existing canonical `src/utils/centerType.ts` with a
`moduleCenterTypes` map (module key → served center types) plus
`isModuleCompatible` / `incompatibleModules` helpers. No new file, no new
catalog field.

**Rationale**: The program already asserts single canonical definitions (T004,
FR-015); adding a second compatibility source (e.g. a field on `PricedModule` in
`pricing.ts`) would fork the concept between commercial catalog and type rules.
The remarks matrix is a *type* rule, not a pricing rule, so it belongs with the
type predicates. Three surfaces (renewal, landing cards, demo form) consume one
map, keeping the coherence guarantee trivially testable. Unknown/empty type →
compatible (legacy passthrough) preserves FR-004.

**Alternatives considered**: a `centerTypes?: CenterType[]` field on
`PricedModule` — rejected: couples type rules into the pricing catalog and makes
the landing/renewal identity check carry semantics it doesn't need; per-surface
hardcoded lists — rejected: three copies of the matrix, drift guaranteed;
backend/column on centers — rejected: presentation-level concern, no schema
change warranted, admin repo untouched.

## R8 — Locking vs hiding the pointage sub-tab in staff-lite

**Decision**: Keep the pointage sub-tab button visible but `disabled` with the
locked style and a lock glyph in lite mode; the panel never opens.

**Rationale**: Remark 3's principle is explicit for payroll: "show them as locked
… rather than hiding them, so the value of upgrading is visible." The shipped
behavior hides pointage's content but leaves a clickable dead tab — worse than
either clean option. Aligning on visible-but-locked is consistent with the
payroll treatment and turns an empty panel into an upgrade signal.

**Alternatives considered**: hiding the tab entirely (current behavior) —
rejected: contradicts the remark's visibility principle and leaves the dead-click
bug; leaving clickable with a toast — rejected: an interactive control that does
nothing but complain is a worse affordance than a disabled one.

## R9 — Renewal offering vs. already-enabled incompatible modules

**Decision**: The renewal *simulator* lists only compatible modules; an
incompatible module already present in `enabledModules` still appears in the
current-plan display (enabled, priced) but is never re-offered as an option.

**Rationale**: Remark 4 says "incompatible modules are never offered" — offering
is the simulator's job, not the current-plan summary's. Hiding an existing paid
module from its own display would make a paid capability vanish without any
change (contradicts FR-010's reversibility trust guarantee and confuses billing).

**Alternatives considered**: filtering `enabledModules` itself in the display —
rejected: data disappearance without a data change; stripping incompatible keys
from the payload — rejected: 006 forbids silent data mutation outside explicit
round-trips.

## R10 — Demo-form compatibility feedback: informative, not blocking (unchanged; see above)

**Decision**: A live info banner (ℹ️, non-error styling) lists incompatible
selections and suggests removal or a type switch; submit stays enabled and the
payload is sent unmodified.

**Rationale**: Remark 6's text is a directive: "Keep it informative rather than
blocking: guide the choice instead of rejecting the submission outright." The
provisioning flow (FR-012 round-trip) stays untouched.

**Alternatives considered**: blocking submit — rejected: explicitly against the
remark; silently removing incompatible modules from the selection — rejected:
mutates the visitor's choice without consent, and the remark wants them to
choose.

---

# Revision C research — remarks alignment (`remarques-modules-centre.md`)

## R11 — Where does type-aware plan derivation live, and what is the Pro predicate?

**Decision**: Add `applicableModuleKeys(centerType?)` to the canonical
`src/utils/pricing.ts` (filtering `ALL_MODULES` through revision B's
`isModuleCompatible`) and give `derivePlanFromModules` an optional second
parameter. Pro = every **applicable** key selected; no type → the exact
today's global comparison. `RenewalModule` threads its existing `centerType`
prop into the call.

**Rationale**: Remark 7 names the cause precisely — the counter counts modules
the center can never select. The comparison base must be the applicable set;
making the parameter optional keeps every existing caller (landing simulator,
coherence tests, preset validity checks) byte-identical, honoring the
immutable-baseline rule. `pricing.ts` is the right home because it already owns
`ALL_MODULES` and the derivation, and it already imports from (or can import
from) the canonical type utility — one more single-definition convergence, not
a fork: the compatibility *map* stays in `centerType.ts`, only the
pricing-side *derivation* moves here.

**Alternatives considered**: counting "visible modules" from the UI filter
(renewal's `compatibleAddons.length`) — rejected: derivation would depend on a
component's render output, not derivable from data; hardcoding "4 hidden
modules for crèche" — rejected: duplicates the matrix and drifts the moment
the matrix changes; flipping crèche selections to include study keys in the
payload — rejected: fabricates selections the user never made and would
mis-price the request.

## R12 — Planner day start: constant change vs configurable per-center hours

**Decision**: Change the constant (`DAY_START_MIN = 8 * 60`, 24 bands) in the
single-definition `src/utils/planner.ts`. No per-center configuration.

**Rationale**: The remark states the expected opening hour as a fixed fact
(« 08h00, heure réelle d'ouverture des activités »), not a per-center setting;
v1 has no center-hours entity and the scope note forbids new entities. The
clamp rule (times outside the range snap to the first/last band) already
defined behavior for out-of-range values, so stored activities before 08:00
keep rendering (band 0) without any data rewrite — the remark's vigilance
point (créneaux, exports, rapports) is discharged by verifying those surfaces
derive from the same helper: the week grid, the moved-chip snap
(`bandStartTime`), and the form defaults are the only consumers, and no
export/report references a 06:00 origin anywhere in `src/` (verified by
searching the time-band consumers).

**Alternatives considered**: keeping 28 bands and hiding the first four rows
via CSS — rejected: the helper stays wrong and every consumer must remember to
hide; a `dayStart` setting on centers — rejected: new persisted entity, admin
repo involvement, and nothing in the remark asks for configurability.

## R13 — Attendance register: gate the filter, not the whole module

**Decision**: `StudentAttendanceModule` gains `centerType?: string` (forwarded
by `StudentTimeSheetModule`'s crèche/jardin branch); the grade filter select
renders only when `hasSchoolLevel(centerType)`.

**Rationale**: Revision B already established `hasSchoolLevel` as the canonical
"does this type carry school-level artifacts" predicate (it gates grade fields,
prints, and the academic-history section); a grade filter is exactly such an
artifact, and the register is the crèche/jardin variant of the time-sheet
module, which is where the remark aims. Reusing the predicate keeps one
definition; the optional prop preserves the legacy passthrough (undefined →
filter shown) required by FR-004. Hiding only the filter — not the search box,
not the status buttons — matches the remark's wording (masquer le filtre) and
cannot affect stored attendance rows, which are per-student status records
unrelated to the filter.

**Alternatives considered**: filtering by `gradeOptions.length > 0` (auto-hide
when no grades exist) — rejected: a crèche could still hold stray grade values
and the filter would reappear, contradicting the type rule; hiding the grade
*chips* on the cards too — rejected: the remark targets the filter only, and
grade display elsewhere is already governed by 002's `showSchoolLevel` rules.

## R14 — Banner icon placement: one pattern for both modules

**Decision**: In both `ActivitiesModule` and `CompetencesModule`, render the
module icon inside the `text-2xl` title element (flex row, gap-2, icon
immediately before the text — mirroring `StudentTimeSheetModule`'s existing
icon-before-title header), outside the green badge span.

**Rationale**: The remark is purely structural: icon **before the title text**,
**not inside the green rectangle**. The repo already has the target pattern
(the time-sheet/attendance banners put a `h-6 w-6` icon in the title row), so
both modules adopt it verbatim rather than inventing a third banner shape. RTL
direction puts "before" on the right visually, which the existing pattern
already handles. Component tests pin DOM order (icon precedes the title text
node) so the placement cannot regress silently.

**Alternatives considered**: moving the icon into the green badge alongside
the label — rejected: that is the current state the remark rejects; a left
floating icon column outside both — rejected: diverges from the established
banner pattern used by every other module.

---

# Revision D research (`remarques-module-repas-gouter.md`)

## R15 — Samedi as an additive union member, stored under its own name

**Decision**: add `'Samedi'` to the `MealPlanDay['day']` union in `src/types.ts`,
to the `WEEKDAYS` list, to `ARABIC_WEEKDAYS` (السبت) and to `DAY_BY_INDEX`
(`6: 'Samedi'`, keeping the Lundi fallback for Sunday). No normalization or
migration in `src/api.ts`.

**Rationale**: meal plans persist verbatim under the French day name, so the
storage contract is the day *string*, not an index — an additive union member is
back-compatible by construction: existing plans carry `Lundi…Vendredi` keys and
load unchanged; a Saturday plan is just another name. Extending the union at the
type level means the compiler surfaces every exhaustive consumer (the tab row,
`ARABIC_WEEKDAYS` lookups), which the tests pin. The remark's Arabic wording
(السبت) is honored by the label map, keeping the UI fully Arabic like its five
siblings.

**Alternatives considered**: recomputing the day from each plan entry's `date`
field — rejected: the day tabs select plans by name, not by date, and a
computed scheme would rewrite the storage contract for zero client benefit; a
per-center "school week days" setting — rejected: new persisted entity, admin
repo involvement, nothing in the remark asks for configurability.

## R16 — One shared Goûter consumption table for both screens

**Decision**: new `src/components/GouterConsumptionTable.tsx`, hosted twice:
beside the lunch consumption table in `MealsModule` (fed from `gouterStudents`,
same month selector) and under the lunch detail table in `FinanceModule`'s
Gestion-des-repas tab (fed from the filtered students' goûter attendances). The
existing lunch tables become lunch-only by feeding them `subscribedStudents`.

**Rationale**: remarks M2 and F2 describe the same missing artifact on two
screens («tableau dédié» / «composant séparé»); one component keeps the
column set, status semantics (`getGouterStatus` per academic month) and
per-service consumption counts defined once (FR-015), while each host owns
only its data wiring. Everything the table shows derives from existing
`enrolledServices`, `mealAttendances` and `payments` — no stored-shape change,
so FR-010 holds and no backend or migration work is triggered. Filtering
Goûter-only students out of the lunch table directly answers the «mélange les
deux cas» complaint without touching any lunch behavior.

**Mechanism refinement (from the tasks-phase audit)**: the lunch feed cannot
key on `enrolledServices.meals` — the goûter track never writes it
(`handleEnrollStudentInGouter` and goûter payments only set `gouter*` flags),
but registration's lockedMeals path (`hasPaidService('Repas')` forcing
`meals: true`) and pre-goûter-track records can leave stale `meals: true` on
goûter-only students. The lunch table therefore keys on
`mealSubscription.active === true`, which the goûter track never touches.
Two exclusion shapes are pinned in tests: fresh goûter-only students
(`meals: false` + gouter flags) and legacy ones (`meals: true` with
`mealSubscription.active` true/undefined). The Goûter feed stays the existing
`gouterStudents` rule (any gouter* flag).

**Alternatives considered**: one mixed table with a «service» type column —
rejected: the remark explicitly asks for a dedicated component/table, and the
payment-status semantics genuinely differ (Repas month status vs Goûter
per-type status); computing the split in `src/api.ts` or the worker — rejected:
presentational concern, would add an endpoint surface the constitution's
route-freeze discourages for no test benefit.

## R17 — Unit-meal modal: enablement mirrors the subscription, confirm needs one service

**Decision**: the modal's three service toggles (Déjeuner / Goûter matin /
Goûter après-midi) render disabled until a candidate is selected; a small
eligibility helper maps `enrolledServices` (+ subscription mode, refunded-month
state) to enabled services; confirm requires ≥1 enabled-and-ticked service and
writes one unit attendance per ticked service.

**Rationale**: the remark's sequence is exact — «afficher d'abord les 3 choix à
l'état désactivé … en activant uniquement les options correspondant à son
abonnement» — so the gating must derive from the subscription, not from free
choice, and the disabled-before-selection state is part of the requested UX.
The eligibility logic is pure and therefore testable in `src/meals.test.ts`
without DOM. Multi-service submission reuses the `service` discriminator that
`MealAttendance` already carries and the daily grid already writes — the data
model anticipated per-service rows, so no schema change is needed; the
traiteur-price snapshot and unit pricing stay per-service as the daily grid
already handles.

**Alternatives considered**: letting staff tick any of the three regardless of
subscription — rejected: contradicts «uniquement les options correspondant à
son abonnement» and would blur subscription vs unit accounting; forcing an
exact-subscription match with no unit fallback — rejected: the modal's very
purpose is *unit* meals for non-subscribed or refunded-month students, who must
be able to take all three at unit price.

## R18 — Remove the Goûter table's delete action without losing the unenroll path

**Decision**: delete the «إلغاء الاشتراك في اللمجة» button from the Goûter
subscribers table's actions column; the edit-type button stays, and its modal
remains the (deliberate) unenrollment path. No other surface changes.

**Rationale**: the audit shows the table's delete affordance IS the unenroll
button; the client asks for its removal from *this* table (likely after
accidental unenrollments), not for the capability to disappear. Keeping the
edit-type modal as the unenroll path preserves data-safety: enrollment flags
remain writable, just behind a two-step intent (FR-010 — no stored value is
touched by the removal itself). The daily pointage grid's remove-attendance
button and the lunch table's actions are different objects on different
screens, explicitly out of the remark's scope.

**Alternatives considered**: removing unenrollment everywhere — over-scoped,
would contradict the enroll modal's own semantics; replacing the button with a
confirm dialog — rejected: the remark says «retirer», not «protéger», and a
confirmation keeps the accidental-click surface the client is complaining
about.

## R19 — Decimal Goûter pricing at the input layer

**Decision**: a shared decimal-money parse helper (comma-tolerant, keeps the
leading-zero cleanup) + `step="0.5"` on the five Goûter fee inputs; `updateFee`
keeps storing plain numbers.

**Rationale**: the cap is purely the input layer — `CenterFeeSet` holds JSON
numbers, `getGouterStatus`, unit-payment math and persistence all round-trip
non-integers untouched, so no rounding may be introduced anywhere (FR-006).
Tunisian dinar entry is conventionally comma-written («2,5»), and the numeric
keyboard on `type="number"` inputs with a decimal step admits it on most
locales; normalising «2,5» → 2.5 in one helper keeps the five fields
consistent and testable as a truth table. Restricting the change to the five
Goûter fields matches the remark's scope (tarification du service Goûter)
while the helper stays reusable if the client extends decimals later.

**Alternatives considered**: switching money state to strings end-to-end — a
large refactor across payments math for no client ask; rounding stored fees to
integers — directly contradicts the remark; per-field inline parsing copied
five times — violates the single-definition rule (FR-015).

## R20 — Traiteur indicators are external-traiteur-mode artifacts

**Decision**: gate the pricing strip's «حصة الـ Traiteur» / «ربح السنتر للوجبة»
cells and the consumption table's «حصة السنتر» / «حصة الـ Traiteur» columns on
`!isInHouseKitchen`; show an explicit «مطبخ داخلي — بدون وسيط» hint in-house.
No calculation changes.

**Rationale**: `isInHouseKitchen` already exists, already zeroes the traiteur
cost in every computation, and SettingsModule already shows the in-house
confirmation note — the finance screen simply forgot to follow. Hiding (not
zero-displaying) is what the remark asks («masquer les blocs»), and the values
would be structurally meaningless in-house anyway (the strip's «ربح السنتر»
in-house equals the full plate price, inviting misreading). Gating rendering
keeps the totals byte-identical between modes for the same data, which the new
FinanceModule test pins — the change is provably presentational.

**Alternatives considered**: grey-out instead of hide — rejected: the remark
says «masquer» and greyed indicators still invite reading; a new explicit
settings flag for indicator visibility — rejected: redundant with
`mealOperatingMode`, which is already the mode of record.
