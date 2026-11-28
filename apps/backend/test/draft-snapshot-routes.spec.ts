import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const read = (...segments: string[]) =>
  readFileSync(join(repoRoot, ...segments), 'utf8');

describe('draft snapshot save and list contract', () => {
  it('declares DH/admin-only save and list routes', () => {
    const controller = read(
      'apps/backend/src/modules/scheduling/controllers/draft-snapshot.controller.ts',
    );
    const module = read(
      'apps/backend/src/modules/scheduling/scheduling.module.ts',
    );

    assert.match(controller, /@Controller\('v1\/schedules'\)/);
    assert.match(controller, /@Get\('draft-snapshots'\)/);
    assert.match(controller, /@Post\('draft-snapshots'\)/);
    assert.match(controller, /@Get\('draft-snapshots\/:snapshotId\/entries'\)/);
    assert.match(controller, /@Delete\('draft-snapshots\/:snapshotId'\)/);
    assert.match(
      controller,
      /@Auditable\(\{ action: 'schedule\.draft_delete', source: 'Scheduling' \}\)/,
    );
    assert.equal(
      (controller.match(/@Roles\('department_head', 'administrator'\)/g) ?? [])
        .length,
      6,
    );
    assert.match(
      controller,
      /@Auditable\(\{ action: 'schedule\.draft_save', source: 'Scheduling' \}\)/,
    );

    const registered = module.match(/controllers:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    assert.ok(
      registered.indexOf('DraftSnapshotController') <
        registered.indexOf('SchedulingController'),
    );
    assert.match(module, /TermDraftSnapshotService,/);
  });

  it('saves only draft/review rows with term labels', () => {
    const service = read(
      'apps/backend/src/modules/scheduling/services/term-draft-snapshot.service.ts',
    );

    assert.match(
      service,
      /async save\(dto: SaveDraftSnapshotDto, actor: any\)/,
    );
    assert.match(
      service,
      /async list\(termId: string, deptId: string, actor: any\)/,
    );
    assert.match(
      service,
      /async detail\(snapshotId: string, termId: string, deptId: string, actor: any\)/,
    );
    assert.match(
      service,
      /async delete\(snapshotId: string, termId: string, deptId: string, actor: any\)/,
    );
    assert.match(service, /item\?\.status === 'draft' \|\| item\?\.status === 'review'/);
    assert.match(service, /status:\s*In\(\['draft', 'review'\]\)/);
    assert.match(service, /is_active/);
    assert.match(service, /throw new BadRequestException/);
    assert.doesNotMatch(service, /status: 'published'/);
    assert.match(service, /rows\.length === 0/);
    assert.match(service, /termName:/);
    assert.match(service, /semester:/);
    assert.match(service, /schoolYear:/);
  });

  it('preflights and applies an all-or-nothing draft load', () => {
    const controller = read(
      'apps/backend/src/modules/scheduling/controllers/draft-snapshot.controller.ts',
    );
    const service = read(
      'apps/backend/src/modules/scheduling/services/term-draft-snapshot.service.ts',
    );

    assert.match(
      service,
      /async preflight\(snapshotId: string, dto: DraftSnapshotTargetDto, actor: any\)/,
    );
    assert.match(
      service,
      /async apply\(snapshotId: string, dto: ApplyDraftSnapshotDto, actor: any\)/,
    );
    assert.match(service, /dto\.confirmed !== true/);
    assert.match(service, /snapshot\.termId/);
    assert.match(
      service,
      /filter\(item => item\?\.status === 'draft' \|\| item\?\.status === 'review'\)/,
    );
    assert.match(service, /excludeScheduleIds:/);
    assert.match(service, /existingSchedule\.push\(/);
    assert.match(service, /engine\.hardConflicts\.length > 0/);
    assert.match(service, /engine\.softWarnings/);
    assert.match(service, /prospectus/);
    assert.match(service, /cancelOrphanedFacultyRequest\(/);
    assert.match(service, /this\.dataSource\.transaction\(/);
    assert.match(service, /finalized or published/);
    assert.match(service, /pending faculty request/);

    assert.match(
      controller,
      /@Post\('draft-snapshots\/:snapshotId\/preflight'\)/,
    );
    assert.match(controller, /@Post\('draft-snapshots\/:snapshotId\/load'\)/);
    assert.match(
      controller,
      /@Auditable\(\{ action: 'schedule\.draft_load', source: 'Scheduling' \}\)/,
    );
    assert.equal(
      (controller.match(/@Roles\('department_head', 'administrator'\)/g) ?? [])
        .length,
      6,
    );
  });
});
