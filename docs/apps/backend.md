# Backend API

The `apps/backend` directory contains the NestJS API used by CoE-NNECT. It provides authentication, academic data management, scheduling and validation, approvals, reports, notifications, chat, audit functionality, prospectus PDF processing, and the Institutional Data Platform (IDP) integration.

## Runtime and bootstrap

`src/main.ts` creates the Nest application and configures:

- the global API prefix (`API_PREFIX`, default `api`, so routes live under `/api`);
- CORS using an explicit origin allowlist in production and loopback convenience rules outside production;
- Helmet security headers and a Content-Security-Policy;
- a global `ValidationPipe` for DTO validation;
- Socket.IO for notifications;
- Swagger/OpenAPI at `/api/docs` and `/api/docs-json` when enabled;
- raw request bodies for IDP HMAC verification (`rawBody: true`);
- structured request logging with a correlation id;
- global, login, and Cap rate limiters.

`AppModule` composes the feature modules and installs the global audit interceptor. TypeORM connects to PostgreSQL with `synchronize: false`; the SQL migrations own the schema.

## Module map

Feature modules are registered in `src/app.module.ts`:

| Module | Responsibility |
| --- | --- |
| `auth` | Supabase sign-in, re-authentication, current profile, Cap challenge/redeem. |
| `users` | User lifecycle, directory, password change, presence heartbeat. |
| `departments` | Department records and active/inactive state. |
| `programs` | Degree programs. |
| `terms` | Academic terms and active-term selection. |
| `faculty` | Faculty profiles, qualifications, preferences, unavailability, IDP status. |
| `subjects` | Subject catalog, restrictions, electives, and minor subjects. |
| `prospectus` | Curriculum entries and slot filling. |
| `sections` | Student sections/cohorts. |
| `rooms` | Room inventory and room preferences. |
| `scheduling` | Plotting, validation, auto-generation, versions, coverage, and room sufficiency. |
| `constraints` | Registered constraint-rule metadata. |
| `approvals` | Cross-department faculty requests. |
| `notifications` | Persisted notifications, settings, unread counts, and the Socket.IO gateway. |
| `chat` | Eligible users, conversations, messages, read markers, and chat push. |
| `audit` | Audit trail queries and filter metadata. |
| `system-config` | Scheduling/system configuration and designations. |
| `system-status` | Public banner and maintenance-mode state. |
| `prospectus-pdfs` | PDF upload, storage, table regions, parser calls, and import. |
| `public` | Unauthenticated landing-page data. |
| `search` | Cross-entity search. |
| `stats` | Overview and repository statistics. |
| `idp` | IDP health, webhooks, inbox/outbox, sync, publish, and change requests. |
| `dev-tools` | Guarded reset/seed jobs and account maintenance. |
| `health` | Liveness probe. |

## Route map

All paths below are relative to `/api` unless noted. Role names are illustrative; the controller guards are authoritative.

### Authentication and users

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/v1/auth/login` | Public | Verify Cap token, sign in with Supabase, return session and profile. |
| `POST` | `/v1/auth/reauth` | Bearer JWT | Re-verify the password before sensitive actions. |
| `GET` | `/v1/auth/me` | Bearer JWT | Current application profile and role/department state. |
| `POST` | `/v1/auth/cap/challenge` | Public, rate-limited | Issue a Cap challenge. |
| `POST` | `/v1/auth/cap/redeem` | Public, rate-limited | Redeem a solved challenge for a single-use login token. |
| `GET/PUT/DELETE` | `/v1/recovery/me` | Bearer JWT | Read, set, or remove the optional verified recovery email. |
| `POST` | `/v1/recovery/request` | Public, rate-limited | Send a reset link to a login email or verified recovery email. Always answers generically. |
| `POST` | `/v1/recovery/verify` | Public, rate-limited | Consume a recovery-email verification token. |
| `POST` | `/v1/recovery/reset` | Public, rate-limited | Consume a single-use reset token and set a new password. |
| `GET` | `/v1/users` | Dean, secretary | List users. |
| `GET` | `/v1/users/directory` | Dean, secretary, department head | Minimal directory used by chat and request forms. |
| `GET` | `/v1/users/:id` | Dean, secretary | Read a user profile. |
| `POST` | `/v1/users` | Dean, secretary | Create a user. |
| `PATCH` | `/v1/users/:id` | Dean, secretary | Update a user. |
| `PATCH` | `/v1/users/:id/toggle-active` | Dean, secretary | Activate/deactivate a user. |
| `DELETE` | `/v1/users/:id` | Dean, secretary | Delete a user. |
| `POST` | `/v1/users/me/password` | Dean, secretary, department head, administrator | Change the signed-in user's password. |
| `POST` | `/v1/users/me/heartbeat` | Every authenticated role | Record `user_presence.last_seen_at`. |

### Academic records

| Method | Path | Purpose |
| --- | --- | --- |
| `GET/POST/PATCH/DELETE` | `/v1/departments`, `/v1/departments/:id` | Department CRUD. |
| `PATCH` | `/v1/departments/:id/toggle-active` | Activate/deactivate a department. |
| `GET/POST/PATCH` | `/v1/programs`, `/v1/programs/:id` | Program CRUD and activation. |
| `GET/POST/PATCH/DELETE` | `/v1/terms`, `/v1/terms/:id` | Term CRUD. |
| `GET` | `/v1/terms/active` | Active term. |
| `PATCH` | `/v1/terms/:id/activate`, `/v1/terms/:id/deactivate` | Change the active term. |
| `GET/POST/PATCH/DELETE` | `/v1/faculty`, `/v1/faculty/:id` | Faculty CRUD and activation. |
| `GET` | `/v1/faculty/status-summary` | Faculty qualification/sync status summary. |
| `GET/POST/PATCH/DELETE` | `/v1/faculty/:id/qualifications`, `.../:qualId` | Qualification management. |
| `POST` | `/v1/faculty/:id/qualifications/bulk-delete` | Bulk qualification removal. |
| `GET/POST/PATCH/DELETE` | `/v1/faculty/:id/preferences`, `.../:preferenceId` | Teaching preferences. |
| `GET/POST/PATCH/DELETE` | `/v1/faculty/:id/unavailability`, `.../:uid` | Unavailability blocks. |
| `GET/POST/PATCH/DELETE` | `/v1/subjects`, `/v1/subjects/:id` | Subject CRUD and activation. |
| `GET/POST/PATCH/DELETE` | `/v1/subjects/restrictions`, `.../:id` | Subject restrictions. |
| `GET/POST/PATCH/DELETE` | `/v1/prospectus`, `/v1/prospectus/:id` | Curriculum entries. |
| `GET` | `/v1/prospectus/by-program/:programId` | Curriculum for a program. |
| `PATCH` | `/v1/prospectus/:id/fill-slot` | Fill a curriculum slot. |
| `GET/POST/PATCH/DELETE` | `/v1/sections`, `/v1/sections/:id` | Section CRUD and activation. |
| `GET/POST/PATCH/DELETE` | `/v1/rooms`, `/v1/rooms/:id` | Room CRUD and activation. |
| `GET/POST/DELETE` | `/v1/rooms/preferences`, `.../:id` | Room preference management. |
| `GET` | `/v1/rooms/preferences/all` | All room preferences. |
| `GET` | `/v1/designations` | Faculty designations. |
| `GET/PATCH` | `/v1/system-config` | Scheduling/system configuration. |

### Scheduling and approvals

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/v1/schedules` | List schedule rows with filters. |
| `GET` | `/v1/schedules/active-term` | Active term and related scheduling context. |
| `GET` | `/v1/schedules/unscheduled` | Sessions the generator could not place. |
| `GET` | `/v1/schedules/flagged` | Flagged schedule rows. |
| `GET` | `/v1/schedules/unplotted-minors` | Minor subjects not yet plotted. |
| `GET` | `/v1/schedules/coverage` | Scheduling coverage summary. |
| `GET` | `/v1/schedules/room-sufficiency` | Projected room demand versus capacity. |
| `POST` | `/v1/schedules/validate` | Validate a candidate block against constraint rules. |
| `POST` | `/v1/schedules/plot` | Plot one class block. |
| `POST` | `/v1/schedules/plot-multi` | Plot multiple blocks. |
| `POST` | `/v1/schedules/auto-generate` | Start automatic generation. |
| `GET` | `/v1/schedules/auto-generate/pending` | Check for a pending auto-generation result. |
| `POST` | `/v1/schedules/auto-generate/confirm` | Confirm and persist a generated draft. |
| `POST` | `/v1/schedules/auto-generate/discard` | Discard a generated draft. |
| `POST` | `/v1/schedules/auto-generate/abandon` | Abandon an in-progress generation. |
| `DELETE` | `/v1/schedules/auto-drafts` | Delete auto-generated drafts. |
| `GET` | `/v1/schedules/versions`, `/v1/schedules/versions/:versionId` | Schedule versions. |
| `GET` | `/v1/schedules/versions/compare` | Compare versions. |
| `PATCH` | `/v1/schedules/:id` | Edit a schedule row. |
| `PATCH` | `/v1/schedules/:id/status` | Move a row through the status workflow. |
| `PATCH` | `/v1/schedules/:id/remarks` | Update remarks. |
| `POST/DELETE` | `/v1/schedules/:id/flag` | Add/remove a flag. |
| `DELETE` | `/v1/schedules/:id` | Delete a schedule row. |
| `GET` | `/v1/constraints/rules` | Registered constraint-rule metadata. |
| `GET/POST/PATCH/DELETE` | `/v1/faculty-requests`, `.../:id` | Cross-department faculty requests. |
| `PATCH` | `/v1/faculty-requests/:id/approve`, `/reject` | Approve or reject a request. |

### Chat and notifications

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/chat/users` | Dean, department head | Eligible chat users. |
| `GET` | `/v1/chat/conversations` | Dean, department head | Conversations for the signed-in user. |
| `POST` | `/v1/chat/conversations` | Dean, department head | Create or reuse a direct conversation. |
| `GET` | `/v1/chat/conversations/:id/messages` | Conversation member | Message history with `before`/`limit`. |
| `POST` | `/v1/chat/conversations/:id/messages` | Conversation member | Send a message. |
| `PATCH` | `/v1/chat/conversations/:id/read` | Conversation member | Update the last-read marker. |
| `GET` | `/v1/notifications` | Authenticated | Notification inbox. |
| `GET` | `/v1/notifications/unread-count` | Authenticated | Unread count. |
| `PATCH` | `/v1/notifications/:id/read` | Authenticated | Mark one notification read. |
| `POST` | `/v1/notifications/read-all` | Authenticated | Mark all read. |
| `DELETE` | `/v1/notifications/:id`, `/v1/notifications/clear-all` | Authenticated | Delete notifications. |
| `GET/PATCH` | `/v1/notifications/settings` | Authenticated | Per-trigger notification opt-ins. |

The notification gateway authenticates the Supabase token at connection time and joins the socket to `user:<id>`. It emits `notification:new`, `unread_count`, and `chat:new`; chat also listens to Supabase Realtime inserts on the `public.message` table for the active conversation.

### PDF import, public data, and operations

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/prospectus-pdfs` | Upload a PDF and create metadata. |
| `GET` | `/v1/prospectus-pdfs`, `/v1/prospectus-pdfs/:id` | List/read PDF records. |
| `GET` | `/v1/prospectus-pdfs/:id/signed-url` | Signed storage URL. |
| `PATCH/DELETE` | `/v1/prospectus-pdfs/:id` | Update/delete PDF metadata. |
| `POST/PATCH/DELETE` | `/v1/prospectus-pdfs/:id/tables`, `.../:tid` | Table-region CRUD. |
| `POST` | `/v1/prospectus-pdfs/:id/tables/detect` | Detect table regions. |
| `POST` | `/v1/prospectus-pdfs/:id/extract` | Extract text from defined regions. |
| `POST` | `/v1/prospectus-pdfs/:id/import` | Import extracted rows into the catalog. |
| `GET` | `/v1/public/overview`, `/v1/public/schedules`, `/v1/public/faculty`, `/v1/public/integration` | Unauthenticated landing-page data. |
| `GET` | `/v1/search` | Cross-entity search. |
| `GET` | `/v1/stats/overview`, `/v1/stats/repo-contributors`, `/v1/stats/repo-commits` | Dashboard and landing statistics. |
| `GET` | `/v1/audit`, `/v1/audit/actions`, `/v1/audit/sources` | Audit history and filter metadata. |
| `GET/PATCH` | `/v1/system-status` | Public banner read; privileged update. |
| `GET` | `/v1/health` | Liveness probe; no auth or database access. |
| `GET` | `/v1/dev-tools/state` | Dev account state. |
| `POST` | `/v1/dev-tools/reset`, `/seed`, `/seed-demo-full` | Guarded reset/seed jobs. |
| `GET` | `/v1/dev-tools/jobs/:jobId` | Job status. |
| `GET` | `/v1/dev-tools/users` | Account maintenance list. |
| `POST` | `/v1/dev-tools/users/:userId/password`, `/username` | Reset credentials. |
| `PATCH` | `/v1/dev-tools/users/:userId/toggle-active` | Toggle an account. |

## Authentication, Cap CAPTCHA, and authorization

1. The frontend requests a Cap challenge from `POST /api/v1/auth/cap/challenge`.
2. The Cap widget solves it and the frontend redeems the solution at `POST /api/v1/auth/cap/redeem`.
3. The redeem response contains a short-lived, single-use login token.
4. `POST /api/v1/auth/login` verifies that token, then authenticates the email/password with Supabase Auth.
5. The backend loads the matching `public.users` profile and returns the Supabase session, role, and department state.
6. API requests carry the Supabase access token as a bearer token. `JwtAuthGuard` verifies it; `RolesGuard` loads the active profile and checks the declared roles.

Cap details:

- `CAP_SECRET` signs challenge JWTs and must be at least 16 bytes. If it is missing or too short, login fails closed with `CAP_UNAVAILABLE`.
- Challenges and redeem tokens both expire after 10 minutes.
- `cap_nonce` makes challenge redemption single-use; `cap_token` stores the redeem lookup key until it is consumed.
- Expired rows are swept hourly by `CapService`.
- `/v1/auth/cap/*` is rate-limited separately by `CAP_THROTTLE_LIMIT` (default 60 requests/minute per IP).
- Both Cap tables enable RLS and revoke access from `anon` and `authenticated`; only the API's database connection touches them.

Password recovery:

- Users can set an optional recovery email in Settings → Security. It is separate from the Supabase login email and must be verified before it can receive reset links.
- Verification tokens last 24 hours; reset tokens last 30 minutes. Both are random, stored only as SHA-256 hashes, and single-use.
- Reset requests accept either the login email or a verified recovery email and always answer `{ "success": true }` to avoid account enumeration.
- Public recovery routes are limited by `RECOVERY_THROTTLE_LIMIT` (default 10 per 15 minutes per IP), plus a per-address request limit and a per-user change limit.
- SMTP delivery is optional; see [Password recovery email](../operations/email-recovery.md) for Mox setup, environment variables, and troubleshooting.

Application roles are `college_dean`, `college_secretary`, `department_head`, `viewer`, and `administrator`. The `administrator` role is a hidden developer account, not a general user persona. The backend still permits it where maintenance access is required, but user-facing chat filters it out.

## Public API

The `PublicModule` under `src/modules/public` backs the public landing page. These routes are unauthenticated and intentionally separate from the application API.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/public/overview` | Aggregate counts: published entries/terms, active departments/faculty/subjects/rooms, IDP-linked faculty. |
| `GET` | `/api/v1/public/schedules?termId=` | Published schedule entries, optionally filtered by term. |
| `GET` | `/api/v1/public/faculty?departmentCode=&idpOnly=` | Minimal faculty directory (name, department, designation, IDP-linked status). |
| `GET` | `/api/v1/public/integration` | Public IDP integration status and milestones. |

The queries exclude drafts, flagged rows, rows with a pending cross-department faculty request, inactive departments, and rows missing a day or start/end time. The faculty payload never includes email, contact number, employee ID, WMSU ID, credentials, webhook secrets, or internal integration URLs. Responses are cacheable for 30–60 seconds (`max-age` 60 for the main feeds, 30 for integration status) and remain subject to the global rate limiter.

## Chat and presence

Chat is restricted at the controller to `college_dean` and `department_head`. The service's eligible-role list is slightly broader so the hidden administrator can still reach maintenance paths, but the frontend filters administrator conversations out of user-facing lists.

- A conversation is direct (one other participant) and is reused if one already exists.
- Messages are paginated backwards with `before` and `limit` (default 50).
- `PATCH /conversations/:id/read` updates `conversation_member.last_read_at`.
- New messages are persisted, pushed over Socket.IO as `chat:new`, and published to Supabase Realtime for the active conversation.
- Presence uses Supabase Realtime for the live online dot. The API records a heartbeat at `POST /v1/users/me/heartbeat`; the frontend sends it every 60 seconds and skips hidden tabs.

See [Chat and presence](../features/chat.md) for the UI behavior and data flow.

## Scheduling and validation

For a manual plot, the API receives a candidate block and builds a rule context from the subject, faculty, room, section, existing schedule, faculty commitments, minor blocks, restrictions, approved requests, and scheduling settings. `ConstraintsService` evaluates the 27 registered rules from `@coe-nnect/constraint-rules` and returns hard conflicts and soft warnings. The scheduling service also has backend-level checks for conditions not represented by package rules.

Automatic generation:

1. Acquire the term-level generation lock and load scheduling inputs.
2. Check unplotted minors and room sufficiency.
3. Build the solver problem and call `POST /solve` on the solver service.
4. Re-evaluate returned blocks with the TypeScript rules engine.
5. Persist a draft only when hard validation passes, or return failure details.

The solver client uses a **240-second** solve timeout and retries transient `502`/`503`/`504`/network failures. Parser timeouts are 60 seconds for normal info/extract, 240 seconds for OCR, 180 seconds for table detection, and 30 seconds for health checks.

See the [scheduling API contract](../interface-contract/docs/interface-contract/scheduling-api.md), [constraint rules guide](../packages/constraint-rules.md), and [solver guide](../packages/solver-service.md).

## Prospectus PDF processing

1. An authorized user uploads a PDF through the frontend editor.
2. The backend stores the file in Supabase Storage bucket `prospectus-pdfs` and persists PDF/table-region metadata.
3. `/info` supplies page dimensions; `/detect` can propose table regions; `/extract` reads text from the editor-defined regions.
4. The parser returns cell text, the user reviews it, and `/import` creates or matches subjects and writes prospectus entries.

Image-only pages can use the parser's opt-in OCR fallback. See the [prospectus parser guide](../packages/prospectus-parser.md).

## IDP integration

The `IdpModule` under `src/modules/idp` implements the CoE-NNECT ↔ IDP v2.0 contract. Pattern C is primary because the IDP deployment is an offline-capable desktop app; Pattern A (REST + webhooks) remains as a fallback.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/idp/v1/health` | Public | Integration and configuration health. |
| `POST` | `/api/idp/v1/webhooks/faculty-changed` | HMAC-SHA256 | Faculty change event from IDP. |
| `POST` | `/api/idp/v1/webhooks/change-request` | HMAC-SHA256 | Change request from IDP. |
| `POST` | `/api/idp/v1/inbox/faculty` | Device bearer key | Faculty snapshot pushed by the IDP desktop. |
| `GET` | `/api/idp/v1/outbox/schedules` | Device bearer key | Published schedules polled by the IDP desktop. |
| `GET` | `/api/idp/v1/outbox/faculty-requests` | Device bearer key | Faculty-request statuses polled by the IDP desktop. |
| `GET` | `/api/idp/v1/outbox/change-request-acks` | Device bearer key | Change-request acks polled by the IDP desktop. |
| `POST` | `/api/v1/idp/faculty/sync` | Bearer JWT + role guard | User-triggered roster refresh (Pattern A). |
| `GET` | `/api/v1/idp/schedules/payload` | Bearer JWT + role guard | Build the schedule payload for publishing. |
| `POST` | `/api/v1/idp/schedules/publish` | Bearer JWT + role guard | Queue and optionally push a published schedule. |
| `GET` | `/api/v1/idp/change-requests` | Bearer JWT + role guard | Review queue for inbound change requests. |
| `GET` | `/api/v1/idp/change-requests/:id` | Bearer JWT + role guard | Read one inbound change request. |
| `POST` | `/api/v1/idp/change-requests/:id/ack` | Bearer JWT + role guard | Record the reviewer decision and queue the ack. |

The sync applies faculty identity, qualifications, and unavailability, matches records by `wmsu_id` then `employee_id`, and maintains `faculty.sync_status` / `last_synced_at`. Local identity edits mark a row pending and block incoming IDP updates with `409 local_edit_pending`. Webhooks are signed with HMAC-SHA256 over the raw request body; `main.ts` enables `rawBody: true` for this reason. Webhook idempotency, change requests, and outbound schedules, faculty-request statuses, and acks are stored in `idp_processed_event`, `idp_change_request`, and `idp_outbox` so an offline desktop client can catch up safely. A change-request acknowledgement is a reviewer decision, not an automatic mutation of live schedule or faculty data.

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

## Security and observability

- **CORS:** production accepts only the exact origins listed in `FRONTEND_URL` and `CORS_ALLOWED_ORIGINS`; leading-subdomain wildcards are supported. Development and test additionally allow loopback origins. `CORS_ALLOW_TUNNEL=true` explicitly enables `https://*.trycloudflare.com` in production for demos.
- **Swagger:** available outside production. In production it stays disabled unless `ENABLE_SWAGGER=true` and both `SWAGGER_USER` and `SWAGGER_PASSWORD` are set; the docs are then protected with HTTP basic auth.
- **CSP and headers:** Helmet applies a Content-Security-Policy, HSTS in production, a no-referrer policy, and frame-ancestor denial. Swagger-specific inline allowances are enabled only when the docs are mounted.
- **Rate limiting:** HTTP requests are limited globally (`THROTTLE_LIMIT`, default 300 per `THROTTLE_TTL_MS`, default 60 seconds). Login is limited separately (`LOGIN_THROTTLE_LIMIT`, default 10 per minute), Cap has its own bucket (`CAP_THROTTLE_LIMIT`, default 60 per minute), and the public recovery routes have a strict bucket (`RECOVERY_THROTTLE_LIMIT`, default 10 per 15 minutes per IP).
- **Proxy trust:** set `TRUST_PROXY=true` only behind a trusted proxy. Railway's IaC sets it for the deployed backend.
- **Logs:** production emits one JSON object per line with a request correlation id (`X-Request-Id`), status, duration, and user id. Set `LOG_FORMAT=json` to opt in locally. Do not log request bodies or authorization headers.
- **Validation:** DTOs use class-validator; unknown properties are rejected by the global validation pipe.
- **Backups:** follow the [backup and restore runbook](../operations/backup-restore.md) before schema changes or production migrations.

## Environment variables

Copy `apps/backend/.env.example` to `apps/backend/.env`. The API must run with this working directory when using the template, because Nest reads `.env` from the process working directory.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Enables production security behavior when set to `production`. |
| `PORT` | `3000` | HTTP listen port. |
| `API_PREFIX` | `api` | Global route prefix. |
| `DATABASE_URL` | — | PostgreSQL connection string. Use the Supabase session pooler for hosted deployments. |
| `DATABASE_SSL` | `true` for hosted | Set `false` for a local stack without TLS. |
| `SUPABASE_URL` | — | Supabase project URL. |
| `SUPABASE_ANON_KEY` | — | Supabase anon/publishable key. |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Server-side Supabase key. Never expose to the browser. |
| `FRONTEND_URL` | — | Comma-separated allowed frontend origins. |
| `CORS_ALLOWED_ORIGINS` | — | Additional exact or leading-wildcard origins. |
| `CORS_ALLOW_TUNNEL` | `false` | Allow `https://*.trycloudflare.com` in production (demos only). |
| `TRUST_PROXY` | — | `true` or a hop count when behind a trusted proxy. |
| `THROTTLE_TTL_MS` | `60000` | Global rate-limit window. |
| `THROTTLE_LIMIT` | `300` | Global requests per window. |
| `LOGIN_THROTTLE_LIMIT` | `10` | Login attempts per minute. |
| `CAP_SECRET` | — | Cap signing secret, at least 16 bytes. Required for login. |
| `CAP_THROTTLE_LIMIT` | `60` | Cap challenge/redeem requests per minute per IP. |
| `RECOVERY_THROTTLE_LIMIT` | `10` | Public recovery requests per 15 minutes per IP. |
| `APP_PUBLIC_URL` | First `FRONTEND_URL` entry | Public frontend origin used in verification and reset email links. |
| `SMTP_HOST` | — | SMTP/Mox host. Required to enable recovery email. |
| `SMTP_PORT` | `587` | SMTP submission port. Use `465` with `SMTP_SECURE=true` for implicit TLS. |
| `SMTP_SECURE` | Auto (`true` on 465) | Use implicit TLS instead of STARTTLS. |
| `SMTP_USER`, `SMTP_PASSWORD` | — | SMTP login. Password is required when a user is set. |
| `SMTP_FROM` | — | From header for recovery email. Required to enable the feature. |
| `SMTP_REQUIRE_TLS` | `true` | Refuse plaintext SMTP delivery. |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | `true` | Verify the SMTP server certificate; disable only for local self-signed Mox. |
| `PROSPECTUS_PARSER_URL` | `http://localhost:8001` | Parser base URL. |
| `SOLVER_URL` | `http://localhost:8000` | Solver base URL. Set by Railway IaC in deployment. |
| `LOG_FORMAT` | — | Set `json` to force structured logs outside production. |
| `ENABLE_SWAGGER` | `false` | Mount Swagger in production when credentials are also set. |
| `SWAGGER_USER`, `SWAGGER_PASSWORD` | — | Basic-auth credentials for production Swagger. |
| `MAINTENANCE_BYPASS` | — | Development-only maintenance bypass. Never set in production. |
| `IDP_ENABLED` | `false` | Enable Pattern A outbound pulls and the refresh action. |
| `IDP_BASE_URL`, `IDP_API_KEY` | — | Pattern A endpoint and bearer token. |
| `IDP_DEVICE_API_KEY` | — | Pattern C device bearer key. |
| `IDP_WEBHOOK_SECRET` | — | HMAC secret for inbound webhooks. |
| `IDP_REQUEST_TIMEOUT_MS` | `15000` | Outbound IDP request timeout. |
| `IDP_WEBHOOK_TOLERANCE_MS` | `300000` | Allowed clock skew for webhook timestamps. |

## Setup and local development

Use Node.js 24 or newer and pnpm 12.6.0. From the repository root:

```powershell
pnpm install
Copy-Item apps\backend\.env.example apps\backend\.env
```

Set the Supabase and PostgreSQL configuration, then run the API from the backend directory so `.env` is loaded:

```powershell
Set-Location apps\backend
pnpm dev
```

The API listens on port `3000` by default. Swagger is at `http://localhost:3000/api/docs` in development. The parser and solver are optional for non-scheduling features; the root `pnpm dev` starts them when their virtual environments exist.

## Database and seed scripts

The API uses TypeORM to connect to PostgreSQL. Automatic schema synchronization is disabled. Apply schema changes through the project's Supabase SQL workflow.

The package exposes these database scripts:

```powershell
pnpm --filter @coe-nnect/backend db:reset
pnpm --filter @coe-nnect/backend seed:demo
```

`db:reset` is a **hard reset**. It truncates every table in the `public` schema with `RESTART IDENTITY CASCADE`, deletes every Supabase Auth user, and restores only the disabled `system_status` singleton. Public identity columns therefore start again at `1`; Auth user IDs remain UUIDs.

For a remote/hosted database, the script refuses to run unless both guards are set:

```powershell
$env:ALLOW_REMOTE_RESET = "1"
$env:SKIP_CONFIRM = "1"   # optional; otherwise type RESET at the prompt
pnpm --filter @coe-nnect/backend db:reset
pnpm --filter @coe-nnect/backend seed:demo
```

`seed:demo` creates only the four departments and six demo accounts:

| Department | Code | Account |
| --- | --- | --- |
| Computer Engineering | `CPE` | `head.cpe@wmsu.edu.ph` |
| Electrical Engineering | `EE` | `head.ee@wmsu.edu.ph` |
| Geodetic Engineering | `GE` | `head.ge@wmsu.edu.ph` |
| Environmental Eng. | `ENVE` | `head.enve@wmsu.edu.ph` |

The dean is `dean@wmsu.edu.ph` and the hidden developer account is `dev-admin@wmsu.edu.ph`. Every account uses the password `Demo!2345`. Running `seed:demo` again updates the departments, resets those passwords, and re-synchronises the matching `public.users` profiles.

Both commands affect the database configured in the environment. Review the script and target before running; `db:reset` is destructive.

### Dev Tools reset behavior

The Dev Tools page uses the same scripts but runs them from the backend:

- **Reset + Reseed** hard-resets the database, then immediately runs the demo seed.
- **Reset only** hard-resets without seeding.
- **Seed only** runs the demo seed without deleting existing data.

In production the backend runs the compiled files in `apps/backend/dist/database/seeds/` with Node, so the Railway runtime does not need `ts-node` or `src/`. The reset job passes `ALLOW_REMOTE_RESET=1` and `SKIP_CONFIRM=1`; this is safe only because the endpoint is administrator-only and the UI requires the confirmation phrase.

The Dev Tools reset preserves the signed-in administrator's Supabase Auth user and `public.users` profile (via `PRESERVE_AUTH_USER_ID`), so the job can be polled to completion without logging you out. The CLI `db:reset` has no such exception and deletes every Auth user.

## Build and checks

Run from the repository root:

```powershell
pnpm --filter @coe-nnect/backend build
pnpm --filter @coe-nnect/backend typecheck
pnpm --filter @coe-nnect/backend typecheck:test
pnpm --filter @coe-nnect/backend test
pnpm --filter @coe-nnect/backend test:e2e
pnpm --filter @coe-nnect/backend test:cov
```

Application code is under `src/`; integration tests and Jest configuration are under `test/`. Tests use fake Supabase adapters and do not need a live database. IDP coverage lives in `test/idp.service.spec.ts`, `test/idp-signature.guard.spec.ts`, and the related outbox/publisher suites. See the [testing guide](../testing.md) for the full test inventory and CI behavior.
