# Feature Specification: Finance ▸ Gestion des repas — Onglet Goûter dédié

**Feature Branch**: `007-finance-gouter-monthly-drilldown`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "return to remarques-finance-gouter-tab.md and create new spec 007" — the
client's technical remarks on the Finance ▸ Section Repas Goûter onglet introduced by feature 006's
revision E. Three groups: **A.** blocks to hide from the Goûter tab (Forfait ferme, the meal-price
info banner, the Goûter summary strip), **B.** a new monthly Goûter consumption component with a
per-day expandable drilldown «à l'identique» of the Repas monthly table, **C.** strict source-level
isolation of Repas data on the Repas tab.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Goûter tab shows only Goûter content (Priority: P1)

A center administrator opens Finance ▸ Gestion des repas and switches to the Goûter onglet. The
screen shows only what concerns the Goûter service: the mirrored synthesis cards, the Goûter detail
table and the monthly Goûter grid. Three Repas-only blocks that today still render there are gone —
«الفرفي المكتسب (Forfait ferme)» (the closure/profit card and its «إغلاق شهر» actions), the
meal-price information banner («سعر الوجبة», «حصة الـ Traiteur», «ربح السنتر للوجبة», the
«مطبخ داخلي — بدون وسيط» hint), and the «مداخيل واستهلاك خدمة اللمجة (Goûter)» summary strip. No
information is lost: every hidden element remains fully available on the Repas tab, where it
belongs.

**Why this priority**: This is the client's primary complaint — the Goûter tab currently mixes in
Repas-only financial concepts (forfait closures, plate pricing/margins) that invite misreading. It
is a pure de-mixing fix with zero data impact, and everything else in the feature builds on a
correctly scoped tab.

**Independent Test**: Render the Finance restaurant section with Goûter active on a configuration
that has a closable month and both operating modes; assert the three blocks are absent on the
Goûter tab and present on the Repas tab.

**Acceptance Scenarios**:

1. **Given** the Goûter onglet active, **When** the screen renders, **Then** no
   «الفرفي المكتسب (Forfait ferme)» card, no «إغلاق شهر …» button and no forfait estimate/acquired
   figures appear anywhere on the Goûter tab.
2. **Given** the Goûter onglet active, **When** the screen renders, **Then** the meal-price banner
   (سعر الوجبة / حصة الـ Traiteur / ربح السنتر للوجبة / مطبخ داخلي — بدون وسيط) does not appear.
3. **Given** the Goûter onglet active, **When** the screen renders, **Then** the
   «مداخيل واستهلاك خدمة اللمجة (Goûter)» summary strip does not appear.
4. **Given** the Repas onglet active, **When** the screen renders, **Then** all three blocks are
   present exactly as before this feature — nothing is removed from Repas (regression guard).
5. **Given** the Goûter onglet active in either kitchen operating mode (external traiteur or
   in-house kitchen), **When** the screen renders, **Then** the hidden blocks are hidden in both
   modes identically.

---

### User Story 2 - Monthly Goûter consumption with a day-by-day drilldown (Priority: P1)

The administrator wants to answer "how many goûters did we serve in March, and on exactly which
days?" On the Goûter tab, the monthly grid («إجمالي استهلاك اللمجة في كل شهر») is now built exactly
like the Repas monthly table («إجمالي الوجبات المستهلكة في كل شهر»): one clickable cell per month
with the month's total, and clicking a month opens a month-detail panel equivalent to
«تفاصيل الوجبات المستهلكة في شهر», dedicated to the Goûter — grouped one expandable/collapsible
panel per day of consumption, each listing that day's goûter records (student, level, morning or
evening service, subscription vs. one-off, paid status) with the same visual style as the Repas
day panels. Clicking the active month again closes the detail; a close action is available too.

**Why this priority**: This completes the Goûter tab from a flat summary into a real follow-up tool
parité with Repas (remark B: «à l'identique», same style, day panels openable and closable). It
depends on nothing else in this feature and is the feature's substantive new capability.

**Independent Test**: Seed goûter attendances across several months and days; on the Goûter tab,
click a month cell and verify the per-day panels open and close, show only that month's goûter
records, and that clicking again (or the close button) collapses the detail.

**Acceptance Scenarios**:

1. **Given** goûter attendances in several months, **When** the Goûter monthly grid renders,
   **Then** each of the nine academic months shows its own goûter-only total in the same
   month-cell presentation as the Repas monthly table.
2. **Given** a month cell clicked, **When** the detail panel opens, **Then** it shows one
   collapsible panel per day that has goûter consumption that month, each listing only that day's
   goûter records (no lunch records), in the Repas day-panel style.
3. **Given** an open day panel, **When** the administrator clicks it again, **Then** it collapses;
   clicking another month opens that month's detail; clicking the active month a second time (or
   using the close action) closes the detail entirely.
4. **Given** a month with no goûter consumption, **When** its cell is clicked, **Then** the detail
   shows an explicit "no consumption this month" message rather than an empty shell.
5. **Given** the Repas tab's monthly table, **When** the administrator uses it, **Then** it is
   unchanged — the new drilldown is additive on the Goûter tab only.

---

### User Story 3 - Repas tab data is strictly isolated at the source (Priority: P2)

The center owner reconciles the finance numbers against the traiteur invoice. On the Repas tab,
every Repas figure — the synthesis cards, the monthly table «إجمالي الوجبات المستهلكة في كل شهر»
and its month detail «تفاصيل الوجبات المستهلكة في شهر» — must be computed from lunch records only,
with the goûter exclusion happening where the data is aggregated (the query/aggregation step), not
merely hidden at display time, so that totals remain exact even as new records are added. Feature
006's revision E already moved these aggregations toward lunch-only feeds; this story pins that
guarantee end-to-end and closes any remaining display-only path (notably the month-detail rows,
which must contain no goûter record at all).

**Why this priority**: The correctness guarantee behind the client's «point de vigilance» — the
totals must be exact, not just look right. The heavy lifting landed in 006 revision E; what remains
is verification-grade hardening, which is why it is P2 rather than P1.

**Independent Test**: With mixed lunch + goûter data seeded, read every Repas-tab figure, then
compare: each total must equal the lunch-only count computed independently, and the day-expanded
month detail must contain zero goûter rows.

**Acceptance Scenarios**:

1. **Given** mixed lunch and goûter records in the same period, **When** the Repas synthesis cards
   and monthly table render, **Then** every figure equals the lunch-only aggregation — no goûter
   record contributes to any Repas total.
2. **Given** a goûter record on the same day as lunch records, **When** the Repas month detail is
   expanded for that day, **Then** no goûter record appears in it.
3. **Given** the Repas aggregation, **When** new goûter records are added for the same period,
   **Then** no Repas figure changes (isolation holds as data grows — the filtering happens at the
   aggregation source).

---

### Edge Cases

- What happens when the selected month filter combines with the monthly grid? → The Goûter monthly
  grid always shows all nine academic months of the school year (it is the Goûter twin of the Repas
  monthly table, which ignores the month filter for its cells); the month filter continues to scope
  the Goûter detail table and the synthesis cards, as today.
- What happens when a student consumes both goûter services on the same day? → The day panel lists
  both records (morning and evening) as separate rows; the day and month totals count both.
- What happens when only in-house-kitchen mode is configured? → The price banner is hidden from the
  Goûter tab in that mode too (its in-house hint is a Repas concept); no empty placeholder remains.
- What happens when a forfait closure exists for the viewed month? → Closure state and actions stay
  exclusively on the Repas tab; the Goûter tab neither shows nor affects them.
- What happens when the school-year filter changes? → The Goûter monthly grid recomputes all nine
  month cells for the newly selected year; a previously open month detail closes rather than
  showing data from the old year.
- What happens when the goûter month detail is opened and new attendance data arrives (another
  session)? → The panel reflects the stored data at render time; totals of Repas and Goûter tabs
  always sum to the combined consumption (no double counting, no loss).

## Requirements *(mandatory)*

### Functional Requirements

**Group A — Goûter tab de-mixing**

- **FR-001**: When the Goûter onglet is active, the system MUST NOT render the «الفرفي المكتسب
  (Forfait ferme)» block, including its estimate/acquired figures and its «إغلاق شهر» closure
  actions.
- **FR-002**: When the Goûter onglet is active, the system MUST NOT render the meal-price
  information banner («سعر الوجبة», «حصة الـ Traiteur», «ربح السنتر للوجبة», and the
  «مطبخ داخلي — بدون وسيط» in-house hint).
- **FR-003**: When the Goûter onglet is active, the system MUST NOT render the
  «مداخيل واستهلاك خدمة اللمجة (Goûter)» summary strip.
- **FR-004**: All three blocks MUST remain rendered unchanged when the Repas onglet is active
  (removal is scoped to the Goûter tab only).

**Group B — Goûter monthly drilldown**

- **FR-005**: The Goûter tab MUST present a monthly consumption grid «إجمالي استهلاك اللمجة في كل
  شهر» visually equivalent to the Repas monthly table (one clickable cell per academic month within
  the card container style of the Repas table).
- **FR-006**: Clicking a month cell MUST open a Goûter month-detail panel equivalent to the Repas
  «تفاصيل الوجبات المستهلكة في شهر», listing the selected month's goûter consumption grouped into
  one panel per day.
- **FR-007**: Each day panel MUST be expandable and collapsible, reusing the Repas day-panel style
  and interaction (expanded state per day, not per month).
- **FR-008**: The Goûter month detail MUST show only goûter records — no lunch record may appear in
  it, its day panels or its day counts.
- **FR-009**: Clicking the active month cell again, or activating the detail's close action, MUST
  close the month-detail panel.
- **FR-010**: A month with no goûter consumption MUST render an explicit empty message in its
  detail rather than an empty panel.

**Group C — Source-level Repas isolation**

- **FR-011**: The Repas tab's synthesis cards, monthly table and month detail MUST be computed
  exclusively from lunch records; the exclusion of goûter records MUST happen at the aggregation
  source, not at display time, so totals stay exact as data grows.
- **FR-012**: The Repas month detail «تفاصيل الوجبات المستهلكة في شهر» MUST contain no goûter
  record in any day panel.
- **FR-013**: For the same data, every Repas-tab total plus its Goûter-tab counterpart MUST equal
  the combined consumption (no record double-counted, none lost).

### Key Entities *(include if feature involves data)*

- **Meal attendance record**: the single per-student, per-date, per-service consumption record
  (lunch / morning goûter / evening goûter, subscription vs. one-off, paid status). This feature
  adds no new entity and changes no record shape — it only scopes which records feed which surface.
- **Meal forfait closure**: the persisted end-of-month snapshot used by the Forfait ferme block;
  remains a Repas-tab-only surface, untouched by this feature.
- **Academic month / school year**: the period selectors already shared by the Finance restaurant
  section; the monthly grid spans the nine academic months of the selected year.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the three Repas-only blocks are absent from the Goûter tab in both kitchen
  operating modes, and 100% present on the Repas tab (byte-identical to pre-feature behavior).
- **SC-002**: 100% of the nine academic months render a clickable cell in the Goûter monthly grid,
  and clicking any month with consumption opens a day-grouped detail whose day panels all open and
  close correctly.
- **SC-003**: 0 goûter records appear anywhere on the Repas tab (cards, monthly table, day detail),
  verified with mixed-data fixtures where goûter and lunch share the same days.
- **SC-004**: For identical datasets, Repas + Goûter tab totals equal the combined consumption with
  0 double-counted and 0 lost records.
- **SC-005**: 0 regressions in the pre-existing test suite; the three 006-revision-E finance
  behaviors (mirrored cards, Goûter detail table, monthly grid) keep passing with their tab-scoping
  updated.

## Assumptions

- The Finance ▸ Gestion-des-repas two-onglet layout (Repas / Goûter) delivered by feature 006's
  revision E is the baseline this feature refines; this feature does not re-litigate the tab
  structure itself.
- «À l'identique» (remark B) means visual and interaction parity with the existing Repas monthly
  table — same card style, same per-month cell presentation, same day-panel pattern — not a new
  design.
- The three hidden blocks are scoped to the Finance restaurant section only; the same concepts
  elsewhere (e.g., the meals module's own surfaces) are out of scope.
- Data isolation work continues to build on the per-service aggregation introduced in 006 revision
  E; no stored record shape changes and no backend/API changes are expected — this is a
  client-side scoping and presentation feature.
- The month filter keeps its current semantics for the detail table and cards; the monthly grids
  (both tabs) intentionally show all nine academic months, matching the existing Repas table
  behavior the client asked to mirror.
