# IDP integration

CoE-NNECT exchanges faculty data with the university's **Institutional Data
Platform (IDP)** under the CoE-NNECT ↔ IDP API Contract v2.0.

The IDP deployment is a **desktop application that can work offline**. The
integration therefore treats **Pattern C** as the primary transport:

- the IDP desktop pushes faculty snapshots to CoE-NNECT when it is online;
- the IDP desktop polls a durable CoE-NNECT outbox for published schedules;
- CoE-NNECT keeps every payload and idempotency key until the client has had a
  chance to collect it.

**Pattern A** remains as an optional fallback: server-to-server REST pulls plus
signed inbound webhooks, used when a deployment exposes an IDP API that
CoE-NNECT can call directly.

> The `packages/idp-client` workspace package is still a reserved placeholder.
> The working integration lives in `apps/backend/src/modules/idp/`. See
> [IDP client package status](../packages/idp-client.md).

## Current status

| Capability                       | Direction               | Status                 |
| -------------------------------- | ----------------------- | ---------------------- |
| Faculty inbox push (Pattern C)   | IDP desktop → CoE-NNECT | Implemented            |
| Schedule outbox poll (Pattern C) | CoE-NNECT → IDP desktop | Implemented            |
| Durable webhook idempotency      | Local                   | Implemented            |
| Faculty roster sync (Pattern A)  | IDP → CoE-NNECT         | Implemented (fallback) |
| Qualification sync (Pattern A)   | IDP → CoE-NNECT         | Implemented (fallback) |
| Unavailability sync (Pattern A)  | IDP → CoE-NNECT         | Implemented (fallback) |
| Faculty change webhook           | IDP → CoE-NNECT         | Implemented            |
| Integration health check         | Local                   | Implemented            |
| "Refresh from IDP" action        | User → CoE-NNECT → IDP  | Implemented (fallback) |
| Schedule publishing              | CoE-NNECT → IDP         | Implemented            |
| Change requests and acks         | Bidirectional           | Milestone 3            |
| Admin settings UI                | Local                   | Milestone 4            |

For the session-level record of the first implementation, see the
[Milestone 1 checkpoint](idp-milestone-1-checkpoint.md). Its notes about the
in-memory dedupe map are superseded by this document.

## Architecture

```mermaid
flowchart LR
    Desktop[IDP desktop<br/>offline-capable]
    IDP[IDP REST API<br/>Pattern A fallback]
    API[NestJS IdpModule]
    DB[(PostgreSQL)]

    Desktop -->|POST /api/idp/v1/inbox/faculty| API
    Desktop -->|GET /api/idp/v1/outbox/schedules| API
    API -->|idp_outbox / idp_processed_event| DB
    API -->|Pattern A pull / push| IDP
    IDP -->|signed webhook| API
    API -->|upsert faculty, qualifications, unavailability| DB
```

The module has these responsibilities:

- `IdpClientService` — outbound Pattern A HTTP client, timeout and error mapping.
- `IdpSyncService` — faculty inbox, roster / qualification / unavailability
  sync, webhook application, and the 30-day idempotency sweep.
- `IdpOutboxService` — durable queue of frozen published-schedule payloads.
- `IdpDeviceGuard` — per-device bearer authentication for Pattern C routes.
- `IdpSignatureGuard` — HMAC-SHA256 verification for inbound webhooks.
- `IdpController` / `IdpSyncController` — the public IDP namespace and the
  authenticated user triggers.

## Endpoints

### Inbound (IDP → CoE-NNECT)

| Method | Path                                         | Auth              | Purpose                          |
| ------ | -------------------------------------------- | ----------------- | -------------------------------- |
| `GET`  | `/api/idp/v1/health`                         | Public            | Integration/configuration health |
| `POST` | `/api/idp/v1/webhooks/faculty-changed`       | HMAC-SHA256       | Faculty change event             |
| `POST` | `/api/idp/v1/inbox/faculty`                  | Device bearer key | Pattern C faculty snapshot       |
| `GET`  | `/api/idp/v1/outbox/schedules?since=&limit=` | Device bearer key | Pattern C schedule poll          |

Pattern C calls send:

```text
Authorization: Bearer <IDP_DEVICE_API_KEY>
X-Request-ID:    <uuid>            (optional; echoed in logs and errors)
```

If `IDP_DEVICE_API_KEY` is not configured, every Pattern C call fails closed
with `401 unauthorized`. The health response reports whether the device key and
webhook secret are present, but never returns their values.

Webhook headers:

```text
X-Request-ID:    <uuid>            (optional; echoed in logs and errors)
X-IDP-Signature: sha256=<hex>      (HMAC-SHA256 over the raw JSON body)
X-IDP-Timestamp: <ISO 8601>        (5-minute online tolerance by default)
```

### Pattern C faculty inbox

`POST /api/idp/v1/inbox/faculty` accepts either the contract's bare array or an
envelope:

```json
{
  "faculty": [
    {
      "wmsu_id": "2019-00123",
      "employee_id": null,
      "first_name": "Juan",
      "last_name": "Dela Cruz",
      "email": "juan@wmsu.edu.ph",
      "contact": null,
      "department_code": "CPE",
      "is_active": true
    }
  ]
}
```

Each record follows the same matching, ownership, and sync-state rules as the
Pattern A roster pull (see [Sync semantics](#sync-semantics)). Per-record
failures do not abort the snapshot; they are counted in `failed` or `skipped`
and appended to `errors[]`.

```json
{
  "data": {
    "received": 120,
    "created": 3,
    "updated": 8,
    "unchanged": 109,
    "skipped": 0,
    "failed": 0,
    "errors": [],
    "startedAt": "2026-11-11T10:00:00.000Z",
    "finishedAt": "2026-11-11T10:00:02.000Z"
  }
}
```

A row with a pending local edit returns `409 local_edit_pending` in that
record's error entry, not as a request-level failure.

### Pattern C schedule outbox

`GET /api/idp/v1/outbox/schedules?since=<iso>&limit=<n>` returns published
schedules oldest first. `since` is inclusive and `limit` is 1-200 (default 50).

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

Client rules:

1. Dedupe on `payload.coe_nnect_version_id` (the same value as
   `idempotency_key` for schedule items).
2. Persist `next_since` and send it on the next poll.
3. `next_since` may repeat the last item's timestamp. Re-reading one item is
   harmless; skipping a same-timestamp row is not.
4. `limit` only bounds a page. Keep polling while `items` is non-empty to catch
   up after a long offline period.

Outbox items are append-only and frozen at first publish. Re-publishing the same
`schedule_version` returns the original payload and the same `outbox_id`, even
if live schedule rows changed afterwards. This guarantees that an offline
client receives exactly what the Dean published.

### Outbound (CoE-NNECT → IDP, Pattern A fallback)

| Method | Path                                                     | Purpose                 |
| ------ | -------------------------------------------------------- | ----------------------- |
| `GET`  | `{IDP_BASE_URL}/faculty?department_code=&updated_since=` | Roster pull             |
| `GET`  | `{IDP_BASE_URL}/faculty/{key}/qualifications`            | Qualification pull      |
| `GET`  | `{IDP_BASE_URL}/faculty/{key}/unavailability?term_code=` | Unavailability pull     |
| `POST` | `{IDP_BASE_URL}/schedules/published`                     | Published-schedule push |

`{key}` is `wmsu_id` when present, otherwise `employee_id`. The path names are
the indicative ones from the contract; confirm them with the IDP team before
pointing `IDP_BASE_URL` at a real deployment.

`POST /api/v1/idp/schedules/publish` always queues the payload to the outbox
first. When Pattern A is configured, it also pushes immediately. A push failure
does not roll back the local publish or remove the queued item; the result
reports `queued: true`, `delivered: false`, and the upstream error.

### User trigger (application API)

| Method | Path                                      | Roles                                                  |
| ------ | ----------------------------------------- | ------------------------------------------------------ |
| `POST` | `/api/v1/idp/faculty/sync`                | `college_dean`, `college_secretary`, `department_head` |
| `GET`  | `/api/v1/idp/schedules/payload?termCode=` | `college_dean`, `college_secretary`, `administrator`   |
| `POST` | `/api/v1/idp/schedules/publish`           | `college_dean`, `college_secretary`, `administrator`   |

All sync body fields are optional:

```json
{
  "departmentCode": "CPE",
  "termCode": "2026-2027-1st",
  "includeQualifications": true,
  "includeUnavailability": true
}
```

- A department head is scoped to their own department; requesting another
  department returns `403`.
- `includeQualifications` defaults to `true`.
- `includeUnavailability` defaults to `true` when `termCode` is set.
- The Faculty page exposes this as the **Refresh from IDP** button.

## Configuration

Set these in `apps/backend/.env` (the template is in `.env.example`):

```dotenv
# Pattern A fallback
IDP_ENABLED=false
IDP_BASE_URL=
IDP_API_KEY=

# Pattern C desktop access
IDP_DEVICE_API_KEY=

# Webhooks
IDP_WEBHOOK_SECRET=
IDP_REQUEST_TIMEOUT_MS=15000
IDP_WEBHOOK_TOLERANCE_MS=300000
```

| Variable                   | Meaning                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `IDP_ENABLED`              | Master switch for Pattern A outbound pulls, pushes, and the refresh action |
| `IDP_BASE_URL`             | IDP REST base URL, without a trailing slash                                |
| `IDP_API_KEY`              | Bearer token for outbound Pattern A requests                               |
| `IDP_DEVICE_API_KEY`       | Per-device bearer key the IDP desktop presents on inbox/outbox calls       |
| `IDP_WEBHOOK_SECRET`       | Shared secret for inbound HMAC verification                                |
| `IDP_REQUEST_TIMEOUT_MS`   | Outbound timeout, default `15000`                                          |
| `IDP_WEBHOOK_TOLERANCE_MS` | Allowed clock skew, default `300000` (5 min)                               |

Readiness:

- **Pattern C inbound** is ready when `IDP_DEVICE_API_KEY` and
  `IDP_WEBHOOK_SECRET` are both set. It does not depend on `IDP_ENABLED`.
- **Pattern A outbound** is ready when `IDP_ENABLED=true` and `IDP_BASE_URL` is
  set.
- With `IDP_ENABLED` false or `IDP_BASE_URL` empty, the refresh action returns
  `503`.
- With no `IDP_WEBHOOK_SECRET`, every webhook is rejected with `401`.

Store real values in the deployment environment, never in git. Rotate the
device key by replacing `IDP_DEVICE_API_KEY` and distributing the new value to
the IDP team through a secure channel.

## Sync semantics

### Faculty matching

- Match `wmsu_id` first, then `employee_id`.
- If both keys resolve to different rows, the record fails with
  `422 faculty_key_conflict`.
- New keys create a faculty row. CoE-NNECT-owned fields
  (`designation_id`, `classification`, `required_hours`) keep local defaults.
- The same rules apply to Pattern A pulls and Pattern C inbox records.

### Identity ownership

IDP owns and overwrites these fields on sync:

`first_name`, `last_name`, `email`, `contact`, `wmsu_id`, `employee_id`,
`dept_id`, `is_active`.

CoE-NNECT owns `designation_id`, `classification`, and `required_hours`; IDP
values for those fields are ignored.

### Sync state

- Successful apply: `sync_status='synced'`, `last_synced_at=now()`.
- Failed record: `sync_status='failed'`; `last_synced_at` is unchanged.
- A local edit to an IDP-owned identity field, or toggling active, sets
  `sync_status='pending'`.
- While a **previously synced** row is pending, incoming IDP updates are
  rejected with `409 local_edit_pending`. Rows that have never been synced
  (`last_synced_at IS NULL`) are allowed through so the first roster pull can
  adopt pre-existing records.
- A second identical pull or inbox push is a no-op (`unchanged` increments).

### Qualifications

- Pulled per faculty from `GET /faculty/{key}/qualifications` (Pattern A).
- New rows are tagged `source_system='IDP'`.
- Local rows (`source_system=NULL`) are kept.
- `(faculty_id, subject_id)` is unique, so an existing local row is never
  replaced or re-tagged.

### Unavailability

- Pulled per faculty and term from
  `GET /faculty/{key}/unavailability?term_code=...` (Pattern A).
- CoE-NNECT stores weekly recurring windows (`day_of_week`, `start_time`,
  `end_time`), not date-specific exceptions.
- Sync is a full replace of `source='idp'` rows for that faculty/term.
  `source='local'` rows are never touched.
- `external_id` is the IDP idempotency key.

### Incremental pulls

The Pattern A roster pull sends `updated_since` equal to the maximum
`faculty.last_synced_at`, when one exists. The first pull is full. Pattern C
pushes are snapshots; the client decides how much of the roster to send, and
CoE-NNECT applies each record idempotently.

## Webhook security and idempotency

The webhook guard verifies:

1. `X-IDP-Timestamp` is valid ISO 8601 and within the tolerance window.
2. `X-IDP-Signature` equals `sha256=` + HMAC-SHA256 of the **raw** request body.
3. The comparison is constant-time.

`NestFactory.create(..., { rawBody: true })` is required in `main.ts`; without
it the guard fails closed.

`event_id` is the idempotency key and is persisted in
`public.idp_processed_event`:

- Same `event_id` and same body hash → `200` with `status: "duplicate"`.
- Same `event_id` and different body hash → `409 duplicate_key`.
- Records survive process restarts and are shared by every backend instance.
- Keys are retained for 30 days. A nightly 03:00 sweep deletes older rows.

The unique primary key makes a concurrent double-delivery safe: the insert
race is converted into the same duplicate answer instead of a `500`.

Schedule idempotency uses a separate table, `public.idp_outbox`, with a unique
`(kind, idempotency_key)` pair.

## Database objects

| Table                        | Purpose                                      | Retention                        |
| ---------------------------- | -------------------------------------------- | -------------------------------- |
| `public.idp_processed_event` | Inbound webhook/event idempotency            | 30 days, nightly sweep           |
| `public.idp_outbox`          | Frozen outbound payloads for polling clients | Append-only; no automatic expiry |

Both tables have RLS enabled with no client policies and no anon/authenticated
grants. Only the NestJS API connects through `DATABASE_URL`, so direct Supabase
clients cannot read or tamper with integration state.

## Public-page exposure

The public landing page uses a separate read-only API under `/api/v1/public/*`.
It exposes only published schedules, aggregate counts, and faculty names,
departments, designations, and an IDP-linked badge. The integration card reports
only booleans for whether each credential is configured, including
`deviceApiKeyConfigured`. It never returns IDP credentials, API keys, device
keys, webhook secrets, internal integration URLs, or faculty
email/contact/employee/WMSU identifiers. Keep any new public field review
focused on that boundary; the existing Swagger docs remain gated in production
by `ENABLE_SWAGGER=true` plus basic auth.

## Error format

IDP-namespace failures use the contract envelope:

```json
{
  "error": {
    "code": "unknown_department",
    "message": "Department code 'BSCPE' is not configured in CoE-NNECT.",
    "details": { "field": "department_code", "value": "BSCPE" },
    "request_id": "8f14e45f-ea2b-4b6e-9f3a-1c2d3e4f5a6b"
  }
}
```

Codes currently emitted: `validation_error`, `unknown_department`,
`unknown_subject`, `unknown_term`, `unknown_faculty`,
`faculty_key_conflict`, `local_edit_pending`, `duplicate_key`,
`unauthorized`, and `internal_error`.

Bulk faculty pushes do not abort on a bad record; the record is counted in
`skipped` or `failed` and its error is added to `errors[]`.

## Local development and testing

Backend checks:

```powershell
cd apps/backend
npx tsc --noEmit -p tsconfig.json
npx tsc -p tsconfig.spec.json
npx jest --runInBand
npx nest build
```

Frontend check:

```powershell
cd apps/frontend
npx tsc --noEmit
```

Targeted IDP tests:

```powershell
cd apps/backend
npx jest --runInBand test/idp.service.spec.ts test/idp-outbox.service.spec.ts test/idp-schedule-publisher.service.spec.ts test/idp-device.guard.spec.ts test/idp-signature.guard.spec.ts
```

The tests cover HMAC acceptance/rejection, the timestamp window, device-key
auth, roster creation, idempotent second pulls, unknown department codes,
`local_edit_pending`, durable webhook dedupe / `duplicate_key`, the 30-day
sweep, faculty inbox per-record failures, outbox enqueue/freeze/poll
semantics, and Pattern A push fallback.

### Manual Pattern C smoke test

```powershell
$headers = @{ Authorization = "Bearer $env:IDP_DEVICE_API_KEY" }

# Push a faculty snapshot
$faculty = @{
  faculty = @(
    @{
      wmsu_id = '2019-00123'
      employee_id = $null
      first_name = 'Juan'
      last_name = 'Dela Cruz'
      email = 'juan@wmsu.edu.ph'
      department_code = 'CPE'
      is_active = $true
    }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/idp/v1/inbox/faculty `
  -ContentType 'application/json' -Body $faculty -Headers $headers

# Poll the schedule outbox
Invoke-RestMethod -Uri 'http://localhost:3000/api/idp/v1/outbox/schedules?limit=50' `
  -Headers $headers
```

### Manual webhook smoke test

```powershell
$body = '{"event_id":"evt-1","event":"faculty.updated","faculty_wmsu_id":"2019-00123","change_summary":{"email":"a@b.c"},"changed_at":"2026-11-08T10:00:00Z"}'
$ts = (Get-Date).ToUniversalTime().ToString("o")
$secret = "your-secret"
$hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
$sig = ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body))) -replace '-','').ToLower()

Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/idp/v1/webhooks/faculty-changed `
  -ContentType 'application/json' -Body $body `
  -Headers @{ 'X-IDP-Signature' = "sha256=$sig"; 'X-IDP-Timestamp' = $ts }
```

## Open items

Still to confirm with the IDP team before a live sync:

1. Device-key distribution and rotation process.
2. HMAC-SHA256 support and header format for desktop-originated webhooks.
3. Faculty key coverage for every record.
4. Department code mapping.
5. Subject code format / mapping.
6. Section code format / mapping.
7. Term code format (`YYYY-YYYY-semester`).
8. Whether IDP tracks qualifications and their shape.
9. Whether IDP tracks unavailability and whether it is weekly recurring.
10. Change-request types IDP will send.
11. Retry/ack expectations and the offline timestamp tolerance (contract allows
    up to 24 hours).
12. Whether IDP can force schedule changes.
13. PII retention requirements.
14. Sandbox/staging URL and test credentials.

## Related documentation

- [Milestone 1 checkpoint](idp-milestone-1-checkpoint.md)
- [Backend guide](../apps/backend.md)
- [Frontend guide](../apps/frontend.md)
- [System architecture](../architecture/README.md)
- [IDP client package status](../packages/idp-client.md)
- [Testing guide](../testing.md)
