# Phase 0 Research: Finance ▸ Gestion des repas — Onglet Goûter dédié

**Feature**: `007-finance-gouter-monthly-drilldown` | **Date**: 2026-09-28

No NEEDS CLARIFICATION items — the spec's assumptions pin the ambiguity («à l'identique» =
parity with the Repas monthly table; grids ignore the month filter). Research resolves the four
design choices below.

## R1 — The Goûter summary strip is removed, not relocated

**Decision**: delete the «مداخيل واستهلاك خدمة اللمجة (Goûter)» strip (and its local helpers)
entirely rather than moving it to the Repas tab or hiding it conditionally.

**Rationale**: the remark scopes it «masquer également ce bloc dans l'onglet Goûter» — but unlike
the Forfait ferme block and the price banner, the strip currently renders **only** on the Goûter
tab, so "hide it there" can only mean removal. Relocating it to Repas is forbidden by the spec's
group C (no goûter data anywhere on the Repas tab). Nothing is lost: its headline figure
(مداخيل اللمجة) is byte-equal to the mirrored Goûter card's «إجمالي الاشتراكات» (both sum
`service === 'Goûter'` payments), and its per-service counts are readable from the Goûter detail
table's per-service columns. Dead local helpers (`countGouter`, `gouterPrefix`,
`gouterMatinCount`, `gouterSoirCount`, `gouterSubscribersCount`) are deleted with the block so
lint stays clean.

**Alternatives considered**: conditional strip on both tabs — rejected: violates group C on the
Repas side; keeping it on Goûter below the cards — rejected: it duplicates the mirrored cards'
numbers directly above it, which is exactly the redundancy the client wants cleaned.

## R2 — The drilldown state lives inside GouterMonthlyTable

**Decision**: `selectedMonth` (the open month's detail) and `expandedDays` (the open day panels)
live as `useState` inside `GouterMonthlyTable`; the host passes no drilldown props. The host keys
the component on `schoolYear` so a school-year change remounts it and resets the state.

**Rationale**: the drilldown is presentational navigation over the props the component already
owns — lifting it to FinanceModule would add three props and two state hoists for zero reuse (the
Repas monthly table keeps its own `consumedDetailMonth`/`expandedDays` state, which this feature
does not touch). Self-containment also keeps the component's existing test contract intact
(`finance-gouter-monthly` and `gouter-monthly-{month}` testids survive). Keying on `schoolYear`
implements the spec's edge case (year change closes the open detail) without a `useEffect` reset.

**Alternatives considered**: hoisting to FinanceModule beside the Repas detail state — rejected:
couples two independent drilldowns and invites cross-tab state bugs; URL/query-param state —
rejected: ephemeral view state, not shareable navigation; reusing the Repas
`consumedDetailMonth`/`expandedDays` — rejected: the two tabs must be independently navigable, and
shared state would make the Goûter detail flash when the Repas one closes.

## R3 — Day-panel interaction is per-day, replicating the Repas pattern

**Decision**: each day panel toggles independently via an `expandedDays: Set<string>` (ISO date
keys), rendered closed by default; a «إغلاق» action closes the whole month detail.

**Rationale**: the remark pins the interaction model — «un panneau par jour de consommation, avec
possibilité de l'ouvrir et de le refermer», same style as the Repas detail, where
`expandedDays.has(day)` gates each panel independently (all-closed default, multi-open allowed).
Per-day state also survives the drilldown's data shape: days with one record and days with twenty
behave identically. The «إغلاق» action mirrors the Repas detail's button and gives FR-009's
second close affordance.

**Alternatives considered**: accordion (one open day) — rejected: diverges from the Repas pattern
the client wants copied; month-wide toggle — rejected: contradicts the per-day wording; all-days-
open default — rejected: the Repas table defaults closed and the remark asks for parity.

## R4 — Source-level filtering lands at the aggregation steps, and the tests must expand the day panels

**Decision**: the 3.1 month-cell aggregation and the month-detail row collection filter attendances
to lunch at the `reduce`/collection step (`!a.service || a.service === 'lunch'`), and the
regression test expands a day panel containing a same-day goûter record before asserting zero
goûter rows.

**Rationale**: the audit found both paths leak goûter records into Repas figures — the cells count
every attendance in the month prefix, and the row collection pushes every attendance. Revision E's
test asserted day-panel *badges* only, which never rendered the leaked rows' service labels — a
vacuously passing test, exactly the failure mode the client's «vérifier que le filtrage se fait
bien à la source» warns about. Filtering at the aggregation step (not in the row renderer) keeps
the totals exact as data grows (FR-011) and makes the day badges («N وجبة») honest. The same
lunch predicate used by the 006-E card split is reused — one definition, no drift.

**Alternatives considered**: filtering in the day-panel renderer only — rejected: display-time
hiding is precisely what the remark forbids, and counts would stay inflated; a shared
`isLunchAttendance` export — viable, but the predicate is already inline-consistent across the
006-E sites; hoisting it is a refactor beyond this feature's scope (noted for tasks to consider
only if it stays a one-liner).
