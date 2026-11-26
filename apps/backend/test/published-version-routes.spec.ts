import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const read = (...segments: string[]) =>
  readFileSync(join(repoRoot, ...segments), 'utf8');

describe('published version route contract', () => {
  it('declares the archive, detail and compare routes with the intended roles', () => {
    const controller = read(
      'apps/backend/src/modules/scheduling/controllers/published-version.controller.ts',
    );
    const module = read(
      'apps/backend/src/modules/scheduling/scheduling.module.ts',
    );

    assert.match(controller, /@Controller\('v1\/schedules'\)/);
    assert.match(controller, /@Get\('published-versions'\)/);
    assert.match(controller, /@Get\('published-versions\/:versionId'\)/);
    assert.match(controller, /@Get\('version-compare'\)/);
    assert.match(controller, /@Query\('deptId'\) deptId\?: string/);
    assert.match(
      controller,
      /@Roles\('college_dean', 'department_head', 'college_secretary', 'administrator'\)/,
    );
    const controllersBlock = module.match(/controllers:\s*\[([\s\S]*?)\]/);
    assert.ok(
      controllersBlock,
      'scheduling.module.ts must declare a controllers array',
    );
    const registered = controllersBlock[1];
    assert.ok(
      registered.includes('PublishedVersionController') &&
        registered.includes('SchedulingController'),
      'both controllers must be registered in the controllers array',
    );
    assert.ok(
      registered.indexOf('PublishedVersionController') <
        registered.indexOf('SchedulingController'),
      'PublishedVersionController must be registered before SchedulingController',
    );
  });

  it('declares secretary access on read-only version routes only', () => {
    const controller = read(
      'apps/backend/src/modules/scheduling/controllers/published-version.controller.ts',
    );
    const scheduling = read(
      'apps/backend/src/modules/scheduling/scheduling.controller.ts',
    );

    for (const marker of [
      "@Get('published-versions')",
      "@Get('published-versions/:versionId')",
      "@Get('version-compare')",
    ]) {
      const block = controller.slice(
        controller.indexOf(marker),
        controller.indexOf(marker) + 260,
      );
      assert.match(
        block,
        /@Roles\('college_dean', 'department_head', 'college_secretary', 'administrator'\)/,
      );
    }

    for (const marker of [
      "@Get('versions')",
      "@Get('versions/compare')",
      "@Get('versions/:versionId')",
    ]) {
      const block = scheduling.slice(
        scheduling.indexOf(marker),
        scheduling.indexOf(marker) + 260,
      );
      assert.match(
        block,
        /@Roles\('college_dean', 'department_head', 'college_secretary'\)/,
      );
    }

    assert.equal(
      (controller.match(/@Roles\('department_head', 'administrator'\)/g) ?? [])
        .length,
      2,
      'preflight and reuse must remain head/admin only',
    );
  });

  it('resolves actor scope on both read-only snapshot detail routes', () => {
    const controller = read(
      'apps/backend/src/modules/scheduling/controllers/published-version.controller.ts',
    );
    const scheduling = read(
      'apps/backend/src/modules/scheduling/scheduling.controller.ts',
    );

    assert.match(
      controller,
      /async findOne[\s\S]*?@Query\('deptId'\) deptId\?: string[\s\S]*?resolveVersionDeptId\(req\.profile, deptId\)/,
    );
    assert.match(
      scheduling,
      /async findVersion\([\s\S]*?@Query\('deptId'\) deptId\?: string[\s\S]*?resolveVersionDeptId\(req\.profile, deptId\)/,
    );
  });
});
