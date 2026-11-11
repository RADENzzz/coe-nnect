# CoE-NNECT ↔ IDP Integration Handoff

> Audience: the IDP team implementing the IDP side of the CoE-NNECT ↔ IDP
> API Contract v2.0.
> Status: Milestones 1 and 3 are implemented in CoE-NNECT. Pattern C is the
> primary transport; Pattern A is an optional fallback.
>
> This document is the practical companion to
> [`idp.md`](idp.md) and the
> [Milestone 3 checkpoint](idp-milestone-3-checkpoint.md). It lists exactly
> what each side calls, what to configure, and how to verify the connection.

---

## 1. Who calls whom

| Direction | Transport | Caller | Receiver |
|---|---|---|---|
| Faculty snapshot | Pattern C (HTTP push) | IDP desktop | CoE-NNECT |
| Published schedules | Pattern C (HTTP poll) | IDP desktop | CoE-NNECT |
| Faculty-request statuses | Pattern C (HTTP poll) | IDP desktop | CoE-NNECT |
| Change-request acks | Pattern C (HTTP poll) | IDP desktop | CoE-NNECT |
| Faculty-change events | Signed webhook | IDP | CoE-NNECT |
| Change requests | Signed webhook | IDP | CoE-NNECT |
| Roster / qualifications / unavailability | Pattern A (HTTP pull) | CoE-NNECT | IDP |
| Schedule / faculty-request / ack push | Pattern A (HTTP push) | CoE-NNECT | IDP |

**Pattern C is the default.** It requires no inbound HTTP on the IDP desktop,
so it works when the desktop is behind NAT or temporarily offline. Pattern A is
only enabled when `IDP_ENABLED=true` and `IDP_BASE_URL` is set on CoE-NNECT.

---

## 2. What CoE-NNECT needs from the IDP team

### For Pattern C (primary)

1. **Desktop base configuration**
   - The CoE-NNECT base URL you will call, e.g.
     `https://coe-nnect.example.edu/api`.
   - A device API key issued by CoE-NNECT (sent separately over a secure
     channel).
   - A webhook signing secret shared with CoE-NNECT (sent separately).
2. **Clock discipline** — webhook timestamps must be within ±5 minutes of
   CoE-NNECT server time (configurable with `IDP_WEBHOOK_TOLERANCE_MS`).
3. **Raw-body signing** — sign the exact JSON bytes you send, before any
   re-serialization.
4. **Poll state** — persist the last `next_since` value per outbox endpoint and
   send it back on the next poll.
5. **Public app link (optional)** — if the IDP team wants the faculty-facing
   app advertised on the CoE-NNECT landing page, provide the public `http(s)`
   URL. The CoE-NNECT deployment sets it as `VITE_IDP_APP_URL`; the landing
   page then shows an "Open IDP app" promo card and a footer link. Leave it
   empty to hide the promo.

### For Pattern A (optional fallback)

1. IDP REST base URL (staging and production), without a trailing slash.
2. Bearer API key for CoE-NNECT outbound calls.
3. Confirmation that these paths exist (or the agreed alternatives):
   - `GET /faculty?department_code=&updated_since=`
   - `GET /faculty/{key}/qualifications`
   - `GET /faculty/{key}/unavailability?term_code=`
   - `POST /schedules/published`
   - `POST /faculty-requests`
   - `POST /change-requests/{id}/ack`
4. Which of the eight change-request types you will actually send.
5. A staging faculty record and a staging change request we can use for
   end-to-end testing.

---

## 3. What to configure on CoE-NNECT

Set these in `apps/backend/.env` (template: `apps/backend/.env.example`):

```dotenv
# Pattern A fallback (leave IDP_ENABLED=false for Pattern C-only)
IDP_ENABLED=false
IDP_BASE_URL=
IDP_API_KEY=

# Pattern C desktop access
IDP_DEVICE_API_KEY=

# Inbound webhook verification
IDP_WEBHOOK_SECRET=
IDP_REQUEST_TIMEOUT_MS=15000
IDP_WEBHOOK_TOLERANCE_MS=300000
```

Generate strong random values, for example in PowerShell:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

- `IDP_DEVICE_API_KEY` — shared with the IDP desktop; rotate by replacing it on
  both sides.
- `IDP_WEBHOOK_SECRET` — shared with the IDP sender; used only for HMAC
  verification.
- Never commit real values. Store them in the deployment secret manager.

Apply the IDP migrations in order if the database does not already have them:

```text
supabase/migrations/20261111000100_add_idp_processed_event.sql
supabase/migrations/20261111000200_add_idp_outbox.sql
supabase/migrations/20261111000300_add_idp_change_request.sql
```

Check readiness:

```powershell
Invoke-RestMethod http://localhost:3000/api/idp/v1/health
```

The response reports whether the device key, webhook secret, and Pattern A base
URL are configured. It never returns secret values.

---

## 4. Pattern C endpoints (IDP desktop → CoE-NNECT)

All Pattern C calls send:

```text
Authorization: Bearer <IDP_DEVICE_API_KEY>
X-Request-ID:    <uuid>        (optional, echoed in logs/errors)
Content-Type:    application/json
```

### 4.1 Push a faculty snapshot

`POST /api/idp/v1/inbox/faculty`

```json
{
  "faculty": [
    {
      "wmsu_id": "2019-00123",
      "employee_id": null,
      "first_name": "Juan",
      "last_name": "Dela Cruz",
      "email": "juan.delacruz@wmsu.edu.ph",
      "contact": null,
      "department_code": "CPE",
      "is_active": true
    }
  ]
}
```

A bare array is also accepted. Per-record failures do not abort the snapshot:

```json
{
  "data": {
    "received": 1,
    "created": 0,
    "updated": 1,
    "unchanged": 0,
    "skipped": 0,
    "failed": 0,
    "errors": [],
    "startedAt": "2026-11-11T10:00:00.000Z",
    "finishedAt": "2026-11-11T10:00:02.000Z"
  }
}
```

### 4.2 Poll published schedules

`GET /api/idp/v1/outbox/schedules?since=<iso>&limit=<1-200>`

```json
{
  "data": {
    "items": [
      {
        "outbox_id": "42",
        "kind": "schedule.published",
        "idempotency_key": "77",
        "created_at": "2026-11-11T10:00:00.000Z",
        "payload": {
          "coe_nnect_version_id": "77",
          "version_number": 3,
          "term_code": "2026-2027-1st",
          "published_at": "2026-11-11T09:59:58.000Z",
          "entries": []
        }
      }
    ],
    "next_since": "2026-11-11T10:00:00.000Z",
    "server_time": "2026-11-11T10:00:05.000Z"
  }
}
```

Rules:

1. Dedupe on `payload.coe_nnect_version_id`.
2. Persist `next_since`; it is inclusive, so the same item may be returned
   again. Re-reading is harmless; skipping is not.
3. Keep polling while `items` is non-empty.
4. Schedule items are frozen at publish time and never change.

### 4.3 Poll faculty-request statuses

`GET /api/idp/v1/outbox/faculty-requests?since=<iso>&limit=<1-200>`

```json
{
  "data": {
    "items": [
      {
        "outbox_id": "58",
        "kind": "faculty_request.status",
        "idempotency_key": "42",
        "created_at": "2026-11-11T10:05:00.000Z",
        "payload": {
          "coe_nnect_request_id": "42",
          "requesting_dept": "CPE",
          "target_dept": "EE",
          "faculty_wmsu_id": "2019-00123",
          "subject_code": "CPE 131",
          "term_code": "2026-2027-1st",
          "status": "approved",
          "reason": "Needs to teach CPE 131 for the first semester.",
          "created_at": "2026-10-23T09:40:00.000Z"
        }
      }
    ],
    "next_since": "2026-11-11T10:05:00.000Z",
    "server_time": "2026-11-11T10:05:02.000Z"
  }
}
```

Unlike schedules, each request has **one row that is refreshed in place**.
Dedupe on `payload.coe_nnect_request_id` plus `status`; the latest status wins.

### 4.4 Poll change-request acknowledgements

`GET /api/idp/v1/outbox/change-request-acks?since=<iso>&limit=<1-200>`

```json
{
  "data": {
    "items": [
      {
        "outbox_id": "61",
        "kind": "change_request.ack",
        "idempotency_key": "IDP-REQ-0001",
        "created_at": "2026-11-11T10:10:00.000Z",
        "payload": {
          "idp_request_id": "IDP-REQ-0001",
          "acknowledged_by_coe_nnect_user_id": "8f14e45f-ea2b-4b6e-9f3a-1c2d3e4f5a6b",
          "action": "accepted",
          "notes": "Applied to the 2026-2027 first semester timetable.",
          "acknowledged_at": "2026-11-11T10:10:00.000Z"
        }
      }
    ],
    "next_since": "2026-11-11T10:10:00.000Z",
    "server_time": "2026-11-11T10:10:02.000Z"
  }
}
```

`action` is `accepted`, `rejected`, or `modified`. There is exactly one ack per
`idp_request_id`; treat it as final.

---

## 5. Signed webhooks (IDP → CoE-NNECT)

### Headers

```text
Content-Type:    application/json
X-Request-ID:    <uuid>                 (optional)
X-IDP-Signature: sha256=<hex>
X-IDP-Timestamp: <ISO 8601>
```

- Signature = HMAC-SHA256 of the **raw request body bytes**, hex-encoded,
  prefixed with `sha256=`.
- Timestamp must be within ±5 minutes (configurable).
- Send the body exactly as signed; do not re-serialize after computing the HMAC.

### 5.1 Faculty change event

`POST /api/idp/v1/webhooks/faculty-changed`

Follow contract 4.6. The event is deduplicated on its event id; a retry with the
same id and body returns a duplicate result, while a different body returns
`409 duplicate_key`.

### 5.2 Change request

`POST /api/idp/v1/webhooks/change-request`

Example (`unavailability_change`):

```json
{
  "idp_request_id": "IDP-REQ-0001",
  "type": "unavailability_change",
  "faculty_wmsu_id": "2019-00123",
  "faculty_employee_id": null,
  "affected_dates": ["2026-11-18"],
  "details": {
    "term_code": "2026-2027-1st",
    "day_of_week": "Monday",
    "start_time": "13:00",
    "end_time": "15:00",
    "reason": "External load"
  },
  "severity": "warning",
  "requires_ack": true,
  "created_at": "2026-11-11T10:00:00Z"
}
```

Accepted types and their `details` shapes are in contract 4.7.1:
`faculty_create`, `faculty_update`, `faculty_deactivate`, `faculty_transfer`,
`qualification_add`, `qualification_remove`, `unavailability_change`,
`schedule_override`.

Idempotency:

| Case | Response |
|---|---|
| New `idp_request_id` | `200`, `status: "pending"` |
| Same id + same body | `200`, `status: "duplicate"` |
| Same id + different body | `409 duplicate_key` |

CoE-NNECT **does not apply the change automatically**. A Dean/college
secretary/administrator reviews it and records an acknowledgement; the
underlying schedule or faculty change is applied manually through CoE-NNECT
screens. This is deliberate: CoE-NNECT is authoritative for schedules.

### 5.3 Signing examples

Node.js:

```js
const crypto = require('crypto');

const body = JSON.stringify(payload); // sign these exact bytes
const timestamp = new Date().toISOString();
const signature =
  'sha256=' +
  crypto.createHmac('sha256', process.env.IDP_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

await fetch(`${baseUrl}/api/idp/v1/webhooks/change-request`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-IDP-Signature': signature,
    'X-IDP-Timestamp': timestamp,
    'X-Request-ID': crypto.randomUUID(),
  },
  body,
});
```

PowerShell:

```powershell
$body = '{"idp_request_id":"IDP-REQ-0001", ...}'
$ts = (Get-Date).ToUniversalTime().ToString("o")
$hmac = [System.Security.Cryptography.HMACSHA256]::new(
  [Text.Encoding]::UTF8.GetBytes($env:IDP_WEBHOOK_SECRET)
)
$sig = ([BitConverter]::ToString(
  $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body))
) -replace '-','').ToLower()

Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/api/idp/v1/webhooks/change-request `
  -ContentType 'application/json' -Body $body `
  -Headers @{ 'X-IDP-Signature' = "sha256=$sig"; 'X-IDP-Timestamp' = $ts }
```

---

## 6. Pattern A endpoints (CoE-NNECT → IDP, optional)

CoE-NNECT calls these with `Authorization: Bearer <IDP_API_KEY>` and an
`X-Request-ID` per attempt.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/faculty?department_code=&updated_since=` | Roster pull |
| `GET` | `/faculty/{key}/qualifications` | Qualification pull |
| `GET` | `/faculty/{key}/unavailability?term_code=` | Unavailability pull |
| `POST` | `/schedules/published` | Published-schedule push |
| `POST` | `/faculty-requests` | Faculty-request status push |
| `POST` | `/change-requests/{id}/ack` | Change-request ack push |

CoE-NNECT treats `409` on a push as "already accepted" and does not retry.
`429` and `5xx` are retried with bounded backoff; other `4xx` are reported and
left in the outbox.

The IDP receiving side should return the contract error envelope on failure:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Human-readable explanation.",
    "details": {},
    "request_id": "..."
  }
}
```

---

## 7. Error codes CoE-NNECT returns

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `validation_error` | Missing/invalid field or body shape |
| 401 | `unauthorized` | Missing/invalid device key, signature, or timestamp |
| 403 | `forbidden` | Role is not allowed to review/ack |
| 409 | `duplicate_key` | Same idempotency key with a different body or decision |
| 409 | `local_edit_pending` | Faculty row has an unreconciled local edit |
| 422 | `unknown_department` | Department code does not resolve |
| 422 | `unknown_subject` | Subject code does not resolve |
| 422 | `unknown_section` | Section code does not resolve |
| 422 | `unknown_term` | Term code does not resolve |
| 422 | `unknown_faculty` | Faculty key does not resolve |
| 422 | `unknown_designation` | Designation id does not resolve |
| 422 | `faculty_key_conflict` | `wmsu_id` and `employee_id` point to different rows |
| 500 | `internal_error` | Unexpected server failure |

---

## 8. End-to-end test plan

Run this against a CoE-NNECT staging environment before production.

### 8.1 Prerequisites

- CoE-NNECT staging base URL and device key.
- Webhook secret.
- At least one department code (`CPE`), subject code (`CPE 131`), and term
  code (`2026-2027-1st`) that exist in staging.
- A Dean/secretary/administrator JWT for the review step.

### 8.2 Steps

1. **Health**
   ```powershell
   Invoke-RestMethod "$BASE/api/idp/v1/health"
   ```
   Confirm the device key and webhook secret are reported as configured.

2. **Faculty inbox**
   ```powershell
   $headers = @{
     Authorization = "Bearer $env:IDP_DEVICE_API_KEY"
     'Content-Type' = 'application/json'
   }
   $body = '{"faculty":[{"wmsu_id":"2019-00123","first_name":"Juan","last_name":"Dela Cruz","department_code":"CPE","is_active":true}]}'
   Invoke-RestMethod -Method Post -Uri "$BASE/api/idp/v1/inbox/faculty" `
     -Headers $headers -Body $body
   ```
   Expect `received: 1` and `failed: 0`.

3. **Schedule outbox**
   ```powershell
   Invoke-RestMethod -Uri "$BASE/api/idp/v1/outbox/schedules" -Headers $headers
   ```
   An empty `items` array is fine before the first publish.

4. **Change request**
   Send the signed example from section 5.2. Expect
   `status: "pending"`. Resend the exact same body: expect
   `status: "duplicate"`. Change a field and resend: expect `409 duplicate_key`.

5. **Review + ack**
   ```powershell
   $jwt = $env:COE_NNECT_JWT
   Invoke-RestMethod -Uri "$BASE/api/v1/idp/change-requests?status=pending" `
     -Headers @{ Authorization = "Bearer $jwt" }

   Invoke-RestMethod -Method Post `
     -Uri "$BASE/api/v1/idp/change-requests/IDP-REQ-0001/ack" `
     -ContentType 'application/json' `
     -Headers @{ Authorization = "Bearer $jwt" } `
     -Body '{"action":"accepted","notes":"Staging verification."}'
   ```

6. **Ack outbox**
   ```powershell
   Invoke-RestMethod -Uri "$BASE/api/idp/v1/outbox/change-request-acks" `
     -Headers $headers
   ```
   Confirm the ack payload for `IDP-REQ-0001`.

7. **Cursor replay**
   Poll with the returned `next_since`; confirm the same item is returned
   (inclusive cursor) and that your client dedupes it.

8. **Failure paths**
   - Missing device key → `401 unauthorized`.
   - Wrong HMAC → `401 unauthorized`.
   - Stale timestamp (>5 min) → `401 unauthorized`.
   - Unknown term/faculty/subject → `422` with the matching code.

### 8.3 Acceptance checklist

- [ ] Health reports device key and webhook secret configured.
- [ ] Faculty snapshot applies without per-record failures.
- [ ] Schedule poll returns published items and advances `next_since`.
- [ ] Change-request retry is idempotent; conflicting reuse is `409`.
- [ ] Reviewer can list and acknowledge a pending request.
- [ ] Ack appears in the ack outbox exactly once.
- [ ] Invalid auth/signature/timestamp is rejected with `401`.
- [ ] Unknown references are rejected with the documented `422` code.

---

## 9. Local testing without the IDP team

You can exercise every CoE-NNECT endpoint with curl/PowerShell and a fake IDP.
Two options:

1. **Pattern C only** — no fake IDP needed. Use the device key and webhook
   secret from `apps/backend/.env` and run the section 8 steps against
   `http://localhost:3000`.
2. **Pattern A** — point `IDP_BASE_URL` at a small mock server (for example a
   local Express/Flask app) that returns the contract payloads, set
   `IDP_ENABLED=true`, then use the **Refresh from IDP** action or
   `POST /api/v1/idp/faculty/sync`.

The backend test suite already covers both patterns with fakes:

```powershell
cd apps/backend
npx jest --runInBand test/idp.service.spec.ts test/idp-outbox.service.spec.ts `
  test/idp-schedule-publisher.service.spec.ts `
  test/idp-faculty-request-publisher.service.spec.ts `
  test/idp-change-request.service.spec.ts `
  test/idp-device.guard.spec.ts test/idp-signature.guard.spec.ts
```

---

## 10. Open questions for the IDP team

1. Confirm the Pattern A base URL and API key for staging and production.
2. Confirm the final Pattern A paths for faculty-request status and
   change-request acks.
3. Confirm which of the eight change-request types IDP will send and whether
   the `details` shapes match contract 4.7.1.
4. Confirm whether IDP expects automatic application or reviewer
   acknowledgement only (current behaviour: reviewer decision, manual
   application).
5. Confirm retry/ack expectations, including the offline timestamp tolerance
   (contract allows up to 24 hours; CoE-NNECT currently enforces 5 minutes for
   online webhooks and relies on the outbox for offline delivery).
6. Confirm change-request retention and PII requirements.
7. Provide a staging faculty record and a staging change request for the
   end-to-end test.
