# Contract: `/api/skills`

**Feature**: `001-center-types-new-modules` | **Method**: same-origin only.

Authentication: required (center session cookie). Center identity server-derived.
Inventory entry: `"/api/skills": ["GET", "PUT"]`; unknown methods → 405;
unauthenticated → 401.

One route serves the whole skills domain: the catalog AND the per-child evaluations
ride together in one document (research R3), mirroring how formations carry their
students in `/api/formations`.

## GET /api/skills

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

Exactly one of `evaluatedByStaffId` / `evaluatedByName` is non-null (FR-023).
Levels: `non_evalue` | `emergent` | `en_cours` | `acquis`. Isolation: document
contains only the caller center's rows.

## PUT /api/skills

Whole-domain replace of `{ catalog, evaluations }`.

**Request**: same shape as the GET response. Server-side behaviors:

- stamps `centerId` from session on every row (payload `centerId` ignored),
- drops evaluations whose `skillId` is absent from the same write's catalog
  (catalog deletion cascades to evaluations — spec edge case #5),
- drops evaluations whose `studentId` does not belong to the center,
- enforces the data-model validation rules (domain/level enums, single evaluator
  discriminator, ageFrom ≤ ageTo, non-empty labels).

**Response 200**: `{ "ok": true }` · **Errors**: 400 invalid shape, 401, 405, 500.

## Error shape

Shared envelope `{ "error": "<arabic user-facing message>" }`; internal details never
echoed (constitution III).

## Test obligations (constitution IV/V)

Handler tests MUST cover: foreign-center isolation (two centers, no leakage either
direction), unauthenticated rejection, method not allowed → 405, cascade-drop of
orphaned evaluations, payload `centerId` ignored. `_middleware` inventory test extends
to assert the two new paths/methods exactly.
