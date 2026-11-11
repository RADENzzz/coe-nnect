# IDP Integration — Milestone 3 Checkpoint

> Status: **implemented, verified, open for review**
> Branch: `idp/integration`
> Contract: `Documents/CoE-NNECT-IDP API Contract v2.txt` (v2.0, 2026-10-23)
> Pattern: **C — durable outbox + device-key auth** (Pattern A remains a fallback)
> Feature guide: [IDP integration](idp.md)

This file records Milestone 3: inbound change requests, change-request
acknowledgements, faculty-request status publishing, and the remaining
Pattern C outbox endpoints. The canonical behaviour reference is
[`idp.md`](idp.md); this checkpoint adds the implementation record, file
inventory, and handoff notes.

---

## 1. What Milestone 3 covers

| Capability | Contract | Status |
|---|---|---|
| Change-request webhook (IDP → CoE-NNECT) | 4.7 / 5.7 | Done |
| Change-request validation against local reference data | 4.7.1 | Done |
| Change-request review queue (list/read) | 4.7 | Done |
| Exactly-once change-request acknowledgement | 4.8 / 5.7 | Done |
| Change-request ack outbox poll | 4.8 / 6.4 | Done |
| Faculty-request status publishing | 4.5 / 5.5 | Done |
| Faculty-request status outbox poll | 4.5 / 6.4 | Done |
| Approvals publish status without blocking | Local | Done |
| Admin settings UI | Milestone 4 | Out of scope |

The change-request acknowledgement is a **reviewer decision**, not an automatic
mutation. The reviewer applies the underlying schedule or faculty change
through the existing screens and records the decision in CoE-NNECT. This keeps
an IDP proposal separate from CoE-NNECT's authoritative scheduling data.

---

## 2. Endpoints added

### Inbound (IDP → CoE-NNECT)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/idp/v1/webhooks/change-request` | HMAC-SHA256 | Change request (contract 4.7) |

The body follows contract 4.7. `idp_request_id` is the idempotency key:

- same id and same body → `200` with `status: "duplicate"`;
- same id and different body → `409 duplicate_key`;
- new id → `200` with `status: "pending"`.

### Pattern C outbox (CoE-NNECT → IDP desktop)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/idp/v1/outbox/faculty-requests?since=&limit=` | Latest faculty-request statuses |
| `GET` | `/api/idp/v1/outbox/change-request-acks?since=&limit=` | Issued change-request acks |

Both use `Authorization: Bearer <IDP_DEVICE_API_KEY>`, an inclusive `since`
cursor, and a `limit` of 1–200 (default 50).

### Review API (application users)

| Method | Path | Roles |
|---|---|---|
| `GET` | `/api/v1/idp/change-requests` | `college_dean`, `college_secretary`, `administrator` |
| `GET` | `/api/v1/idp/change-requests/:id` | `college_dean`, `college_secretary`, `administrator` |
| `POST` | `/api/v1/idp/change-requests/:id/ack` | `college_dean`, `college_secretary`, `administrator` |

List filters: `status` (`pending`, `acknowledged`, `rejected`), `type` (one of
the eight contract types), and `limit` (1–500, default 100).

Ack body:

```json
{
  "action": "accepted",
  "notes": "Applied to the 2026-2027 first semester timetable."
}
```

`action` is `accepted`, `rejected`, or `modified`. Repeating the same action
and notes is idempotent (`duplicate: true`); a different decision returns
`409 duplicate_key`.

---

## 3. Files added / changed

### New — `apps/backend/src/modules/idp/`

| File | Responsibility |
|---|---|
| `idp-change-request.service.ts` | Receive, validate, list, read, and acknowledge change requests |
| `idp-faculty-request-publisher.service.ts` | Map faculty requests to contract 4.5 and publish status |
| `entities/idp-change-request.entity.ts` | Durable inbound request + one stored ack |
| `dto/ack-change-request.dto.ts` | Ack action and notes validation |
| `dto/list-change-requests.dto.ts` | Status/type/limit filters |
| `../../../supabase/migrations/20261111000300_add_idp_change_request.sql` | `public.idp_change_request` table, indexes, RLS |

### Changed

| File | Change |
|---|---|
| `apps/backend/src/modules/idp/idp-outbox.service.ts` | Three kinds: `schedule.published`, `faculty_request.status`, `change_request.ack`; in-place faculty refresh |
| `apps/backend/src/modules/idp/entities/idp-outbox.entity.ts` | Payload widened to `Record<string, any>`; docs describe per-kind semantics |
| `apps/backend/src/modules/idp/idp-client.service.ts` | `pushFacultyRequest`, `pushChangeRequestAck` |
| `apps/backend/src/modules/idp/idp.controller.ts` | Change-request webhook, two outbox routes, review/ack routes |
| `apps/backend/src/modules/idp/idp.types.ts` | Contract 4.5 / 4.7 / 4.8 wire and view types |
| `apps/backend/src/modules/idp/idp.errors.ts` | `unknown_section` |
| `apps/backend/src/modules/idp/idp.module.ts` | Registers the new entity, services, and `FacultyRequest` repository |
| `apps/backend/src/modules/idp/idp-schedule-publisher.service.ts` | Casts the generalized outbox payload back to the schedule payload |
| `apps/backend/src/modules/approvals/approvals.service.ts` | Queues IDP status on create/approve/reject; delivery is fire-and-forget |
| `apps/backend/src/modules/approvals/approvals.module.ts` | Imports `IdpModule` |

### Tests added / changed

| File | Covers |
|---|---|
| `apps/backend/test/idp-change-request.service.spec.ts` | Validation, durable dedupe, exactly-once ack, Pattern A push fallback, list ordering |
| `apps/backend/test/idp-faculty-request-publisher.service.spec.ts` | Payload mapping, in-place status refresh, Pattern A success/failure, missing references |
| `apps/backend/test/approvals.service.spec.ts` | Create/approve queue IDP status; queue failure does not roll back the transition |

---

## 4. Behaviour rules

### Change-request validation

- The eight contract types are accepted: `faculty_create`, `faculty_update`,
  `faculty_deactivate`, `faculty_transfer`, `qualification_add`,
  `qualification_remove`, `unavailability_change`, `schedule_override`.
- `severity` must be `info`, `warning`, or `critical`.
- `requires_ack` must be a boolean; `details` must be a JSON object;
  `affected_dates`, when present, must be an array of ISO date strings.
- At least one of `faculty_wmsu_id` or `faculty_employee_id` is required.
  `faculty_create` may instead carry `wmsu_id` / `employee_id` inside `details`.
- References are resolved before storage:
  - department code → `department.dept_code`;
  - subject code → `subject.subject_code`;
  - term code `YYYY-YYYY-semester` → `term`;
  - section code → `section` (for `schedule_override`).
- A non-`faculty_create` request with an unknown faculty key fails with
  `422 unknown_faculty`. A `faculty_create` may target a not-yet-existing
  faculty row.
- Day names, `HH:MM` windows, faculty classifications, and load types are
  validated when present.

### Idempotency and acks

- `idp_request_id` is the durable idempotency key.
- A stable JSON hash (sorted keys) distinguishes a retry from a conflicting
  reuse of the same id.
- The stored ack is the single source of truth: `ack_action`, `ack_notes`,
  `acknowledged_by`, and `acknowledged_at`.
- Status becomes `acknowledged` for `accepted` / `modified` and `rejected` for
  `rejected`.
- The ack payload is queued in `idp_outbox` under
  `kind='change_request.ack'`, keyed by `idp_request_id`.
- When Pattern A is configured, the ack is also pushed to
  `POST {IDP_BASE}/change-requests/{id}/ack`. A push failure leaves the outbox
  row intact and reports `delivered: false`.

### Faculty-request status

- Every create/approve/reject/cancel transition queues the current status.
- `coe_nnect_request_id` is the idempotency key. The existing outbox row is
  refreshed in place, including its `created_at` cursor, so a poller converges
  on the latest status instead of accumulating history.
- Payload fields: `coe_nnect_request_id`, `requesting_dept`, `target_dept`,
  `faculty_wmsu_id`, `subject_code`, `term_code`, `status`, `reason`,
  `created_at`.
- Pattern A push path: `POST {IDP_BASE}/faculty-requests`.
- `ApprovalsService` queues the status locally and starts Pattern A delivery
  asynchronously. An IDP outage never rolls back or delays the approval
  response; failures are logged and the outbox row remains.

### Outbox cursor semantics

- `since` is inclusive; clients dedupe on `idempotency_key`.
- `next_since` may repeat the last item's timestamp. Re-reading one item is
  harmless; skipping a same-timestamp row is not.
- Schedule items stay append-only and frozen. Faculty-request items refresh in
  place. Ack items are written once per request.

---

## 5. Database objects

| Table | Purpose | Retention |
|---|---|---|
| `public.idp_change_request` | Inbound change requests and their one ack | Retained for review/audit |
| `public.idp_outbox` | Schedule, faculty-request, and ack payloads | No automatic expiry |

`public.idp_change_request` uses `idp_request_id` as the primary key, stores the
raw payload and body hash, links `faculty_id` when resolvable, and references
`users.user_id` for the reviewer. RLS is enabled with no client policies and no
anon/authenticated grants; only the NestJS API connects through `DATABASE_URL`.

---

## 6. Verification

Run from `apps/backend`:

```powershell
npx tsc --noEmit -p tsconfig.json
npx tsc -p tsconfig.spec.json
npx jest --runInBand
npx nest build
```

Targeted IDP and approvals tests:

```powershell
npx jest --runInBand test/idp.service.spec.ts test/idp-outbox.service.spec.ts test/idp-schedule-publisher.service.spec.ts test/idp-faculty-request-publisher.service.spec.ts test/idp-change-request.service.spec.ts test/idp-device.guard.spec.ts test/idp-signature.guard.spec.ts test/approvals.service.spec.ts
```

The new suites cover change-request validation and dedupe, exactly-once acks,
Pattern A ack fallback, faculty-request payload mapping, in-place status
refresh, and the non-blocking approvals hook.

---

## 7. Known limitations / follow-ups

1. **No automatic application of change requests.** This is intentional. A
   reviewer records the decision and applies the change manually. If the IDP
   team expects automatic application, that needs a separate design with
   conflict checks and an audit trail.
2. **No review UI yet.** The review API is available, but the Dean/secretary
   screens still need a change-request list and ack dialog. That work belongs
   with the frontend follow-up.
3. **Change requests are not swept.** Unlike `idp_processed_event`, rows are
   retained indefinitely for audit. Add a retention policy once the review
   workflow is settled.
4. **Ack delivery is best-effort on the request path.** A failed Pattern A push
   is logged; the outbox row is the durable fallback. There is no background
   retry worker yet, so a client that never polls will not receive the ack
   through Pattern A alone.
5. **Faculty-request refresh is single-row, not event history.** If IDP needs
   every transition for auditing, add a separate history table rather than
   changing the poller contract.
6. **IDP paths remain indicative.** Confirm `/faculty-requests` and
   `/change-requests/{id}/ack` with the IDP team before enabling Pattern A
   against a real deployment.

---

## 8. Open items for the IDP team

1. Confirm the final Pattern A paths for faculty-request status and
   change-request acks.
2. Confirm which of the eight change-request types IDP will send and whether
   `details` shapes match the implemented validation.
3. Confirm whether IDP expects automatic application or reviewer
   acknowledgement only.
4. Confirm retry and ack expectations, including the offline timestamp
   tolerance (contract allows up to 24 hours).
5. Confirm change-request retention and PII requirements.
6. Provide a sandbox/staging URL and test credentials.

---

## 9. Suggested next steps

1. Build the Dean/secretary change-request review UI against the new API.
2. Add a background outbox retry worker if Pattern A delivery must not depend
   on client polling.
3. Run a manual end-to-end test with an IDP sandbox: change-request webhook →
   review → ack → ack outbox poll.
4. Milestone 4: IDP settings UI (enable flag, base URL, device-key rotation
   dates).
5. Merge `idp/integration` into `main` after review.
