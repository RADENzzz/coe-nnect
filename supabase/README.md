# Supabase database workflow

The tracked schema lives in `migrations/`. There is no demo seed in this directory; `seed.sql` is reserved for deterministic local/test fixtures.

## Tracked migrations

Apply in filename order. There are currently **16 migrations** creating **41 tables** and **9 enum types**.

| File | Contents |
| --- | --- |
| `20261021000000_initial_schema.sql` | Baseline snapshot of the public schema as of 20 October 2026: tables, types, functions, triggers, RLS policies, indexes, grants, and the `auth.users` trigger. |
| `20261022000000_system_status_and_schedule_dept_guard.sql` | `system_status` singleton banner table, the `trg_schedule_active_dept` deactivated-department guard, and `REVOKE USAGE ON SCHEMA public FROM PUBLIC`. |
| `20261102000000_add_schema_drift_columns.sql` | Entity columns missing from the baseline: `subject.is_placeholder`, `prospectus.slot_label`, and `schedule_unscheduled.dept_id`. |
| `20261102001000_add_maintenance_mode.sql` | `system_status.maintenance_mode`, the access gate that blocks sign-in and API use for everyone except the hidden administrator. |
| `20261103000000_add_prospectus_deactivated_by_subject.sql` | `prospectus.deactivated_by_subject`, so reactivating a subject only restores rows that the cascade turned off. |
| `20261106000000_add_college_secretary_role.sql` | Adds `college_secretary` to the `user_role` enum. |
| `20261106000100_grant_college_secretary_rls.sql` | Updates role-gated RLS write policies so direct Supabase clients treat the secretary as an authorised writer. Approvals, audit trail, and schedules remain dean-only. |
| `20261111000000_add_user_presence.sql` | `user_presence` heartbeat table (`user_id`, `last_seen_at`) with RLS enabled and no client policies. |
| `20261111000100_add_idp_processed_event.sql` | Durable IDP webhook idempotency keys for at least 30 days. |
| `20261111000200_add_idp_outbox.sql` | Pattern C outbox for schedules, faculty-request statuses, and change-request acknowledgements; `(kind, idempotency_key)` is the contract pair. |
| `20261111000300_add_idp_change_request.sql` | Inbound IDP change requests, reviewer decision, and acknowledgement state. |
| `20261112000100_add_elective_subjects.sql` | Elective subject columns and elective PDF-table metadata, including placeholder codes and total-units-only electives. |
| `20261112000200_add_cap_auth.sql` | `cap_nonce` and `cap_token` for single-use Cap challenge redemption and login-token storage. |
| `20261114000000_add_user_recovery.sql` | `public.user_recovery` for optional recovery addresses and single-use verification/reset token hashes. |
| `20261114000100_add_elective_categories.sql` | `subject.elective_category`, `elective_year_level`, and `elective_semester` plus their checks and partial index. |
| `20261114000200_fix_pdf_row_snapshots.sql` | Data cleanup for empty cell overrides written by the old PDF row-snapshot logic. |

Every change applied to the hosted database also needs a migration file here so `supabase db reset` reproduces it. The matching DDL snapshot lives in `docs/DATABASE STRUCTURE/coe-nnect-database-structure.sql` and is regenerated with `scripts/dump-database-schema.ps1`.

## Schema conventions

- The API connects through `DATABASE_URL` and bypasses RLS; direct Supabase clients are governed by the policies and grants in the migrations.
- Integration and presence state (`cap_nonce`, `cap_token`, `idp_processed_event`, `idp_outbox`, `idp_change_request`, `user_presence`) enables RLS with no client policies and no `anon`/`authenticated` grants. Only the API's database connection reads or writes those tables.
- Do not enable TypeORM `synchronize`. Migrations are the source of truth.
- Never edit an already-applied migration. Add a new file with a later timestamp.

## Local reset

Docker is required for the local Supabase stack.

```powershell
supabase start
supabase db reset
```

`db reset` recreates the local database, applies every migration in order, and then runs `seed.sql`. That seed is intentionally data-free. To load the demo departments and accounts after a reset, run:

```powershell
pnpm --filter @coe-nnect/backend seed:demo
```

For a hosted database, use the guarded backend `db:reset` script instead; see [the backend guide](../docs/apps/backend.md#database-and-seed-scripts).

## CI validation

`.github/workflows/ci-migrations.yml` starts a clean Supabase stack on the GitHub runner and runs `supabase db reset`. This proves that a fresh database can be built from the tracked migrations without the demo seed. The browser E2E workflow also resets the local stack before seeding its own fixtures.

## Adopting the baseline on an existing database

`20261021000000_initial_schema.sql` is a baseline snapshot of the existing public schema. On a database that already has that schema, do not replay the baseline. Mark it as applied instead, after confirming the snapshot matches the database:

```powershell
supabase link --project-ref <project-ref>
supabase migration repair --status applied 20261021000000
```

Then future migrations can be applied normally:

```powershell
supabase db push
```

Never run `supabase db reset` against a hosted or production project.

## Verification queries

After a reset or deploy, confirm the schema is complete:

```sql
select count(*) from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';
-- expected: 41

select count(distinct t.typname)
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typtype = 'e';
-- expected: 9
```

Check that the integration tables are protected:

```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('cap_nonce', 'cap_token', 'user_presence',
                  'idp_processed_event', 'idp_outbox', 'idp_change_request');
```

Every row should report `relrowsecurity = true`.
