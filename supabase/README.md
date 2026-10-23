# Supabase database workflow

The tracked schema lives in `migrations/`. There is no demo seed in this
directory; `seed.sql` is reserved for deterministic local/test fixtures.

## Tracked migrations

| File                                                       | Contents                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261021000000_initial_schema.sql`                        | Baseline snapshot of the public schema as of 20 October 2026.                                                                               |
| `20261022000000_system_status_and_schedule_dept_guard.sql` | `system_status` banner table, the `trg_schedule_active_dept` deactivated-department guard, and `REVOKE USAGE ON SCHEMA public FROM PUBLIC`. |

Every change applied to the hosted database also needs a migration file here so
`supabase db reset` reproduces it. The matching DDL snapshot lives in
`docs/DATABASE STRUCTURE/coe-nnect-database-structure.sql` and is regenerated
with `scripts/dump-database-schema.ps1`.

## Local reset

Docker is required for the local Supabase stack.

```powershell
supabase start
supabase db reset
```

`db reset` recreates the local database, applies every migration in order, and
then runs `seed.sql`. That seed is intentionally data-free. To load the demo
departments and accounts after a reset, run:

```powershell
pnpm --filter @coe-nnect/backend seed:demo
```

For a hosted database, use the guarded backend `db:reset` script instead; see
[the backend guide](../docs/apps/backend.md#database-and-seed-scripts).

## CI validation

`.github/workflows/ci-migrations.yml` starts a clean Supabase stack on the
GitHub runner and runs `supabase db reset`. This proves that a fresh database
can be built from the tracked migrations without the demo seed.

## Adopting the baseline on an existing database

`20261021000000_initial_schema.sql` is a baseline snapshot of the existing
public schema. On a database that already has that schema, do not replay the
baseline. Mark it as applied instead, after confirming the snapshot matches the
database:

```powershell
supabase link --project-ref <project-ref>
supabase migration repair --status applied 20261021000000
```

Then future migrations can be applied normally:

```powershell
supabase db push
```

Never run `supabase db reset` against a hosted or production project.
