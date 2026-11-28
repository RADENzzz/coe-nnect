import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const read = (...segments: string[]) =>
  readFileSync(join(repoRoot, ...segments), 'utf8');

describe('schedule catalog resolver contract', () => {
  it('extracts catalog resolution from published-version reuse', () => {
    const resolver = read(
      'apps/backend/src/modules/scheduling/services/schedule-catalog-resolver.service.ts',
    );
    const reuse = read(
      'apps/backend/src/modules/scheduling/services/schedule-reuse.service.ts',
    );

    assert.match(resolver, /export class ScheduleCatalogResolver/);
    for (const method of [
      'resolveSubject',
      'resolveSection',
      'resolveRoom',
      'resolveFaculty',
      'dayOfWeek',
      'clockTime',
      'baseKey',
    ]) {
      assert.match(resolver, new RegExp(`\\b${method}\\(`, 'g'));
    }
    assert.match(resolver, /employeeId[\s\S]*?wmsuId[\s\S]*?faculty_name/);
    assert.match(resolver, /room_number/);
    assert.match(resolver, /subject_code/);
    assert.match(reuse, /private readonly catalog: ScheduleCatalogResolver/);
    assert.doesNotMatch(reuse, /private async resolveSubject\(/);
    assert.doesNotMatch(reuse, /private async resolveFaculty\(/);
  });

  it('declares validated save, target, and apply DTOs', () => {
    const dto = read(
      'apps/backend/src/modules/scheduling/dto/draft-snapshot.dto.ts',
    );
    assert.match(dto, /class SaveDraftSnapshotDto/);
    assert.match(dto, /@Length\(1, 120\)/);
    assert.match(dto, /class DraftSnapshotTargetDto/);
    assert.match(
      dto,
      /class ApplyDraftSnapshotDto extends DraftSnapshotTargetDto/,
    );
    assert.match(dto, /@Equals\(true\)/);
  });
});
