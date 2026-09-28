# Contract: `/api/activities`

**Feature**: `004-activities-planning` | **Method**: same-origin only
(relative `/api` from the browser; cross-origin mutations rejected by middleware).

Authentication: required (center session cookie). Center identity derived
server-side from session — never from payload. Inventory entry:
`"/api/activities": ["GET", "PUT"]`; unknown methods → 405; unauthenticated → 401
per shared middleware.

This contract is identical to `specs/001-center-types-new-modules/contracts/activities-api.md`
(features converge on one implementation); it is restated here so 004 is
self-contained. 001 remains the canonical copy if both ship together.

## GET /api/activities

Returns the caller center's full activities document.

**Response 200**

```json
[
  {
    "id": "act_1",
    "title": "Atelier peinture",
    "category": "art",
    "weekday": 2,
    "date": null,
    "timeStart": "10:00",
    "timeEnd": "11:00",
    "location": "Salle d'activité",
    "levelClass": "Petite section",
    "staffId": "stf_9",
    "createdAt": "2026-09-23T08:00:00.000Z"
  }
]
```

`date` is `null` for weekly-recurring activities. Empty array when none. Isolation:
a foreign center session receives only its own rows (tested both directions).

## PUT /api/activities

Whole-domain replace: the payload is the complete new activities array for the
center.

**Request**: JSON array of Activity objects (client-generated ids; payload ownership
identity ignored/stamped server-side).

**Validation**: array required (400 otherwise); rows failing the data-model predicate
(empty title, category outside motricite|art|musique|jeu, `timeStart >= timeEnd`,
weekday outside 0–6 with no date) are dropped; duplicate ids deduped (first wins).

**Response 200**: `{ "ok": true }` · **Errors**: 400 invalid body, 401, 405, 404
(unregistered path), 500. Error envelope: `{ "error": "<arabic user-facing message>" }`
— internal details never echoed.

Success triggers the standard center-channel refetch signal so other open sessions
of the same center refresh (existing mechanism; no new channel).

## Test obligations (constitution IV/V)

Handler tests MUST cover: foreign-center isolation both directions, unauthenticated
rejection, wrong method → 405, invalid-row drops, duplicate-id dedupe, payload
ownership identity ignored. Middleware inventory test asserts the exact path/methods.
