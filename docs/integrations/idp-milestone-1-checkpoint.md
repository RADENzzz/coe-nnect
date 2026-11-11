# IDP Integration — Milestone 1 Checkpoint

> Status: **implemented, verified, committed, open for review (PR #68)**
> Branch: `idp/integration` (based on `main` at `586819d`)
> Contract: `Documents/CoE-NNECT-IDP API Contract v2.txt` (v2.0, 2026-10-23)
> Pattern: **A — server-to-server REST + signed webhooks**
> Feature guide: [IDP integration](idp.md)
>
> **Update 2026-11-11 — Pattern C is now primary.** The IDP deployment is a
> desktop app that may be offline, so the canonical guide now describes the
> faculty inbox (`POST /api/idp/v1/inbox/faculty`) and the durable schedule
> outbox (`GET /api/idp/v1/outbox/schedules`). Pattern A remains as a fallback.
> The in-memory dedupe map and missing outbox described below are superseded:
> `idp_processed_event` and `idp_outbox` now make both durable. Read
> [`idp.md`](idp.md) for current behaviour; this page stays as the Milestone 1
> implementation record.

This file is the continuation point for the IDP integration. It records what
Milestone 1 does, where the code lives, how to configure it, and what remains
open with the IDP team. The canonical feature guide is
[`docs/integrations/idp.md`](idp.md); this checkpoint adds the implementation
history, file inventory, and handoff notes.

---

## 1. What Milestone 1 covers

| Capability | Contract | Status |
|---|---|---|
| Faculty roster sync (IDP → CoE-NNECT) | 5.1 | Done |
| Qualification sync | 5.2 | Done |
| Unavailability sync (full replace of `source='idp'`) | 5.3 | Done |
| `sync_status` / `last_synced_at` transitions | 3.3 | Done |
| Signed faculty-change webhook | 4.6 / 5.6 | Done |
| IDP health endpoint | 9.2 | Done |
| "Refresh from IDP" user action | FR 3.1.11 | Done |
| Durable webhook idempotency table | 7.4 | **Done** (was in-memory; see §6) |
| Schedule publishing | 5.4 / Milestone 2 | Out of scope |
| Change requests + acks | 5.7 / Milestone 3 | Out of scope |
| Admin settings UI | Milestone 4 | Out of scope |

---

## 2. Endpoints added

### Inbound (IDP → CoE-NNECT)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/idp/v1/health` | Public | Integration/config health |
| `POST` | `/api/idp/v1/webhooks/faculty-changed` | HMAC-SHA256 | Faculty change event |

Webhook headers:

```
X-Request-ID:    <uuid>            (echoed into errors/logs)
X-IDP-Signature: sha256=<hex>      (HMAC-SHA256 over the raw body)
X-IDP-Timestamp: <ISO 8601>        (5-minute tolerance by default)
```

### Outbound (CoE-NNECT → IDP)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `{IDP_BASE_URL}/faculty?department_code=&updated_since=` | Roster pull |
| `GET` | `{IDP_BASE_URL}/faculty/{key}/qualifications` | Qualifications |
| `GET` | `{IDP_BASE_URL}/faculty/{key}/unavailability?term_code=` | Unavailability |

Path names are the **indicative** ones from the contract; confirm the final
paths with the IDP team before pointing `IDP_BASE_URL` at a real deployment.

### Application trigger (users)

| Method | Path | Roles |
|---|---|---|
| `POST` | `/api/v1/idp/faculty/sync` | `college_dean`, `college_secretary`, `department_head` |

Body (all optional):

```json
{
  "departmentCode": "CPE",
  "termCode": "2026-2027-1st",
  "includeQualifications": true,
  "includeUnavailability": true
}
```

A department head is pinned to their own department server-side; requesting
another department returns `403`. The Faculty page calls this with an empty
body through the **Refresh from IDP** button.

---

## 3. Files added / changed

### New — `apps/backend/src/modules/idp/`

| File | Responsibility |
|---|---|
| `idp.module.ts` | Registers controllers, services, repositories |
| `idp.controller.ts` | Public health + signed webhook + JWT sync trigger |
| `idp-client.service.ts` | Outbound REST client (fetch, timeout, error mapping) |
| `idp-sync.service.ts` | Roster / qualification / unavailability sync + webhook apply |
| `idp-signature.guard.ts` | HMAC-SHA256 + timestamp verification |
| `idp.errors.ts` | Contract-compliant `{ error: { code, message, ... } }` |
| `idp.types.ts` | Wire types for contract §4 |
| `dto/sync-faculty.dto.ts` | Sync trigger body |

### Changed

| File | Change |
|---|---|
| `apps/backend/src/app.module.ts` | Imports `IdpModule` |
| `apps/backend/src/main.ts` | `rawBody: true`; `IDP` Swagger tag |
| `apps/backend/src/modules/faculty/faculty.service.ts` | Local identity edits and active-toggle set `sync_status='pending'` |
| `apps/backend/.env.example` | IDP environment variables |
| `apps/frontend/src/api/faculty.api.ts` | `syncFacultyFromIdp`, sync summary types, `syncStatus` on `FacultyRecord` |
| `apps/frontend/src/features/faculty/FacultyPage.tsx` | **Refresh from IDP** button + result banner |

### Tests added

| File | Covers |
|---|---|
| `apps/backend/test/idp-signature.guard.spec.ts` | Valid/invalid HMAC, timestamp window, missing secret |
| `apps/backend/test/idp.service.spec.ts` | Create, idempotent second pull, unknown department, `local_edit_pending`, webhook dedupe/`duplicate_key`, `faculty.created` |

---

## 4. Configuration

Add these to `apps/backend/.env` (template lives in `.env.example`):

```dotenv
IDP_ENABLED=false
IDP_BASE_URL=
IDP_API_KEY=
IDP_WEBHOOK_SECRET=
IDP_REQUEST_TIMEOUT_MS=15000
IDP_WEBHOOK_TOLERANCE_MS=300000
```

- `IDP_ENABLED` must be `true` for pulls and the refresh action.
- `IDP_BASE_URL` is required; requests fail closed without it.
- `IDP_API_KEY` is sent as `Authorization: Bearer <token>`.
- `IDP_WEBHOOK_SECRET` is required to accept webhooks. With no secret, every
  webhook is rejected with `401 unauthorized`.
- Prod secrets belong in the deployment environment, never in git.

### Local webhook smoke test

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

---

## 5. Behaviour and ownership rules

- `faculty` identity fields (`first_name`, `last_name`, `email`, `contact`,
  `wmsu_id`, `employee_id`, `dept_id`, `is_active`) are IDP-owned and applied
  on sync.
- `designation_id`, `classification`, `required_hours` stay CoE-NNECT-owned
  and are never overwritten by a roster pull or webhook.
- Faculty are matched by `wmsu_id` first, then `employee_id`. If both keys
  resolve to different rows the record fails with `422 faculty_key_conflict`.
- `faculty_qualification` rows from IDP get `source_system='IDP'`; local rows
  keep `source_system=NULL`. `(faculty_id, subject_id)` is unique, so existing
  local rows are kept and only tagged.
- `faculty_unavailability` sync replaces `source='idp'` rows for the
  faculty/term. `source='local'` rows are never touched.
- Successful apply: `sync_status='synced'`, `last_synced_at=now()`.
  A failed record leaves `last_synced_at` unchanged.
- A local edit to an identity field (or toggling active) sets
  `sync_status='pending'`. Incoming IDP updates for a **previously synced**
  pending row are rejected with `409 local_edit_pending`.
  Rows that have never been synced (`last_synced_at IS NULL`) are allowed
  through so the first roster pull can adopt pre-existing records.
- A second identical pull is a no-op (`unchanged` counter increments).
- Partial failures do not abort the run: each bad record is reported in
  `errors[]` with its contract error code.

### Sync result shape

```json
{
  "data": {
    "fetched": 120,
    "created": 3,
    "updated": 8,
    "unchanged": 109,
    "skipped": 0,
    "failed": 0,
    "qualificationsAdded": 14,
    "unavailabilitySynced": 0,
    "errors": [],
    "startedAt": "2026-11-08T10:00:00.000Z",
    "finishedAt": "2026-11-08T10:00:04.000Z"
  }
}
```

---

## 6. Known limitations / follow-ups

1. **Webhook idempotency is now durable.** `public.idp_processed_event` stores
   `event_id → body hash` for 30 days and is shared by every instance. A
   nightly 03:00 sweep deletes expired rows. Same body → `200 duplicate`;
   different body → `409 duplicate_key`. (The original in-memory `seenEvents`
   map described in earlier revisions has been removed.)
2. **The outbox is implemented.** `public.idp_outbox` stores frozen
   published-schedule payloads with a unique `(kind, idempotency_key)` pair.
   Publishing always queues; a Pattern A push is an optional immediate
   delivery. The IDP desktop polls `GET /api/idp/v1/outbox/schedules`.
3. **No `idp_id` / `updated_at` storage.** Incremental pulls use the max
   `faculty.last_synced_at` as `updated_since`, per the contract. If IDP's
   clock or semantics differ, switch to a dedicated watermark.
4. **Qualification pull is per-faculty (N calls).** Acceptable for Milestone 1;
   batch it if the roster grows large.
5. **IDP paths are indicative.** Confirm `/faculty`, `/faculty/{key}/...`
   before enabling against a real IDP.
6. **No IP allowlist.** Webhooks rely on HMAC only. Add allowlisting at the
   proxy if IDP provides egress ranges.
7. **`packages/idp-client` is still the empty placeholder.** Milestone 1 lives
   in `apps/backend/src/modules/idp`; either keep it there or promote shared
   types/client later.

---

## 7. Verification

Run from the repo root:

```powershell
# Backend typecheck + tests (59 tests, 10 suites)
cd apps/backend
npx tsc --noEmit -p tsconfig.json
npx tsc -p tsconfig.spec.json
npx jest --runInBand

# Frontend typecheck
cd ../frontend
npx tsc --noEmit
```

All of the above pass on this branch. Backend ESLint is not runnable yet
because `apps/backend` has no `eslint.config.*`; that failure predates the
IDP work.

---

## 8. Open items for the IDP team (contract §11)

Still unconfirmed and required before production:

1. ~~Deployment model (server / desktop / offline).~~ Resolved: IDP is an
   offline-capable desktop app; Pattern C is primary.
2. ~~Auth mechanism (API key vs OAuth2 client credentials).~~ Resolved for the
   first cut: per-device bearer key (`IDP_DEVICE_API_KEY`).
3. HMAC-SHA256 support and header format.
4. Faculty key coverage (does every record have `wmsu_id` or `employee_id`?).
5. Department code mapping (CPE/EE/GE/ENVE vs IDP codes).
6. Subject code format / mapping.
7. Section code format / mapping.
8. Term code format (`YYYY-YYYY-semester`).
9. Whether IDP tracks qualifications and their shape.
10. Whether IDP tracks unavailability and whether it is weekly recurring.
11. Change-request types IDP will send.
12. Retry/ack expectations.
13. Whether IDP can force schedule changes.
14. PII retention requirements.
15. Sandbox/staging URL and test credentials.

---

## 9. Suggested next steps

1. Run a manual sync against an IDP sandbox once §8 items 3–8 are answered.
2. Milestone 2 is implemented: schedule publishing queues to the outbox and can
   also push `POST {IDP_BASE}/schedules/published`.
3. Milestone 3: change-request webhook, acks, and the remaining Pattern C
   inbox/outbox types (faculty requests, change-request acks).
4. Milestone 4: IDP settings UI (enable flag, base URL, rotation dates).
5. Merge `idp/integration` into `main` after review (PR opened, not merged).
