import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const read = (...segments: string[]) =>
  readFileSync(join(repoRoot, ...segments), 'utf8');

const migrationPath =
  'supabase/migrations/20261128000000_add_term_draft_snapshots.sql';
const entityPath =
  'apps/backend/src/modules/scheduling/entities/term-draft-snapshot.entity.ts';
const modulePath = 'apps/backend/src/modules/scheduling/scheduling.module.ts';

describe('term draft snapshot persistence contract', () => {
  it('creates the draft snapshot table with backend-only grants', () => {
    const sql = read(migrationPath);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.term_draft_snapshot/);
    assert.match(
      sql,
      /term_id bigint[\s\S]*?REFERENCES public\.term\(term_id\)[\s\S]*?ON DELETE CASCADE/,
    );
    assert.match(
      sql,
      /dept_id bigint[\s\S]*?REFERENCES public\.department\(dept_id\)[\s\S]*?ON DELETE CASCADE/,
    );
    assert.match(sql, /snapshot jsonb NOT NULL/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(
      sql,
      /REVOKE ALL ON TABLE public\.term_draft_snapshot FROM anon, authenticated/,
    );
    assert.match(
      sql,
      /GRANT ALL ON TABLE public\.term_draft_snapshot TO service_role/,
    );
    assert.doesNotMatch(sql, /uq_term_draft_snapshot_name/);
  });

  it('indexes term, department, and recency without making names unique', () => {
    const sql = read(migrationPath);
    assert.match(
      sql,
      /CREATE INDEX idx_term_draft_snapshot_term_dept\s+ON public\.term_draft_snapshot \(term_id, dept_id\)/,
    );
    assert.match(
      sql,
      /CREATE INDEX idx_term_draft_snapshot_term_dept_created_at\s+ON public\.term_draft_snapshot \(term_id, dept_id, created_at DESC\)/,
    );
    assert.match(
      sql,
      /CREATE INDEX idx_term_draft_snapshot_created_at\s+ON public\.term_draft_snapshot \(created_at DESC\)/,
    );
    assert.match(
      sql,
      /CREATE TRIGGER trg_term_draft_snapshot_updated_at/,
    );
  });

  it('declares the draft snapshot entity fields', () => {
    const entity = read(entityPath);
    assert.match(entity, /@Entity\('term_draft_snapshot'\)/);
    for (const field of [
      'termDraftSnapshotId!: string',
      'termId!: string',
      'deptId!: string',
      'name!: string',
      'termName!: string',
      'semester!: string | null',
      'schoolYear!: string',
      'snapshot!: Record<string, unknown>',
      'createdBy!: string | null',
      'createdAt!: Date',
      'updatedAt!: Date',
    ]) {
      assert.ok(entity.includes(field), `entity is missing ${field}`);
    }
  });

  it('registers the draft snapshot entity with TypeORM', () => {
    assert.match(read(modulePath), /TermDraftSnapshot,/);
  });
});
