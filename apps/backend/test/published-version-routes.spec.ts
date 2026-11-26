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
    assert.match(
      controller,
      /@Roles\('college_dean', 'department_head', 'administrator'\)/,
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
});
