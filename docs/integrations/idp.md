# IDP integration

CoE-NNECT exchanges faculty data with the university's **Institutional Data
Platform (IDP)** under the CoE-NNECT ↔ IDP API Contract v2.0.

The IDP deployment is a **desktop application that can work offline**. The
integration therefore treats **Pattern C** as the primary transport:

- the IDP desktop pushes faculty snapshots to CoE-NNECT when it is online;
- the IDP desktop polls a durable CoE-NNECT outbox for published schedules,
  faculty-request statuses, and change-request acknowledgements;
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
| Faculty-request status outbox    | CoE-NNECT → IDP desktop | Implemented            |
| Change-request ack outbox        | CoE-NNECT → IDP desktop | Implemented            |
| Durable webhook idempotency      | Local                   | Implemented            |
| Faculty roster sync (Pattern A)  | IDP → CoE-NNECT         | Implemented (fallback) |
| Qualification sync (Pattern A)   | IDP → CoE-NNECT         | Implemented (fallback) |
| Unavailability sync (Pattern A)  | IDP → CoE-NNECT         | Implemented (fallback) |
| Faculty change webhook           | IDP → CoE-NNECT         | Implemented            |
| Change-request webhook           | IDP → CoE-NNECT         | Implemented            |
| Change-request review + ack      | User → CoE-NNECT → IDP  | Implemented            |
| Integration health check         | Local                   | Implemented            |
| "Refresh from IDP" action        | User → CoE-NNECT → IDP  | Implemented (fallback) |
| Schedule publishing              | CoE-NNECT → IDP         | Implemented            |
| Admin settings UI                | Local                   | Milestone 4            |

For the session-level record of the first implementation, see the
[Milestone 1 checkpoint](idp-milestone-1-checkpoint.md). Its notes about the
in-memory dedupe map are superseded by this document. Milestone 3 is recorded
in the [Milestone 3 checkpoint](idp-milestone-3-checkpoint.md).

## Architecture

```mermaid
flowchart LR
    Desktop[IDP desktop<br/>offline-capable]
    IDP[IDP REST API<br/>Pattern A fallback]
    API[NestJS IdpModule]
    DB[(PostgreSQL)]

    Desktop -->|POST /api/idp/v1/inbox/faculty| API
    Desktop -->|GET /api/idp/v1/outbox/schedules| API
    Desktop -->|GET /api/idp/v1/outbox/faculty-requests| API
    Desktop -->|GET /api/idp/v1/outbox/change-request-acks| API
    API -->|idp_outbox / idp_processed_event| DB
    API -->|idp_change_request| DB
    API -->|Pattern A pull / push| IDP
    IDP -->|signed webhook| API
    API -->|upsert faculty, qualifications, unavailability| DB
```



### DH schedule-change review (college_dean, college_secretary, department_head, administrator)

Department heads get a richer, conflict-aware review of the IDP schedule and
unavailability changes that matter to them. This is implemented by
\`IdpScheduleChangeReviewService\` and backed by:

- \`GET /api/v1/idp/schedule-change-requests\` — list with conflict analysis
- \`POST /api/v1/idp/schedule-change-requests/:id/decision\` — approve/reject + record the DH ack

Queries are scoped to the DH's department (or details that name it); only
\`schedule_override\` and \`unavailability_change\` surface in this queue.

**List:**

\`\`\`json
{
  "data": {
    "items": [{
      "idpRequestId": "IDP-REQ-0001",
      "type": "schedule_override",
      "status": "pending",
      "severity": "warning",
      "requiresAck": true,
      "requestedAt": "2026-11-11T10:00:00.000Z",
      "receivedAt": "2026-11-11T10:00:00.000Z",
      "faculty": { "facultyId": "1", "name": "Juan Dela Cruz", "deptCode": "CPE" },
      "subject": { "subjectId": "11", "subjectCode": "CPE 131", "title": "Data Structures" },
      "term": { "termId": "5", "label": "2026 · 1st" },
      "schedule": { "scheduleId": "77", "subjectCode": "CPE 131", "section": "CpE-1A", "room": "CET 205", "dayOfWeek": "Monday", "startTime": "08:00", "endTime": "09:00", "status": "active" },
      "proposed": { "dayOfWeek": "Thursday", "startTime": "09:00", "endTime": "10:00", "loadType": "lecture", "sectionCode": null, "roomId": null, "reason": "Teach CPE 131 for 8th week instead", "affectedDates": [] },
      "conflict": { "state": "ok", "summary": "No conflicts found for the proposed change.", "items": [] },
      "ack": null,
      "canReview": true,
      "requiresDeanUnfinalize": false,
      "details": { "term_code": "2026-2027-1st", "subject_code": "CPE 131", "day_of_week": "Thursday", "start_time": "09:00", "end_time": "10:00", "reason": "Teach CPE 131 for 8th week instead" }
    }],
    "counts": { "pending": 1, "ready": 0, "conflicted": 0, "warning": 0, "unknown": 0 }
  }
}\`\`\`

\`conflict.state\` is \`ok\` | \`warning\` | \`conflict\` | \`unknown\`. Each item in
\`items\` carries \`{ severity, ruleId, ruleName, reason }\` with severity
\`hard\` | \`soft\` | \`info\` (hard means blocking, soft is an advisory, and a
published-block item is informational).

**Decision:**

\`\`\`post
POST /api/v1/idp/schedule-change-requests/IDP-REQ-0001/decision

{
  "action": "accepted",            // or "rejected"
  "notes": "Optional reviewer note.",
  "acknowledgeConflicts": true     // required when conflict.state === "conflict"
}
\`\`\`

The response is \`{ request, ack, unfinalize }\`:

- \`ack\` is the exactly-once reviewer acknowledgement (same contract as
  \`POST /api/v1/idp/change-requests/:id/ack\`) and flows to the IDP desktop
  through the \`change_request.ack\` outbox.
- For \`accepted\` on \`schedule_override\` where the affected schedule is
  published, \`requiresDeanUnfinalize\` is true. When the caller is the DH, a
  Dean unfinalize request is filed automatically — the published-unfinalize
  rule is preserved without a second manual step.
- For \`unavailability_change\`, conflicts are computed by checking plotted
  classes on the same faculty and term that overlap the proposed window
  (rule id \`UNAVAIL-OVERLAP\`).
- For \`schedule_override\`, the full scheduling validator runs against the
  proposed subject, term, and slot (excluding the original schedule), so hard
  rule violations come back as blockers.

The module has these responsibilities:

- `IdpClientService` — outbound Pattern A HTTP client, timeout and error mapping.
- `IdpSyncService` — faculty inbox, roster / qualification / unavailability
  sync, webhook application, and the 30-day idempotency sweep.
- `IdpOutboxService` — durable queue for published schedules, faculty-request
  statuses, and change-request acknowledgements.
- `IdpSchedulePublisherService` — maps a schedule version to the contract 4.4
  payload, queues it, and optionally pushes it.
- `IdpFacultyRequestPublisherService` — maps a faculty request to the contract
  4.5 payload and refreshes its status in the outbox.
- `IdpChangeRequestService` — validates and stores inbound change requests.
  Auto-accepted contract types are recorded as acknowledged for audit; the
  remaining pending types wait for exactly one reviewer acknowledgement per
  `idp_request_id`. No inbound request mutates live schedule or faculty data.
- `IdpDeviceGuard` — per-device bearer authentication for Pattern C routes.
- `IdpSignatureGuard` — HMAC-SHA256 verification for inbound webhooks, with the
  contract's header aliases and the change-request API-key fallback.
- `IdpController` / `IdpSyncController` — the public IDP namespace and the
  authenticated user triggers.

## Endpoints

### Inbound (IDP → CoE-NNECT)

| Method | Path                                         | Auth              | Purpose                          |
| ------ | -------------------------------------------- | ----------------- | -------------------------------- |
| `GET`  | `/api/idp/v1/health`                         | Public            | Integration/configuration health |
| `POST` | `/api/idp/v1/webhooks/faculty-changed`       | HMAC-SHA256       | Faculty change event             |
| `POST` | `/api/idp/v1/webhooks/change-request`        | HMAC-SHA256 or API key | Change request (contract 4.5)    |
| `POST` | `/api/idp/v1/inbox/faculty`                  | Device bearer key | Pattern C faculty snapshot       |
| `GET`  | `/api/idp/v1/outbox/schedules?since=&limit=&deptCode=` | Device bearer key | Pattern C schedule poll          |
| `GET`  | `/api/idp/v1/schedules/classes?deptCode=`    | Device bearer key | Department class-reference lookup |
| `GET`  | `/api/idp/v1/outbox/faculty-requests?since=&limit=` | Device bearer key | Pattern C faculty-request poll |
| `GET`  | `/api/idp/v1/outbox/change-request-acks?since=&limit=` | Device bearer key | Pattern C change-request-ack poll |
| `GET` | `/api/v1/idp/schedule-change-requests` | Device bearer key | DH review: list with conflict analysis |
| `POST` | `/api/v1/idp/schedule-change-requests/:id/decision` | Device bearer key | DH review: approve/reject + record ack |

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

`X-COE-NNECT-Signature` and `X-COE-NNECT-Timestamp` are accepted aliases.
`POST /api/idp/v1/webhooks/change-request` additionally accepts the shared
integration key through `X-IDP-API-Key`, `X-COE-NNECT-Key`, `X-API-Key`, or
`Authorization: Bearer`. The faculty-change webhook stays HMAC-only.

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

`GET /api/idp/v1/outbox/schedules?since=<iso>&limit=<n>&deptCode=<code>` returns
published schedules oldest first. `since` is inclusive and `limit` is 1-200
(default 50). `deptCode` is optional and filters each returned payload's
`entries` by department code (case-insensitive), for example
`?deptCode=CPE`. Keep a separate `next_since` cursor for each department filter.

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
          "entries": [
            {
              "coe_nnect_schedule_id": "1",
              "department_code": "CPE",
              "section_code": "CpE-1A",
              "subject_code": "CPE 111",
              "faculty_wmsu_id": "2019-00123",
              "external_faculty_name": null,
              "room_number": "CET 205",
              "external_room_name": null,
              "day": "Monday",
              "start_time": "08:00",
              "end_time": "09:00",
              "load_type": "lecture"
            }
          ]
        }
      }
    ],
    "next_since": "2026-11-11T10:00:00.000Z",
    "server_time": "2026-11-11T10:00:05.000Z"
  }
}
```

Published entries use the contract v2.0 field `day` (for example `"day":
"Monday"`). Do not send the legacy `day_of_week` name in a schedule payload.

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

### Department class-reference lookup

`GET /api/idp/v1/schedules/classes?deptCode=CPE` returns class references for
finalized or published, unflagged schedules in the requested department:

```json
{
  "data": [
    {
      "subject_code": "CPE 111",
      "section_code": "CPE 1-A",
      "course_title": "Introduction to Computing",
      "class_code": "123"
    }
  ]
}
```

`class_code` is the CoE-NNECT schedule row ID. Department codes are matched
case-insensitively; an unknown code returns `unknown_department`.

### Pattern C faculty-request status outbox

`GET /api/idp/v1/outbox/faculty-requests?since=<iso>&limit=<n>` returns the
current status of every faculty request CoE-NNECT has published (contract 4.5 /
5.5).

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

Unlike schedule items, faculty-request items are **refreshed in place**:
`coe_nnect_request_id` is the idempotency key, and a new status overwrites the
existing row and moves its `created_at` cursor forward. A client that polls
after being offline therefore receives the latest status once, not a history of
every transition. Dedupe on `payload.coe_nnect_request_id` plus `status`.

Every create, approve, reject, and cancel transition queues a status. The local
approval transaction is never rolled back if IDP is unreachable: the outbox row
survives and is delivered on the next poll or replay.

### Change requests and acknowledgements

Change requests implement contract 4.5. The webhook accepts either an
HMAC-signed body or the integration-key fallback described above.

**Inbound webhook.** `POST /api/idp/v1/webhooks/change-request` requires only
`idp_request_id` and `type`. Optional fields are `faculty_wmsu_id`,
`faculty_employee_id`, `affected_dates`, `details`, `severity`, `requires_ack`,
and `created_at`. The receiver applies contract defaults before storing:

| Field          | Default                                                        |
| -------------- | -------------------------------------------------------------- |
| `severity`     | `info`                                                         |
| `details`      | `{}`                                                           |
| `created_at`   | receive time                                                   |
| `requires_ack` | `false` for auto-accepted types, `true` for pending types      |

`idp_request_id` is the idempotency key:

- same `idp_request_id` and same effective body → `200` with
  `status: "duplicate"`;
- same `idp_request_id` and different body → `409 duplicate_key`;
- new pending type → `200` with `status: "pending"`;
- new auto-accepted type → `200` with `status: "acknowledged"`.

The request is stored in `public.idp_change_request` and is **never applied
automatically**.

**Auto-accepted vs pending.** Contract 4.5 splits the eight types:

- **Auto-accepted:** `faculty_create`, `faculty_update`, `faculty_deactivate`,
  `qualification_add`, `qualification_remove`. These are stored as
  `acknowledged` with `ack_action='accepted'` and no reviewer. They stay out of
  the pending queue and do not mutate live data. An unknown faculty key is
  tolerated. If the sender explicitly sets `requires_ack: true`, a system ack
  (`acknowledged_by_coe_nnect_user_id: "0"`) is queued in the outbox.
- **Pending review:** `unavailability_change`, `schedule_override`,
  `faculty_transfer`. These remain `pending` until a Dean, college secretary,
  or administrator records one acknowledgement.

`schedule_override` may omit both faculty keys because it can describe a
department- or term-wide change. `unavailability_change` and
`faculty_transfer` still require a faculty key that resolves locally.

Detail validation is best-effort: fields that are present are checked against
local reference data (department, subject, term, section, designation, day, and
time window), but no type-specific `details` field is mandatory. Unknown
faculty, department, subject, term, section, or designation references fail
with the matching `422` code.

**Review API.** Dean, college secretary, and administrator roles can list,
read, and acknowledge requests:

| Method | Path                                    | Purpose                     |
| ------ | --------------------------------------- | --------------------------- |
| `GET`  | `/api/v1/idp/change-requests`           | List, filter by status/type |
| `GET`  | `/api/v1/idp/change-requests/:id`       | Read one request            |
| `POST` | `/api/v1/idp/change-requests/:id/ack`   | Record the reviewer decision |

```json
{
  "action": "accepted",
  "notes": "Applied to the 2026-2027 first semester timetable."
}
```

`action` is `accepted`, `rejected`, or `modified`. Acknowledging records the
decision; the reviewer still applies the underlying schedule or faculty change
through the existing screens. Keeping the proposal separate from the
authoritative schedule prevents an IDP message from mutating live data without
review.

**Exactly-once ack.** Each `idp_request_id` accepts one decision. Repeating the
same action and notes returns the stored ack with `duplicate: true`. A
different decision returns `409 duplicate_key`. The ack is written to the
durable outbox under `kind='change_request.ack'` and, when Pattern A is
configured, pushed to `POST {IDP_BASE_URL}/change-requests/{id}/ack`. The
upstream payload is `action`, `notes`, and
`acknowledged_by_coe_nnect_user_id`; the response echoes `idp_request_id`,
`action`, `acknowledged_by_coe_nnect_user_id`, and `acknowledged_at`.

**Review UI.** Dean and college-secretary accounts see the queue at
`/dean/idp/change-requests`. The page lists incoming requests, filters by
status, type, and free-text search, shows the full `details` payload and
affected dates, and records `accepted`, `rejected`, or `modified` with optional
notes. It also shows Pattern C / Pattern A readiness from
`GET /api/idp/v1/health`. Auto-accepted rows appear as acknowledged with an
auto-accept note and no reviewer. Recording a decision never applies the
underlying change; the reviewer still edits the schedule or faculty record
through the existing screens.

### Pattern C change-request ack outbox

`GET /api/idp/v1/outbox/change-request-acks?since=<iso>&limit=<n>` returns the
acks CoE-NNECT has issued:

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

Ack items are written once per `idp_request_id`. Dedupe on
`payload.idp_request_id`; the IDP desktop should treat the ack as final.

### Outbound (CoE-NNECT → IDP, Pattern A fallback)

| Method | Path                                                     | Purpose                 |
| ------ | -------------------------------------------------------- | ----------------------- |
| `GET`  | `{IDP_BASE_URL}/faculty?department_code=&updated_since=` | Roster pull             |
| `GET`  | `{IDP_BASE_URL}/faculty/{key}/qualifications`            | Qualification pull      |
| `GET`  | `{IDP_BASE_URL}/faculty/{key}/unavailability?term_code=` | Unavailability pull     |
| `POST` | `{IDP_BASE_URL}/schedules/published`                     | Published-schedule push |
| `POST` | `{IDP_BASE_URL}/faculty-requests`                        | Faculty-request status  |
| `POST` | `{IDP_BASE_URL}/change-requests/{id}/ack`                | Change-request ack      |

`{key}` is `wmsu_id` when present, otherwise `employee_id`. `IDP_BASE_URL`
must include the contract namespace (`/api/idp/v1`), so the paths above resolve
to `/api/idp/v1/faculty`, `/api/idp/v1/schedules/published`, and so on. Do not
point it at the bare server root.

The Dean Approvals page's **Publish** action updates the selected schedules and
then queues the active term's finalized schedule through
`POST /api/v1/idp/schedules/publish`. Its **Send to IDP** action can queue or
retry the active term without changing schedule statuses. A schedule's
`published` status by itself does not create an outbox item. The endpoint
always queues the payload first. When Pattern A is configured, it also pushes
immediately. A push failure does not roll back the local publish or remove the
queued item; the result reports `queued: true`, `delivered: false`, and the
upstream error.

Faculty-request statuses and change-request acks follow the same
queue-first rule. Approval responses are never blocked by an IDP outage.

### User trigger (application API)

| Method | Path                                      | Roles                                                  |
| ------ | ----------------------------------------- | ------------------------------------------------------ |
| `POST` | `/api/v1/idp/faculty/sync`                | `college_dean`, `college_secretary`, `department_head` |
| `GET`  | `/api/v1/idp/schedules/payload?termCode=` | `college_dean`, `college_secretary`, `administrator`   |
| `POST` | `/api/v1/idp/schedules/publish`           | `college_dean`, `college_secretary`, `administrator`   |
| `GET`  | `/api/v1/idp/change-requests`             | `college_dean`, `college_secretary`, `administrator`   |
| `GET`  | `/api/v1/idp/change-requests/:id`         | `college_dean`, `college_secretary`, `administrator`   |
| `POST` | `/api/v1/idp/change-requests/:id/ack`     | `college_dean`, `college_secretary`, `administrator`   |

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
IDP_BASE_URL=https://adp-server-3m0u.onrender.com/api/idp/v1
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
| `IDP_BASE_URL`             | IDP REST namespace including `/api/idp/v1`, without a trailing slash       |
| `IDP_API_KEY`              | Bearer token for outbound Pattern A requests; also the change-request API-key fallback |
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
- With no `IDP_WEBHOOK_SECRET`, HMAC-signed webhooks are rejected with `401`.
  The change-request API-key fallback still works when `IDP_API_KEY` is set.

For hosted deployments, set
`IDP_BASE_URL=https://adp-server-3m0u.onrender.com/api/idp/v1` in the Railway
service variables (or the equivalent deployment secret store). The repository
cannot update the hosted value; changing `.env.example` only documents the
required format.

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

1. `X-IDP-Timestamp` (or `X-COE-NNECT-Timestamp`) is valid ISO 8601 and within
   the tolerance window.
2. `X-IDP-Signature` (or `X-COE-NNECT-Signature`) equals `sha256=` +
   HMAC-SHA256 of the **raw** request body.
3. The comparison is constant-time.

The change-request webhook also accepts the shared integration key through
`X-IDP-API-Key`, `X-COE-NNECT-Key`, `X-API-Key`, or
`Authorization: Bearer`. A valid API key bypasses HMAC for that route only;
the faculty-change webhook remains HMAC-only.

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
| `public.idp_outbox`          | Outbound payloads for polling clients        | No automatic expiry              |
| `public.idp_change_request`  | Inbound change requests and their one ack    | Retained for review/audit        |

`public.idp_outbox` holds three kinds: `schedule.published` (frozen,
append-only), `faculty_request.status` (one row per request, refreshed in
place), and `change_request.ack` (one row per `idp_request_id`).

All three tables have RLS enabled with no client policies and no
anon/authenticated grants. Only the NestJS API connects through `DATABASE_URL`,
so direct Supabase clients cannot read or tamper with integration state.

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
`unknown_subject`, `unknown_section`, `unknown_term`, `unknown_faculty`,
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
npx jest --runInBand test/idp.service.spec.ts test/idp-outbox.service.spec.ts test/idp-schedule-publisher.service.spec.ts test/idp-faculty-request-publisher.service.spec.ts test/idp-change-request.service.spec.ts test/idp-device.guard.spec.ts test/idp-signature.guard.spec.ts
```

The tests cover HMAC acceptance/rejection, the timestamp window, device-key
auth, roster creation, idempotent second pulls, unknown department codes,
`local_edit_pending`, durable webhook dedupe / `duplicate_key`, the 30-day
sweep, faculty inbox per-record failures, outbox enqueue/freeze/poll
semantics, in-place faculty-request status refresh, change-request validation,
exactly-once acks, and Pattern A push fallback.

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

### Manual change-request smoke test

```powershell
$body = '{"idp_request_id":"IDP-REQ-0001","type":"unavailability_change","faculty_wmsu_id":"2019-00123","faculty_employee_id":null,"affected_dates":["2026-11-18"],"details":{"term_code":"2026-2027-1st","day_of_week":"Monday","start_time":"13:00","end_time":"15:00","reason":"External load"},"severity":"warning","requires_ack":true,"created_at":"2026-11-11T10:00:00Z"}'
$ts = (Get-Date).ToUniversalTime().ToString("o")
$secret = "your-secret"
$hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
$sig = ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body))) -replace '-','').ToLower()

Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/idp/v1/webhooks/change-request `
  -ContentType 'application/json' -Body $body `
  -Headers @{ 'X-IDP-Signature' = "sha256=$sig"; 'X-IDP-Timestamp' = $ts }

# Review and acknowledge as a Dean/secretary/administrator (JWT required)
Invoke-RestMethod -Method Get -Uri 'http://localhost:3000/api/v1/idp/change-requests?status=pending' `
  -Headers @{ Authorization = "Bearer $env:COE_NNECT_JWT" }

Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/v1/idp/change-requests/IDP-REQ-0001/ack' `
  -ContentType 'application/json' `
  -Headers @{ Authorization = "Bearer $env:COE_NNECT_JWT" } `
  -Body '{"action":"accepted","notes":"Applied to the timetable."}'

# Poll the ack outbox as the IDP desktop
Invoke-RestMethod -Uri 'http://localhost:3000/api/idp/v1/outbox/change-request-acks' `
  -Headers @{ Authorization = "Bearer $env:IDP_DEVICE_API_KEY" }
```

## Open items

Still to confirm with the IDP team before a live sync:

1. Device-key distribution and rotation process.
2. Faculty key coverage for every record.
3. Department code mapping.
4. Subject code format / mapping.
5. Section code format / mapping.
6. Term code format (`YYYY-YYYY-semester`).
7. Whether IDP tracks qualifications and their shape.
8. Whether IDP tracks unavailability and whether it is weekly recurring.
9. Retry/ack expectations and the offline timestamp tolerance (contract allows
   up to 24 hours).
10. PII retention requirements.
11. Sandbox/staging URL and test credentials.

The contract's pending-change-request pull
(`GET /api/idp/v1/integration/change-requests/pending`) is intentionally not
implemented yet because the response schema is not specified. Reviewers use
the local review queue, and the IDP desktop collects acks from the Pattern C
outbox.

## Related documentation

- [Milestone 1 checkpoint](idp-milestone-1-checkpoint.md)
- [Milestone 3 checkpoint](idp-milestone-3-checkpoint.md)
- [Integration handoff and test plan](idp-handoff.md)
- [Backend guide](../apps/backend.md)
- [Frontend guide](../apps/frontend.md)
- [System architecture](../architecture/README.md)
- [IDP client package status](../packages/idp-client.md)
- [Testing guide](../testing.md)
