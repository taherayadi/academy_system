# Contract: `/api/activities`

**Feature**: `001-center-types-new-modules` | **Method**: same-origin only
(relative `/api` from the browser; cross-origin mutations rejected by middleware).

Authentication: required (center session cookie `tc_center_session`). Center identity
derived server-side from session — never from payload. Registered in
`functions/api/_middleware.ts` inventory as `"/api/activities": ["GET", "PUT"]`;
unknown methods → 405; unauthenticated → 401 per shared middleware behavior.

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

`date` is `null` when the activity recurs weekly on `weekday`. Empty array when the
center has no activities. Foreign center sessions receive only their own document
(isolation tests: second center never sees rows of the first).

## PUT /api/activities

Whole-domain replace (app convention): the payload is the complete new activities
array for the center.

**Request**: JSON array of Activity objects as above (client-generated ids; `centerId`
ignored/rejected from payload — stamped server-side).

**Validation**: array required (400 otherwise); items failing the data-model rules
(bad category, timeStart ≥ timeEnd, missing title, weekday out of range) are dropped;
ids must be unique (duplicates deduped, first wins).

**Response 200**: `{ "ok": true }` · **Errors**: 400 invalid body, 401, 405, 404
(path unregistered), 500.

Success triggers the standard center-channel refetch signal so other open sessions of
the same center refresh (existing PubNub/polling mechanism — no new channel).

## Error shape

All errors use the shared JSON error envelope: `{ "error": "<arabic user-facing
message>" }` with no internal details echoed (constitution III).
