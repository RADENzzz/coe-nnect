# Testing and database validation

The project uses several complementary test layers:

- **Constraint-rule tests** run the TypeScript scheduling rules with Vitest. There are **27 test files and 194 passing tests**.
- **Backend unit and integration tests** run in memory with Jest. They use Nest's testing utilities plus fake Supabase adapters, so they do not need a database connection.
- **Database validation** builds a clean Supabase database from the tracked migrations in CI.
- **Playwright end-to-end tests** run the real frontend, backend, and Supabase stack against a dedicated Supabase test project or a disposable local stack. They must never target production.

The frontend has no unit or component test runner and no `test` script. Its automated coverage is linting, TypeScript checking, the production build, and Playwright.

## Workspace test behavior

From the repository root:

```powershell
pnpm test
```

`pnpm test` is `pnpm -r test`, so it runs the `test` script of every workspace package that defines one:

| Workspace | Script | What runs |
| --- | --- | --- |
| `@coe-nnect/backend` | `jest` | Unit and integration specs matching `*.spec.ts` under `apps/backend`. |
| `@coe-nnect/constraint-rules` | `vitest run` | The 194 scheduling-rule tests. |
| `@coe-nnect/idp-client` | `vitest run --passWithNoTests` | No test files exist; the flag keeps the workspace run green. |
| `@coe-nnect/frontend` | — | No `test` script; use lint, type-check, build, and Playwright. |
| `@coe-nnect/prospectus-parser` | — | No JavaScript test script. |
| `@coe-nnect/shared-types` | — | No `test` script. |
| `@coe-nnect/solver-service` | — | No JavaScript test script. |

The `idp-client` package is a placeholder with no tests. Its `--passWithNoTests` flag is intentional; do not remove it unless real tests are added.

## Constraint rules

```powershell
pnpm --filter @coe-nnect/constraint-rules test
pnpm --filter @coe-nnect/constraint-rules typecheck
```

The package registers **27 rules** and currently has **194 passing tests** across 27 test files. Tests cover both hard failures and soft warnings. Rule changes should include tests for every outcome they can produce. See the [constraint rules guide](packages/constraint-rules.md) and [rules checklist](reconciliation/scheduling-rules-checklist.md).

## Backend commands

Run from the repository root:

```powershell
pnpm --filter @coe-nnect/backend test
pnpm --filter @coe-nnect/backend test:ci
pnpm --filter @coe-nnect/backend test:e2e
pnpm --filter @coe-nnect/backend test:cov
pnpm --filter @coe-nnect/backend typecheck
pnpm --filter @coe-nnect/backend typecheck:test
```

- `test` runs `*.spec.ts` files with Jest.
- `test:ci` runs the same suites with `--runInBand`, which is what CI uses.
- `test:e2e` runs `*.e2e-spec.ts` files with Supertest and a 30-second per-test timeout.
- `typecheck:test` type-checks both `src/` and `test/`.
- Tests that need Supabase reads should use `apps/backend/test/fakes/supabase.fake.ts`. It is intentionally small and should be extended as write-path tests are added.

The test app factory is `apps/backend/test/helpers/create-test-app.ts`. It creates a focused Nest application with the same validation pipe used by production, without importing `AppModule` or opening real connections.

There are currently 20 backend spec files under `apps/backend/test`. The Jest configuration ignores `*.e2e-spec.ts`, so the unit/integration and Supertest suites stay separate.

### IDP integration tests

The IDP tests use in-memory fake repositories and a mocked IDP client, so they need no database or network access:

- `apps/backend/test/idp.service.spec.ts`
- `apps/backend/test/idp-signature.guard.spec.ts`
- `apps/backend/test/idp-device.guard.spec.ts`
- `apps/backend/test/idp-outbox.service.spec.ts`
- `apps/backend/test/idp-schedule-publisher.service.spec.ts`
- `apps/backend/test/idp-faculty-request-publisher.service.spec.ts`
- `apps/backend/test/idp-change-request.service.spec.ts`
- `apps/backend/test/approvals.service.spec.ts`

Run only those files:

```powershell
cd apps/backend
npx jest --runInBand test/idp.service.spec.ts test/idp-signature.guard.spec.ts test/idp-device.guard.spec.ts test/idp-outbox.service.spec.ts test/idp-schedule-publisher.service.spec.ts test/idp-faculty-request-publisher.service.spec.ts test/idp-change-request.service.spec.ts test/approvals.service.spec.ts
```

Coverage includes HMAC acceptance/rejection, the timestamp tolerance window, device-key auth, roster creation, idempotent second pulls, unknown department codes, `409 local_edit_pending`, webhook dedupe / `409 duplicate_key`, `faculty.created`, outbox enqueue/freeze/poll semantics, in-place faculty-request status refresh, change-request validation and exactly-once acks, and the non-blocking approvals hook. See the [IDP integration guide](integrations/idp.md) and the [Milestone 3 checkpoint](integrations/idp-milestone-3-checkpoint.md).

## Browser end-to-end tests

Playwright drives the actual scheduling workflow:

1. Department head signs in and plots a class.
2. Department head moves the schedule to **In Review**.
3. College dean finalizes the schedule from **Schedule Approvals**.
4. College dean publishes the finalized schedule.
5. Department head sees the published class on the timetable.

The suite is serial and uses one deterministic term, department, program, subject, section, faculty member, room, and two test users. `e2e/seed.ts` creates or repairs that data before the first test. It clears only schedules belonging to the E2E term, deactivates other terms so the E2E term is active, and never runs the demo seed.

> **Use a disposable database.** The seed assumes it owns the target Supabase project. It makes the E2E term the only active term and creates test auth users. Do not point `E2E_*` variables at production or at a shared demo database.

### Local run with the Supabase CLI

Docker is required for the local Supabase stack.

```powershell
supabase start
supabase db reset --local --yes
supabase status -o env
```

Copy `e2e/.env.example` to `e2e/.env.local`, then map the local status values:

```dotenv
E2E_SUPABASE_URL=<API_URL>
E2E_SUPABASE_ANON_KEY=<ANON_KEY or PUBLISHABLE_KEY>
E2E_SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY or SECRET_KEY>
E2E_DATABASE_URL=<DB_URL>
E2E_DATABASE_SSL=false
```

Then install Chromium once and run the suite:

```powershell
pnpm test:e2e:install
pnpm test:e2e
```

Playwright starts the backend on `127.0.0.1:3100` and Vite on `127.0.0.1:5174`, using the E2E Supabase credentials and a test-only `CAP_SECRET`. Override the URLs with `E2E_API_URL` and `E2E_BASE_URL` if those ports are occupied.

### Dedicated hosted test project

Use the same variables with the project URL, anon key, service-role key, and database connection string. Keep `E2E_DATABASE_SSL` unset (TLS is used). If the frontend and backend are already running against that project, set `E2E_SKIP_WEBSERVER=1`; the seed and tests still use the Supabase admin API.

Useful commands:

```powershell
pnpm test:e2e:list        # discover tests without starting servers
pnpm typecheck:e2e        # type-check the E2E sources
pnpm test:e2e:ui          # interactive Playwright UI
```

Failure screenshots, videos, and traces are written under `e2e/test-results/`; the HTML report is `e2e/playwright-report/`.

### CI behavior

`ci-e2e.yml` runs the suite against a disposable local Supabase stack on Ubuntu. It:

- starts Supabase and applies every migration;
- exports the local API URL, anon key, service-role key, and database URL;
- installs Chromium and verifies it launches before running the suite;
- type-checks the E2E sources;
- runs Playwright with one worker and no retries;
- uploads `e2e/playwright-report` and `e2e/test-results` even on failure.

Playwright starts the backend and Vite itself; both dev servers use graceful `SIGTERM` shutdown so the Vite/esbuild process tree closes its stdio pipes before Playwright exits. A Chromium launch preflight fails the job in under a minute if the runner cannot start the browser, and the 12-minute global timeout, 20-minute workflow step timeout, and `line` reporter ensure a future stall fails visibly.

## Database migrations

Tracked migrations live in `supabase/migrations/`. The initial migration is a baseline of the existing public schema; see [`supabase/README.md`](../supabase/README.md) before applying it to a database that already has tables.

Validate migrations locally when Docker is available:

```powershell
supabase start
supabase db reset
supabase stop --no-backup
```

`supabase db reset` applies every migration to a clean local database and then runs the data-free `supabase/seed.sql`. The demo seed is not part of this workflow. CI runs the same reset in `.github/workflows/ci-migrations.yml`.

## Frontend checks

```powershell
pnpm --filter @coe-nnect/frontend lint
pnpm --filter @coe-nnect/frontend typecheck
pnpm --filter @coe-nnect/frontend build
```

ESLint uses the flat config in `apps/frontend/eslint.config.js`. Existing warnings are reported but do not fail CI; errors do. The build is the closest thing to a frontend regression check outside Playwright.

## CI coverage

| Workflow | Checks |
| --- | --- |
| `ci-backend.yml` | Backend build, type-check, test type-check, unit/integration tests (`test:ci`), Supertest E2E specs, and the constraint-rule suite. |
| `ci-frontend.yml` | Frontend lint, type-check, and production build. |
| `ci-migrations.yml` | Start clean Supabase, apply all migrations, run the empty seed, stop the stack. |
| `ci-e2e.yml` | Start clean Supabase, apply migrations, type-check E2E, run the Playwright scheduling workflow, upload the report. |

All four workflows run on pull requests and on pushes to `main`, use pnpm 12.6.0 and Node.js 24, and cancel superseded runs for the same ref.

## What to run before opening a pull request

| Change | Minimum validation |
| --- | --- |
| Documentation only | Check links and code fences. |
| Constraint rule | `pnpm --filter @coe-nnect/constraint-rules test` and `typecheck`. |
| Backend logic | `typecheck`, `typecheck:test`, `test`, and `test:e2e`. |
| Backend API shape | The above plus a manual Swagger or HTTP check. |
| Frontend UI | `lint`, `typecheck`, `build`, and a browser check. |
| Database migration | `supabase db reset` locally and the migration CI workflow. |
| Cross-stack workflow | The relevant backend/frontend checks plus `pnpm test:e2e` against a disposable project. |

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full validation matrix and pull-request expectations.
