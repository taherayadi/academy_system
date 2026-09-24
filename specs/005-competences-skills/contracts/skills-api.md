# Contract: `/api/skills`

**Feature**: `005-competences-skills` | **Method**: same-origin only
(relative `/api` from the browser; cross-origin mutations rejected by middleware).

Authentication: required (center session cookie). Center identity derived
server-side from session — never from payload. Inventory entry:
`"/api/skills": ["GET", "PUT"]`; unknown methods → 405; unauthenticated → 401 per
shared middleware.

This contract is identical to `specs/001-center-types-new-modules/contracts/skills-api.md`
(features converge on one implementation); it is restated here so 005 is
self-contained. 001 remains the canonical copy if both ship together.

## GET /api/skills

Returns the caller center's skills domain document.

**Response 200**

```json
{
  "catalog": [
    {
      "id": "skl_1",
      "domain": "langage",
      "label": "Reconnaître les lettres",
      "ageFrom": 36,
      "ageTo": 48,
      "createdAt": "2026-09-23T08:00:00.000Z"
    }
  ],
  "evaluations": [
    {
      "id": "evl_1",
      "studentId": "stu_7",
      "skillId": "skl_1",
      "level": "en_cours",
      "evaluatedByStaffId": "stf_3",
      "evaluatedByName": null,
      "evaluatedAt": "2026-09-20"
    }
  ]
}
```

Exactly one of `evaluatedByStaffId` / `evaluatedByName` is non-null. Levels:
`non_evalue` | `emergent` | `en_cours` | `acquis`. Empty arrays when none. Isolation:
a foreign center session receives only its own document (tested both directions).

## PUT /api/skills

Whole-domain replace of `{ catalog, evaluations }`.

**Request**: same shape as the GET response. Server-side behaviors:

- stamps `centerId` from session on every row (payload ownership identity ignored),
- drops evaluations whose `skillId` is absent from the same write's catalog
  (atomic cascade — FR-004),
- drops evaluations whose `studentId` is not a child of the center,
- dedupes `(studentId, skillId)` pairs keeping the last occurrence
  (latest-save-wins — FR-007),
- enforces the data-model predicates (domain/level enums, non-empty label,
  `ageFrom` ≤ `ageTo`, evaluator XOR discriminator, required date).

**Response 200**: `{ "ok": true }` · **Errors**: 400 invalid shape (non-object,
missing keys, wrong types), 401, 405, 500. Error envelope:
`{ "error": "<arabic user-facing message>" }` — internal details never echoed.

Success triggers the standard center-channel refetch signal so other open sessions
of the same center refresh (existing mechanism; no new channel).

## Test obligations (constitution IV/V)

Handler tests MUST cover: foreign-center isolation both directions, unauthenticated
rejection, wrong method → 405, cascade drop precision (removed skill's evaluations
gone; others intact), foreign-`studentId` drop, evaluator discriminator enforcement,
pair dedupe latest-wins, 400 on invalid shape, payload ownership identity ignored.
Middleware inventory test asserts the exact path/methods.
