# Backend API

The `apps/backend` directory contains the NestJS API used by CoE-NNECT. It provides authentication, academic data management, scheduling and validation, approvals, reports, notifications, chat, and audit functionality.

## Modules and API behavior

Feature modules are registered in `src/app.module.ts`. They cover users and authentication; departments, programs, terms, faculty, subjects, prospectuses, sections, and rooms; schedules, constraints, and approvals; system configuration, audit, chat, and notifications; prospectus PDF management; and the Institutional Data Platform (IDP) integration.

The global API prefix defaults to `/api` and can be changed with `API_PREFIX`. Routes use NestJS validation. Socket.IO gateways support real-time features. See the [scheduling API reference](../interface-contract/docs/interface-contract/scheduling-api.md) for schedule routes and payload conventions.

## Public API

The `PublicModule` under `src/modules/public` backs the public landing page. These routes are unauthenticated and are intentionally separate from the application API.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/public/overview` | Public | Aggregate counts: published entries/terms, active departments/faculty/subjects/rooms, IDP-linked faculty |
| `GET` | `/api/v1/public/schedules?termId=` | Public | Published schedule entries, optionally filtered by term |
| `GET` | `/api/v1/public/faculty?departmentCode=&idpOnly=` | Public | Minimal faculty directory (name, department, designation, IDP-linked status) |

The queries exclude drafts, flagged rows, rows with a pending cross-department faculty request, inactive departments, and rows missing a day or start/end time. The faculty payload never includes email, contact number, employee ID, WMSU ID, credentials, webhook secrets, or internal integration URLs. Responses are cacheable for 60 seconds and remain subject to the global rate limiter.

## IDP integration

The `IdpModule` under `src/modules/idp` implements the CoE-NNECT ↔ IDP v2.0 contract. Pattern C is primary because the IDP deployment is an offline-capable desktop app; Pattern A (REST + webhooks) remains as a fallback.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/idp/v1/health` | Public | Integration and configuration health |
| `POST` | `/api/idp/v1/webhooks/faculty-changed` | HMAC-SHA256 | Faculty change event from IDP |
| `POST` | `/api/idp/v1/inbox/faculty` | Device bearer key | Faculty snapshot pushed by the IDP desktop |
| `GET` | `/api/idp/v1/outbox/schedules` | Device bearer key | Published schedules polled by the IDP desktop |
| `POST` | `/api/v1/idp/faculty/sync` | Bearer JWT + role guard | User-triggered roster refresh (Pattern A) |
| `POST` | `/api/v1/idp/schedules/publish` | Bearer JWT + role guard | Queue and optionally push a published schedule |

The sync applies faculty identity, qualifications, and unavailability, matches records by `wmsu_id` then `employee_id`, and maintains `faculty.sync_status` / `last_synced_at`. Local identity edits mark a row pending and block incoming IDP updates with `409 local_edit_pending`. Webhooks are signed with HMAC-SHA256 over the raw request body; `main.ts` enables `rawBody: true` for this reason. Webhook idempotency and published schedules are stored in `idp_processed_event` and `idp_outbox` so an offline desktop client can catch up safely.

Configure the integration in `apps/backend/.env`:

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

See the [IDP integration guide](../integrations/idp.md) for payloads, sync semantics, error codes, and the open items with the IDP team.

## Setup and local development

Use Node.js 24 or newer and pnpm 12.6.0. From the repository root:

```powershell
pnpm install
Copy-Item apps\backend\.env.example apps\backend\.env
```

Set the Supabase and PostgreSQL configuration in `apps/backend/.env`, then run the API:

```powershell
pnpm --filter @coe-nnect/backend dev
```

The API listens on port `3000` by default; set `PORT` to change it. Refer to the [backend environment template](../../apps/backend/.env.example) for all supported values, including `DATABASE_URL`, Supabase credentials, `FRONTEND_URL`, `PROSPECTUS_PARSER_URL`, and the `IDP_*` integration variables.

## Security and observability

- **CORS:** production accepts only the exact origins listed in `FRONTEND_URL` and `CORS_ALLOWED_ORIGINS`. Development and test additionally allow loopback origins. Wildcard Vercel previews and private LAN addresses are not accepted in production.
- **Swagger:** available outside production. In production it stays disabled unless `ENABLE_SWAGGER=true` and both `SWAGGER_USER` and `SWAGGER_PASSWORD` are set; the docs are then protected with HTTP basic auth.
- **CSP and headers:** Helmet applies a Content-Security-Policy, HSTS in production, a no-referrer policy, and frame-ancestor denial. Swagger-specific inline allowances are enabled only when the docs are mounted.
- **Rate limiting:** HTTP requests are limited globally (`THROTTLE_LIMIT`, default 300 per `THROTTLE_TTL_MS`, default 60 seconds). Login is limited separately (`LOGIN_THROTTLE_LIMIT`, default 10 per minute). Set `TRUST_PROXY=true` only behind a trusted proxy; Vercel deployments do this automatically.
- **Logs:** production emits one JSON object per line with a request correlation id (`X-Request-Id`), status, duration, and user id. Set `LOG_FORMAT=json` to opt in locally. Do not log request bodies or authorization headers.
- **Backups:** follow the [backup and restore runbook](../operations/backup-restore.md) before schema changes or production migrations.

## Database and seed scripts

The API uses TypeORM to connect to PostgreSQL. Automatic schema synchronization is disabled. Apply schema changes through the project's Supabase SQL workflow.

The package exposes these database scripts:

```powershell
pnpm --filter @coe-nnect/backend db:reset
pnpm --filter @coe-nnect/backend seed:demo
```

`db:reset` is a **hard reset**. It truncates every table in the `public` schema
with `RESTART IDENTITY CASCADE`, deletes every Supabase Auth user, and restores
only the disabled `system_status` singleton. Public identity columns therefore
start again at `1`; Auth user IDs remain UUIDs.

For a remote/hosted database, the script refuses to run unless both guards are
set:

```powershell
$env:ALLOW_REMOTE_RESET = "1"
$env:SKIP_CONFIRM = "1"   # optional; otherwise type RESET at the prompt
pnpm --filter @coe-nnect/backend db:reset
pnpm --filter @coe-nnect/backend seed:demo
```

`seed:demo` now creates only the four departments and six demo accounts:

| Department             | Code   | Account                 |
| ---------------------- | ------ | ----------------------- |
| Computer Engineering   | `CPE`  | `head.cpe@wmsu.edu.ph`  |
| Electrical Engineering | `EE`   | `head.ee@wmsu.edu.ph`   |
| Geodetic Engineering   | `GE`   | `head.ge@wmsu.edu.ph`   |
| Environmental Eng.     | `ENVE` | `head.enve@wmsu.edu.ph` |

The dean is `dean@wmsu.edu.ph` and the hidden developer account is
`dev-admin@wmsu.edu.ph`. Every account uses the password `Demo!2345`. Running
`seed:demo` again updates the departments, resets those passwords, and
re-synchronises the matching `public.users` profiles.

Both commands affect the database configured in the environment. Review the
script and target before running; `db:reset` is destructive.

### Dev Tools reset behavior

The Dev Tools page uses the same scripts but runs them from the backend:

- **Reset + Reseed** hard-resets the database, then immediately runs the demo
  seed.
- **Reset only** hard-resets without seeding.
- **Seed only** runs the demo seed without deleting existing data.

In production the backend runs the compiled files in
`apps/backend/dist/database/seeds/` with Node, so the Railway runtime does not
need `ts-node` or `src/`. The reset job passes `ALLOW_REMOTE_RESET=1` and
`SKIP_CONFIRM=1`; this is safe only because the endpoint is administrator-only
and the UI requires the confirmation phrase.

The Dev Tools reset preserves the signed-in administrator's Supabase Auth user
and `public.users` profile (via `PRESERVE_AUTH_USER_ID`), so the job can be
polled to completion without logging you out. The CLI `db:reset` has no such
exception and deletes every Auth user.

## Build and checks

Run from the repository root:

```powershell
pnpm --filter @coe-nnect/backend build
pnpm --filter @coe-nnect/backend typecheck
pnpm --filter @coe-nnect/backend test
```

Application code is under `src/`; end-to-end tests and Jest configuration are under `test/`. IDP coverage lives in `test/idp.service.spec.ts` and `test/idp-signature.guard.spec.ts`; see the [testing guide](../testing.md).
