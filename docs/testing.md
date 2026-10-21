# Testing and database validation

The project uses a hybrid test strategy:

- **Backend unit and integration tests** run in memory. They use Nest's testing
  utilities plus fake Supabase adapters, so they do not need a database
  connection.
- **Database validation** builds a clean Supabase database from the tracked
  migrations in CI.
- **Playwright end-to-end tests** run the real frontend, backend, and Supabase
  stack against a dedicated Supabase test project or a disposable local stack.
  They must never target production.

## Backend commands

Run from the repository root:

```powershell
pnpm --filter @coe-nnect/backend test
pnpm --filter @coe-nnect/backend test:e2e
pnpm --filter @coe-nnect/backend test:cov
pnpm --filter @coe-nnect/backend typecheck
pnpm --filter @coe-nnect/backend typecheck:test
```

- `test` runs `*.spec.ts` files.
- `test:e2e` runs `*.e2e-spec.ts` files with Supertest.
- `typecheck:test` type-checks both `src/` and `test/`.
- Tests that need Supabase reads should use
  `apps/backend/test/fakes/supabase.fake.ts`. It is intentionally small and
  should be extended as write-path tests are added.

The test app factory is
`apps/backend/test/helpers/create-test-app.ts`. It creates a focused Nest
application with the same validation pipe used by production, without importing
`AppModule` or opening real connections.

## Browser end-to-end tests

Playwright drives the actual scheduling workflow:

1. Department head signs in and plots a class.
2. Department head moves the schedule to **In Review**.
3. College dean finalizes the schedule from **Schedule Approvals**.
4. College dean publishes the finalized schedule.
5. Department head sees the published class on the timetable.

The suite is serial and uses one deterministic term, department, program,
subject, section, faculty member, room, and two test users. `e2e/seed.ts`
creates or repairs that data before the first test. It clears only schedules
belonging to the E2E term, deactivates other terms so the E2E term is active,
and never runs the demo seed.

> **Use a disposable database.** The seed assumes it owns the target Supabase
> project. It makes the E2E term the only active term and creates test auth
> users. Do not point `E2E_*` variables at production or at a shared demo
> database.

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

Playwright starts the backend on `127.0.0.1:3100` and Vite on
`127.0.0.1:5174`, using the E2E Supabase credentials. Override the URLs with
`E2E_API_URL` and `E2E_BASE_URL` if those ports are occupied.

### Dedicated hosted test project

Use the same variables with the project URL, anon key, service-role key, and
database connection string. Keep `E2E_DATABASE_SSL` unset (TLS is used). If the
frontend and backend are already running against that project, set
`E2E_SKIP_WEBSERVER=1`; the seed and tests still use the Supabase admin API.

Useful commands:

```powershell
pnpm test:e2e:list        # discover tests without starting servers
pnpm typecheck:e2e        # type-check the E2E sources
pnpm test:e2e:ui          # interactive Playwright UI
```

Failure screenshots, videos, and traces are written under
`e2e/test-results/`; the HTML report is `e2e/playwright-report/`.

### CI behavior

`ci-e2e.yml` runs the suite against a disposable local Supabase stack on Ubuntu.
It is serial (one worker, no retries) and seeds the E2E term in
`e2e/global-setup.ts`. Playwright starts the backend and Vite itself; both dev
servers use graceful `SIGTERM` shutdown so the Vite/esbuild process tree closes
its stdio pipes before Playwright exits. A Chromium launch preflight fails the
job in under a minute if the runner cannot start the browser, and the 12-minute
global timeout, 20-minute workflow step timeout, and `line` reporter ensure a
future stall fails visibly and still uploads the Playwright report.

## Database migrations

Tracked migrations live in `supabase/migrations/`. The initial migration is a
baseline of the existing public schema; see
[`supabase/README.md`](../supabase/README.md) before applying it to a database
that already has tables.

Validate migrations locally when Docker is available:

```powershell
supabase start
supabase db reset
supabase stop --no-backup
```

`supabase db reset` applies every migration to a clean local database and then
runs the data-free `supabase/seed.sql`. The demo seed is not part of this
workflow. CI runs the same reset in
`.github/workflows/ci-migrations.yml`.

## Frontend checks

```powershell
pnpm --filter @coe-nnect/frontend lint
pnpm --filter @coe-nnect/frontend typecheck
pnpm --filter @coe-nnect/frontend build
```

ESLint uses the flat config in `apps/frontend/eslint.config.js`. Existing
warnings are reported but do not fail CI; errors do.

## CI coverage

| Workflow | Checks |
| --- | --- |
| `ci-backend.yml` | Build, type-check, unit tests, integration tests, constraint rules |
| `ci-frontend.yml` | Lint, type-check, production build |
| `ci-migrations.yml` | Start clean Supabase, apply migrations, run empty seed |
| `ci-e2e.yml` | Start clean Supabase, seed E2E data, run Playwright workflow, upload report |
