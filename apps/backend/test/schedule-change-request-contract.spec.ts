import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const read = (...segments: string[]) =>
  readFileSync(join(repoRoot, ...segments), 'utf8');

const controllerPath =
  'apps/backend/src/modules/scheduling/schedule-change-request.controller.ts';

describe('schedule change request contract', () => {
  it('declares the four change request routes', () => {
    const controller = read(controllerPath);

    assert.match(controller, /@Get\('change-requests'\)/);
    assert.match(controller, /@Patch\('change-requests\/:requestId'\)/);
    assert.match(controller, /@Get\(':id\/change-request'\)/);
    assert.match(controller, /@Post\(':id\/change-request'\)/);
  });

  it('restricts each route to its intended roles', () => {
    const controller = read(controllerPath);

    assert.match(
      controller,
      /@Roles\('college_dean', 'administrator'\)[\s\S]*findRequests/,
    );
    assert.match(controller, /@Roles\('department_head'\)[\s\S]*create/);
  });

  it('audits requests and decisions', () => {
    const controller = read(controllerPath);

    assert.match(controller, /action: 'schedule.change_request'/);
    assert.match(controller, /action: 'schedule.change_respond'/);
  });

  it('validates the request reason length', () => {
    const dto = read(
      'apps/backend/src/modules/scheduling/dto/create-schedule-change-request.dto.ts',
    );

    assert.match(dto, /@MinLength\(5/);
    assert.match(dto, /@MaxLength\(500/);
  });

  it('creates a backend-only change request table', () => {
    const migration = read(
      'supabase/migrations/20261126030000_add_schedule_change_requests.sql',
    );

    assert.match(
      migration,
      /CREATE TYPE public\.schedule_change_request_status AS ENUM/,
    );
    assert.match(migration, /reason text NOT NULL/);
    assert.match(migration, /uq_schedule_change_request_pending/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  });

  it('registers the change controller before the catch-all scheduling controller', () => {
    const moduleSource = read(
      'apps/backend/src/modules/scheduling/scheduling.module.ts',
    );

    assert.match(
      moduleSource,
      /ScheduleChangeRequestController,[\s\S]*SchedulingController/,
    );
  });
});
