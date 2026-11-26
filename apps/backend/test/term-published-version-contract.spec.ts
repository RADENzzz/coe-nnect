import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const read = (...segments: string[]) =>
  readFileSync(join(repoRoot, ...segments), 'utf8');

const migrationPath =
  'supabase/migrations/20261126040000_add_term_published_versions.sql';
const entityPath =
  'apps/backend/src/modules/scheduling/entities/term-published-version.entity.ts';
const scheduleVersionPath =
  'apps/backend/src/modules/scheduling/entities/schedule-version.entity.ts';
const modulePath = 'apps/backend/src/modules/scheduling/scheduling.module.ts';

describe('term published version persistence contract', () => {
  it('creates the archive table and backend-only grants', () => {
    const sql = read(migrationPath);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.term_published_version/);
    assert.match(
      sql,
      /term_id bigint[\s\S]*?REFERENCES public\.term\(term_id\) ON UPDATE CASCADE ON DELETE SET NULL/,
    );
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(
      sql,
      /REVOKE ALL ON TABLE public\.term_published_version FROM anon, authenticated/,
    );
    assert.match(
      sql,
      /GRANT ALL ON TABLE public\.term_published_version TO service_role/,
    );
  });

  it('keeps one saved version per term while allowing deleted terms', () => {
    const sql = read(migrationPath);
    assert.match(
      sql,
      /CREATE UNIQUE INDEX uq_term_published_version_term[\s\S]*?WHERE term_id IS NOT NULL/,
    );
  });

  it('lets schedule version history survive term deletion', () => {
    const sql = read(migrationPath);
    assert.match(
      sql,
      /ALTER TABLE public\.schedule_version ALTER COLUMN term_id DROP NOT NULL/,
    );
    assert.match(
      sql,
      /schedule_version_term_id_fkey[\s\S]*?ON DELETE SET NULL/,
    );
  });

  it('declares the archive entity fields', () => {
    const entity = read(entityPath);
    assert.match(entity, /@Entity\('term_published_version'\)/);
    for (const field of [
      'termPublishedVersionId!: string',
      'termId!: string | null',
      'versionNumber!: number',
      'termName!: string',
      'semester!: string | null',
      'schoolYear!: string',
      'snapshot!: Record<string, unknown>',
      'publishedAt!: Date | null',
      'deactivatedAt!: Date | null',
      'updatedAt!: Date',
      'lastModifiedBy!: string | null',
    ]) {
      assert.ok(entity.includes(field), `entity is missing ${field}`);
    }
  });

  it('makes the schedule version term id nullable', () => {
    const scheduleVersion = read(scheduleVersionPath);
    assert.match(scheduleVersion, /termId!: string \| null/);
  });

  it('registers the archive entity with TypeORM', () => {
    const moduleSource = read(modulePath);
    assert.match(moduleSource, /TermPublishedVersion,/);
  });
});
