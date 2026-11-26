import 'reflect-metadata';

import { strict as assert } from 'node:assert';
import { SchedulingService } from '../src/modules/scheduling/scheduling.service';
import { deanProfile, departmentHeadProfile } from './helpers/profiles';

const scheduleRow = (overrides: Record<string, any> = {}) => ({
  scheduleId: 's1',
  termId: 't1',
  subjectId: '16',
  deptId: '7',
  status: 'draft',
  subject: { subjectCode: 'CS 101', title: 'Programming' },
  sectionRef: { sectionCode: 'CS-1A' },
  room: { roomNumber: 'R1' },
  term: { termName: 'First Term' },
  faculty: null,
  section: null,
  externalRoomName: null,
  externalFacultyName: null,
  dayOfWeek: 'Monday',
  startTime: '08:00:00',
  endTime: '10:00:00',
  flagged: false,
  flaggedBy: null,
  flaggedAt: null,
  flagReason: null,
  ...overrides,
});

const unused = {} as any;

function statusServiceHarness(overrides: Record<string, any> = {}) {
  const row = scheduleRow(overrides);
  const scheduleRepo = { save: jest.fn(async (entity: any) => entity) };
  const faculty = { assertOwnership: jest.fn(async () => row) };
  const departments = { assertDepartmentActive: jest.fn(async () => {}) };
  const scheduleVersions = { writeVersion: jest.fn(async () => {}) };
  const dispatcher = { dispatch: jest.fn(async () => {}) };
  const recipients = {
    departmentHeadsOfSchedule: jest.fn(async () => ['u1']),
    uniq: jest.fn((ids: string[]) => Array.from(new Set(ids))),
  };
  const schedulePublish = {
    cancelPendingForSchedule: jest.fn(async () => {}),
  };
  const scheduleUnfinalize = {
    cancelPendingForSchedule: jest.fn(async () => {}),
  };
  const scheduleChangeRequests = {
    cancelPendingForSchedule: jest.fn(async () => {}),
  };
  const service = new SchedulingService(
    scheduleRepo as any,
    scheduleVersions as any,
    unused,
    faculty as any,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    dispatcher as any,
    recipients as any,
    departments as any,
    scheduleUnfinalize as any,
    schedulePublish as any,
    scheduleChangeRequests as any,
  );

  return { service, row, scheduleChangeRequests };
}

it('cancels a pending change request when review moves to draft', async () => {
  const { service, scheduleChangeRequests } = statusServiceHarness({
    status: 'review',
  });

  const saved = await service.updateStatus('s1', 'draft', departmentHeadProfile);

  assert.equal(saved.status, 'draft');
  assert.equal(scheduleChangeRequests.cancelPendingForSchedule.mock.calls.length, 1);
  assert.deepEqual(
    Array.from(scheduleChangeRequests.cancelPendingForSchedule.mock.calls[0]),
    ['s1', departmentHeadProfile.userId],
  );
});

it('cancels a pending change request when finalized moves to draft', async () => {
  const { service, scheduleChangeRequests } = statusServiceHarness({
    status: 'finalized',
  });

  const saved = await service.updateStatus('s1', 'draft', departmentHeadProfile);

  assert.equal(saved.status, 'draft');
  assert.equal(scheduleChangeRequests.cancelPendingForSchedule.mock.calls.length, 1);
  assert.deepEqual(
    Array.from(scheduleChangeRequests.cancelPendingForSchedule.mock.calls[0]),
    ['s1', departmentHeadProfile.userId],
  );
});

it('does not cancel when review moves to finalized', async () => {
  const { service, scheduleChangeRequests } = statusServiceHarness({
    status: 'review',
  });

  const saved = await service.updateStatus(
    's1',
    'finalized',
    departmentHeadProfile,
  );

  assert.equal(saved.status, 'finalized');
  assert.equal(scheduleChangeRequests.cancelPendingForSchedule.mock.calls.length, 0);
});

it('does not cancel when published moves to draft', async () => {
  const { service, scheduleChangeRequests } = statusServiceHarness({
    status: 'published',
  });

  const saved = await service.updateStatus('s1', 'draft', deanProfile);

  assert.equal(saved.status, 'draft');
  assert.equal(scheduleChangeRequests.cancelPendingForSchedule.mock.calls.length, 0);
});
