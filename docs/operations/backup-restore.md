# Backup and restore runbook

This runbook covers the PostgreSQL database, Supabase Storage objects, and the
configuration needed to bring CoE-NNECT back after data loss. It is written for
the hosted Supabase deployment and for local/disposable environments.

## What must be backed up

| Asset | Location | Backup method |
| --- | --- | --- |
| Relational data and schema | Supabase Postgres / `DATABASE_URL` | Supabase automated backups or `pg_dump` |
| Prospectus PDFs and generated files | Supabase Storage bucket `prospectus-pdfs` | Dashboard/provider object backup |
| Auth users and sessions | Supabase Auth (stored in Postgres) | Included in a full database dump |
| Application configuration | Vercel/host environment | Export environment variables through the host console |
| Solver/parser configuration | Deployment environment | Versioned infrastructure files and secret manager |

> Never commit dumps, storage archives, `DATABASE_URL`, or service-role keys to
> the repository.

## Targets

- **RPO:** 24 hours for the free/scheduled-dump tier; point-in-time recovery
  (PITR) can reduce this to minutes when enabled on the Supabase plan.
- **RTO:** 2 hours for a full restore into a verified environment.
- **Retention:** 30 daily backups, 12 monthly backups, and 7 days of PITR where
  available.

## Automated Supabase backups

1. Open **Supabase Dashboard → Project → Database → Backups**.
2. Confirm daily backups are enabled and note the retention window.
3. If PITR is available, enable it and record the recovery window.
4. Keep the project's database password and service-role key in the approved
   secret manager, not in documentation.

Supabase backups cover the database. Verify separately that the Storage bucket
has versioning or is included in your provider backup policy.

## Manual logical backup

Use a `pg_dump` client whose major version matches the database server. Run
the command in a private terminal with the connection string supplied through
an environment variable.

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = "backups/coe-nnect-$stamp.dump"
New-Item -ItemType Directory -Force backups | Out-Null
pg_dump --format=custom --no-owner --no-acl --file $out $env:DATABASE_URL
Get-FileHash $out -Algorithm SHA256 | Format-List
```

```bash
stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups
pg_dump --format=custom --no-owner --no-acl \
  --file "backups/coe-nnect-${stamp}.dump" "$DATABASE_URL"
sha256sum "backups/coe-nnect-${stamp}.dump"
```

Store downloads encrypted and access-controlled. A backup is not complete
until a restore has been tested.

## Storage backup

Use the Supabase Dashboard's Storage browser to download the bucket, the
provider's object-storage backup tooling, or a supported `supabase storage`
command for your CLI version. Record the bucket policy and any signed-URL
settings alongside the archive. Do not rely on the database dump alone: object
bytes are not part of PostgreSQL.

## Restore drill (required)

Always restore into a disposable database first. Never test a restore against
production.

```powershell
createdb coe_nnect_restore
$env:RESTORE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/coe_nnect_restore'
pg_restore --dbname $env:RESTORE_URL --no-owner --no-acl --clean --if-exists backups/coe-nnect-YYYYMMDD-HHmmss.dump
```

For a hosted disposable project, use that project's session-pooler connection
string and set `DATABASE_SSL=true`.

Then verify:

```sql
select count(*) as applied_migrations from supabase_migrations.schema_migrations;
select count(*) as departments from department;
select count(*) as terms from term;
select count(*) as subjects from subject;
select count(*) as schedules from schedule;
select count(*) as audit_rows from audit_trail;
```

Start the API against the restored database and run the smoke checks:

1. `GET /api/v1/auth/me` with a test account.
2. Load the timetable for the active term.
3. Open one schedule and confirm its subject, section, room, and faculty.
4. Generate a room-sufficiency report and compare it with the source system.
5. Run `pnpm test:e2e` against the restored environment if the E2E project
   points at it. Never run the E2E seed against production data.

## Production restore procedure

1. Announce a maintenance window and stop writes (pause the API or enable
   maintenance mode at the edge).
2. Take a fresh backup of the current production database before changing it.
3. Restore the selected dump with `pg_restore` into the production database, or
   restore the Supabase backup/PITR checkpoint from the dashboard.
4. Ensure the schema migration table includes every migration currently in
   `supabase/migrations/`. If the dump predates a migration, run the migration
   workflow after the restore.
5. Restore the `prospectus-pdfs` storage objects and verify signed URLs.
6. Restore application environment variables and redeploy the backend and
   frontend.
7. Run the smoke checks above, then re-enable writes.
8. Record the restore time, backup timestamp, operator, and verification
   results in the incident/change log.

## Failure modes to check

- **Schema and code mismatch:** run `supabase migration list` and compare with
  the deployed backend version.
- **Missing storage objects:** database rows can reference PDFs that were not
  restored. Re-upload the missing objects or clear the references.
- **Auth logins fail:** confirm `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` belong to the restored project.
- **CORS failures:** set `FRONTEND_URL` to the exact production origin. Add
  extra exact origins through `CORS_ALLOWED_ORIGINS`.
- **Swagger exposed:** production requires `ENABLE_SWAGGER=true` plus
  `SWAGGER_USER` and `SWAGGER_PASSWORD`; otherwise it stays disabled.
- **Clock or timezone drift:** restore the same `Asia/Manila` assumption used by
  the application and E2E tests.

## Verification checklist

- [ ] Backup file exists, is encrypted, and has a recorded checksum.
- [ ] Restore completed without errors.
- [ ] Migration count matches the tracked migrations.
- [ ] Table counts are within the expected range.
- [ ] Timetable and PDF smoke checks pass.
- [ ] Storage objects are present.
- [ ] Auth and service-role keys are correct.
- [ ] Production writes are re-enabled only after sign-off.
