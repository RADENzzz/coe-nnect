import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const read = (...segments: string[]) =>
  readFileSync(join(repoRoot, ...segments), 'utf8');

const migrationPath =
  'supabase/migrations/20261126020000_add_schedule_publish_requests.sql';
const entityPath =
  'apps/backend/src/modules/scheduling/entities/schedule-publish-request.entity.ts';
const modulePath = 'apps/backend/src/modules/scheduling/scheduling.module.ts';

describe('schedule publish request persistence contract', () => {
  it('creates the status enum, table, and backend-only grants', () => {
    const migration = read(migrationPath);
    assert.match(migration, /CREATE TYPE public\.schedule_publish_request_status AS ENUM/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.schedule_publish_request/);
    assert.match(migration, /note text/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(
      migration,
      /REVOKE ALL ON TABLE public\.schedule_publish_request FROM anon, authenticated/,
    );
  });

  it('allows only one pending publish request per schedule', () => {
    const migration = read(migrationPath);
    assert.match(
      migration,
      /CREATE UNIQUE INDEX uq_schedule_publish_request_pending[\s\S]*WHERE status = 'pending'/,
    );
  });

  it('declares the publish request entity with a nullable note', () => {
    const entity = read(entityPath);
    assert.match(entity, /@Entity\('schedule_publish_request'\)/);
    assert.match(entity, /note: string \| null/);
  });

  it('registers the publish request entity with TypeORM', () => {
    const moduleSource = read(modulePath);
    assert.match(moduleSource, /SchedulePublishRequest,/);
  });
});
