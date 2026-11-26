import 'reflect-metadata';

import { SchedulingService } from '../src/modules/scheduling/scheduling.service';
import { ScheduleFlagService } from '../src/modules/scheduling/services/schedule-flag.service';
import { ScheduleUnfinalizeService } from '../src/modules/scheduling/services/schedule-unfinalize.service';

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

function dispatcherMock() {
  return { dispatch: jest.fn(async () => {}) };
}

function recipientsMock() {
  return {
    departmentHeadsOfSchedule: jest.fn(async () => ['u1']),
    collegeDean: jest.fn(async () => ['u2']),
    administrators: jest.fn(async () => ['u3']),
    uniq: jest.fn((ids: string[]) => Array.from(new Set(ids))),
  };
}

async function dispatchForStatusChange() {
  const row = scheduleRow();
  const scheduleRepo = { save: jest.fn(async (entity: any) => entity) };
  const faculty = { assertOwnership: jest.fn(async () => row) };
  const departments = { assertDepartmentActive: jest.fn(async () => {}) };
  const dispatcher = dispatcherMock();
  const recipients = recipientsMock();
  const service = new SchedulingService(
    scheduleRepo as any,
    unused,
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
    unused,
  );

  await service.updateStatus(
    's1',
    'review',
    { userId: 'u9', username: 'department-head' } as any,
  );

  return dispatcher.dispatch;
}

async function dispatchForFlag() {
  const row = scheduleRow();
  const scheduleRepo = {
    findOne: jest.fn(async () => row),
    save: jest.fn(async (entity: any) => entity),
  };
  const dispatcher = dispatcherMock();
  const recipients = recipientsMock();
  const service = new ScheduleFlagService(
    scheduleRepo as any,
    dispatcher as any,
    recipients as any,
  );

  await service.flagSchedule('s1', 'Needs review', {
    userId: 'u9',
    username: 'department-head',
    role: 'department_head',
    deptId: '7',
  } as any);

  return dispatcher.dispatch;
}

async function dispatchForUnfinalize(action: 'approve' | 'reject') {
  const row = scheduleRow({ status: 'published' });
  const request = {
    requestId: 'ur1',
    scheduleId: 's1',
    status: 'pending',
    requestedBy: 'u-requester',
    reason: 'Please return this to draft.',
    responseRemarks: null,
    schedule: row,
  };
  const requestRepo = {
    findOne: jest.fn(async () => request),
    save: jest.fn(async (entity: any) => entity),
  };
  const scheduleRepo = { update: jest.fn(async () => ({})) };
  const dispatcher = dispatcherMock();
  const recipients = recipientsMock();
  const service = new ScheduleUnfinalizeService(
    requestRepo as any,
    scheduleRepo as any,
    unused,
    unused,
    dispatcher as any,
    recipients as any,
    unused,
  );

  await service.respond(
    'ur1',
    { action, remarks: 'Reviewed.' } as any,
    { userId: 'u-dean', username: 'dean' } as any,
  );

  return dispatcher.dispatch;
}

test('adds subjectId to schedule.status_changed notifications', async () => {
  const dispatch = await dispatchForStatusChange();

  expect(dispatch).toHaveBeenCalledWith(
    'schedule.status_changed',
    expect.objectContaining({
      entityType: 'schedule',
      payload: expect.objectContaining({
        subjectId: '16',
        subjectCode: 'CS 101',
      }),
    }),
  );
});

test('adds subjectId to schedule.flagged notifications', async () => {
  const dispatch = await dispatchForFlag();

  expect(dispatch).toHaveBeenCalledWith(
    'schedule.flagged',
    expect.objectContaining({
      entityType: 'schedule',
      payload: expect.objectContaining({
        subjectId: '16',
        subjectCode: 'CS 101',
      }),
    }),
  );
});

test('adds subjectId to approved unfinalize notifications', async () => {
  const dispatch = await dispatchForUnfinalize('approve');

  expect(dispatch).toHaveBeenCalledWith(
    'schedule.unfinalize_approved',
    expect.objectContaining({
      entityType: 'schedule',
      payload: expect.objectContaining({
        subjectId: '16',
        subjectCode: 'CS 101',
      }),
    }),
  );
});

test('adds subjectId to rejected unfinalize notifications', async () => {
  const dispatch = await dispatchForUnfinalize('reject');

  expect(dispatch).toHaveBeenCalledWith(
    'schedule.unfinalize_rejected',
    expect.objectContaining({
      entityType: 'schedule',
      payload: expect.objectContaining({
        subjectId: '16',
        subjectCode: 'CS 101',
      }),
    }),
  );
});
