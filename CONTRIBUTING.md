# Contributing to CoE-NNECT

Thanks for helping improve CoE-NNECT. This guide covers local setup, the change workflow, validation expectations, and what reviewers look for. By participating, you agree to keep credentials, student/faculty personal data, and production database dumps out of the repository.

## Before you start

- Search existing issues and pull requests before opening a new one.
- For a bug, include reproduction steps, expected behavior, actual behavior, and environment details.
- For a feature, describe the user problem and the proposed behavior before writing a large change.
- Report security issues privately according to [SECURITY.md](SECURITY.md), not in a public issue.
- Keep changes focused. Unrelated refactors make review and rollback harder.

## Prerequisites

- Node.js 24 or newer
- pnpm 12.6.0 (pinned by `packageManager`)
- Git
- A Supabase project and PostgreSQL database for database-backed work
- Python 3.11+ for the parser or solver
- Docker for local Supabase and migration validation
- Chromium for Playwright (`pnpm test:e2e:install`)

## Local setup

```powershell
git clone https://github.com/RADENzzz/coe-nnect.git
Set-Location coe-nnect
pnpm install
Copy-Item apps\backend\.env.example apps\backend\.env
Copy-Item apps\frontend\.env.example apps\frontend\.env.local
```

Fill in:

- backend `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CAP_SECRET`;
- frontend `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_BASE_URL`.

Generate a Cap secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Install the Python environments once if you need the parser or solver:

```powershell
pnpm setup:venvs
```

Start the system:

```powershell
pnpm dev
```

Defaults: frontend `http://localhost:5173`, API `http://localhost:3000/api`, Swagger `http://localhost:3000/api/docs`, parser `http://localhost:8001`, solver `http://localhost:8000`.

Run backend commands from `apps/backend` when the command depends on `apps/backend/.env`. See the [frontend guide](docs/apps/frontend.md), [backend guide](docs/apps/backend.md), and [testing guide](docs/testing.md) for details.

## Branches and commits

Use a short, descriptive branch name:

```text
feat/chat-presence
fix/room-sufficiency-total
docs/railway-deployment
chore/update-dependencies
```

Write commit subjects in the imperative mood and keep the first line under ~72 characters. Explain the why in the body when it is not obvious. Example:

```text
Add persisted presence heartbeats

Realtime presence drops when a tab closes, so store a minute-level
last_seen_at for offline labels and the dean dashboard.
```

Do not commit generated build output, `.env` files, database dumps, `node_modules`, Playwright reports, or secrets.

## Validation by change type

Run the smallest set that proves your change, plus any shared checks that could be affected.

| Change | Minimum validation |
| --- | --- |
| Documentation only | Check links and code fences; run Prettier if you touched Markdown formatting. |
| Constraint rule | `pnpm --filter @coe-nnect/constraint-rules test` and `typecheck`. |
| Backend logic | `pnpm --filter @coe-nnect/backend typecheck`, `typecheck:test`, `test`, and `test:e2e`. |
| Backend API shape | The above plus a manual Swagger or HTTP check. |
| Frontend UI | `pnpm --filter @coe-nnect/frontend lint`, `typecheck`, and `build`; exercise the flow in a browser. |
| Database migration | `supabase db reset` locally and the migration CI workflow. |
| Cross-stack workflow | The relevant backend/frontend checks plus `pnpm test:e2e` against a disposable project. |
| Dependency or tooling | `pnpm install --frozen-lockfile`, then the affected build/test commands. |

Full root checks:

```powershell
pnpm typecheck
pnpm build
pnpm test
pnpm lint
```

`pnpm test` runs every workspace test script. The frontend has no unit-test script; its automated coverage is lint, type-check, build, and Playwright. The `@coe-nnect/idp-client` package has no test files, so its script uses `vitest run --passWithNoTests`.

## Code conventions

### General

- Keep TypeScript strict and avoid `any` unless you document why it is unavoidable.
- Prefer existing helpers, types, and API clients over new abstractions.
- Keep comments about behavior and constraints, not line-by-line narration.
- Do not silently swallow errors. Return a useful message and log enough context to diagnose the failure.
- Never log passwords, bearer tokens, service-role keys, webhook secrets, or full request bodies containing credentials.

### Backend

- Follow the Nest module/controller/service pattern.
- Put request validation in DTOs with class-validator.
- Apply `JwtAuthGuard` and `RolesGuard` explicitly; do not rely on frontend guards.
- Use the audit decorator/interceptor for mutations that belong in the audit trail.
- Keep database access in services/repositories; do not put SQL in controllers.
- Add Swagger annotations when a route or payload changes.
- Use fake Supabase adapters in tests instead of a live database.

### Frontend

- Keep page code under `src/features/<feature>` and shared UI under `src/components`.
- Use the existing Tailwind tokens and design primitives instead of hard-coded colors.
- Use React Query for server state and Zustand only for client state.
- Preserve keyboard access, focus handling, labels, and visible focus states when changing interactive UI.
- Do not assume a role is allowed because a route exists; check the role matrix and backend guards.
- Treat `VITE_*` values as public.

### Database

- Add a new file in `supabase/migrations/` for every schema change. Do not edit an already-applied migration.
- Keep the migration idempotent where practical (`IF NOT EXISTS`, guarded constraint drops).
- Update the TypeORM entity, DTOs, services, and tests in the same change.
- Regenerate the DDL snapshot with `pnpm db:snapshot` and update `docs/DATABASE STRUCTURE/README.md` when tables, enums, constraints, or counts change.
- Never run `supabase db reset` against a hosted or production database.
- Do not enable TypeORM `synchronize`.

### Documentation

- Update the relevant guide when behavior, routes, environment variables, commands, or deployment changes.
- Prefer links to a single source of truth over duplicating long explanations.
- Keep examples runnable and use the repository's actual script names.
- Mark placeholders and unimplemented packages clearly.

## Tests

- Add or update tests beside the code they cover.
- Constraint-rule changes need tests for both hard and soft outcomes.
- Backend tests should not require a live database or network.
- Playwright tests must use a disposable Supabase project. The E2E seed deactivates other terms and creates auth users, so never point `E2E_*` variables at production or a shared demo database.
- If you cannot run a check, say so in the pull request and explain why.

## Pull requests

Use the repository's pull-request template and include:

- **Summary:** the user problem and the chosen approach.
- **Changes:** the important files or behavior, not a file-by-file dump.
- **Validation:** exact commands and results, plus manual checks and screenshots for UI changes.
- **Impact:** database migrations, deployment variables, role/permission changes, or follow-up work.
- **Checklist:** focused change, tests run, docs updated, no secrets, and deployment/database impact described.

Reviewers look for:

- correct authorization on both browser and API boundaries;
- no regression in department scoping or schedule integrity;
- migrations that reproduce a clean database;
- accessible, keyboard-operable UI;
- documentation that matches the code;
- a focused diff with a clear rollback path.

Small, reviewable pull requests are merged faster than large mixed changes.

## Reporting security and accessibility issues

- Security: follow [SECURITY.md](SECURITY.md) and report privately.
- Accessibility: open an issue with the page, browser, assistive technology, and steps to reproduce. See [ACCESSIBILITY.md](ACCESSIBILITY.md).

## Documentation index

- [Documentation home](docs/README.md)
- [System architecture](docs/architecture/README.md)
- [Testing](docs/testing.md)
- [Railway deployment](docs/operations/railway.md)
- [Database structure](docs/DATABASE%20STRUCTURE/README.md)
