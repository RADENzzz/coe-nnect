# Testing and database validation

The project uses a hybrid test strategy:

- **Backend unit and integration tests** run in memory. They use Nest's testing
  utilities plus fake Supabase adapters, so they do not need a database
  connection.
- **Database validation** builds a clean Supabase database from the tracked
  migrations in CI.
- **Playwright end-to-end tests** (next phase) will run against a dedicated
  Supabase test project or a local Supabase stack. They must never target
  production.

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
