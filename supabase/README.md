# Supabase database workflow

The tracked schema lives in `migrations/`. There is no demo seed in this
directory; `seed.sql` is reserved for deterministic local/test fixtures.

## Local reset

Docker is required for the local Supabase stack.

```powershell
supabase start
supabase db reset
```

`db reset` recreates the local database, applies every migration in order, and
then runs `seed.sql`.

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
