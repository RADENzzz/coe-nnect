import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const read = (...segments: string[]) =>
  readFileSync(join(repoRoot, ...segments), 'utf8');

const controllerPath =
  'apps/backend/src/modules/scheduling/schedule-publish.controller.ts';

describe('schedule publish request route contract', () => {
  it('declares the four publish request routes', () => {
    const controller = read(controllerPath);

    assert.match(controller, /@Get\('publish-requests'\)/);
    assert.match(controller, /@Patch\('publish-requests\/:requestId'\)/);
    assert.match(controller, /@Get\(':id\/publish-request'\)/);
    assert.match(controller, /@Post\(':id\/publish-request'\)/);
  });

  it('restricts each route to its intended roles', () => {
    const controller = read(controllerPath);

    assert.match(controller, /@Roles\('college_dean', 'administrator'\)[\s\S]*findRequests/);
    assert.match(controller, /@Roles\('college_dean', 'administrator'\)[\s\S]*respond/);
    assert.match(controller, /@Roles\('college_dean', 'department_head', 'administrator'\)[\s\S]*findForSchedule/);
    assert.match(controller, /@Roles\('department_head'\)[\s\S]*create/);
  });

  it('audits requests and decisions', () => {
    const controller = read(controllerPath);

    assert.match(controller, /action: 'schedule\.publish_request'/);
    assert.match(controller, /action: 'schedule\.publish_respond'/);
  });

  it('validates the request note length', () => {
    const dto = read(
      'apps/backend/src/modules/scheduling/dto/create-schedule-publish-request.dto.ts',
    );

    assert.match(dto, /@MaxLength\(1000/);
  });

  it('registers the publish controller before the catch-all scheduling controller', () => {
    const moduleSource = read(
      'apps/backend/src/modules/scheduling/scheduling.module.ts',
    );

    assert.notEqual(
      moduleSource.indexOf('SchedulePublishController'),
      -1,
      'the publish controller must be registered',
    );
    assert.ok(
      moduleSource.indexOf('SchedulePublishController') <
        moduleSource.indexOf('SchedulingController'),
    );
  });
});
