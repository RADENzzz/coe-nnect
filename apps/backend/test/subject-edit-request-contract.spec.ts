import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const backendRoot = join(__dirname, '..');
const repoRoot = join(backendRoot, '..', '..');

const read = (...segments: string[]) =>
  readFileSync(join(repoRoot, ...segments), 'utf8');

const entity = read(
  'apps/backend/src/modules/subjects/entities/subject-edit-request.entity.ts',
);
const migration = read(
  'supabase/migrations/20261126010000_add_subject_edit_requests.sql',
);
const triggers = read('apps/backend/src/modules/notifications/triggers.ts');
const moduleSource = read(
  'apps/backend/src/modules/subjects/subjects.module.ts',
);

describe('subject edit-request persistence contract', () => {
  it('declares the subject edit-request entity and its status union', () => {
    assert.match(entity, /export type SubjectEditRequestStatus =[\s\S]*?'revoked'/);
    assert.match(entity, /@Entity\('subject_edit_request'\)/);
    assert.match(entity, /owningDeptId/);
  });

  it('creates a pending-unique, row-secure subject edit-request table', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.subject_edit_request/);
    assert.match(migration, /WHERE status = 'pending'/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  });

  it('registers the submitted and revoked notification triggers', () => {
    assert.match(triggers, /'subject_edit_request\.submitted'/);
    assert.match(triggers, /'subject_edit_request\.revoked'/);
  });

  it('registers the entity with TypeORM', () => {
    assert.match(moduleSource, /SubjectEditRequest,/);
  });
});
