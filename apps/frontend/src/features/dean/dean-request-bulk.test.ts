import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  PublishRequestSchedule,
  SchedulePublishRequest,
} from '../../api/schedule-publish-request.api';
import type {
  ScheduleUnfinalizeRequest,
  UnfinalizeRequestSchedule,
} from '../../api/schedule-unfinalize.api';
import type {
  ChangeRequestSchedule,
  ScheduleChangeRequest,
} from '../../api/schedule-change-request.api';
import {
  filterRequestRows,
  isPendingRequest,
  requestDecisionResultMessage,
  requestKindBreakdown,
  requestSelectionKey,
  type RequestRow,
} from './dean-request-bulk.ts';

const subject = (subjectCode: string, title: string) => ({
  subjectId: 'subject-1',
  subjectCode,
  title,
});

const publishSchedule = (
  subjectCode = 'CSC101',
  title = 'Programming',
  deptId = '1',
): PublishRequestSchedule => ({
  scheduleId: 'schedule-1',
  termId: 'term-1',
  subjectId: 'subject-1',
  deptId,
  section: null,
  status: 'finalized',
  dayOfWeek: null,
  startTime: null,
  endTime: null,
  externalFacultyName: null,
  externalRoomName: null,
  subject: subject(subjectCode, title),
});

const unfinalizeSchedule = (
  subjectCode = 'CSC101',
  title = 'Programming',
  deptId = '1',
): UnfinalizeRequestSchedule => ({
  scheduleId: 'schedule-1',
  termId: 'term-1',
  subjectId: 'subject-1',
  deptId,
  section: null,
  status: 'published',
  dayOfWeek: null,
  startTime: null,
  endTime: null,
  externalFacultyName: null,
  externalRoomName: null,
  subject: subject(subjectCode, title),
});

const changeSchedule = (
  subjectCode = 'CSC101',
  title = 'Programming',
  deptId = '1',
): ChangeRequestSchedule => ({
  scheduleId: 'schedule-1',
  termId: 'term-1',
  subjectId: 'subject-1',
  deptId,
  section: null,
  status: 'review',
  dayOfWeek: null,
  startTime: null,
  endTime: null,
  externalFacultyName: null,
  externalRoomName: null,
  subject: subject(subjectCode, title),
});

const publishRow = (
  overrides: Partial<SchedulePublishRequest> = {},
): RequestRow => ({
  kind: 'publish',
  request: {
    requestId: 'publish-1',
    scheduleId: 'schedule-1',
    deptId: '1',
    requestedBy: 'user-1',
    note: null,
    status: 'pending',
    respondedBy: null,
    respondedAt: null,
    responseRemarks: null,
    createdAt: '2026-11-28T00:00:00.000Z',
    updatedAt: '2026-11-28T00:00:00.000Z',
    ...overrides,
  },
});

const unfinalizeRow = (
  overrides: Partial<ScheduleUnfinalizeRequest> = {},
): RequestRow => ({
  kind: 'unfinalize',
  request: {
    requestId: 'unfinalize-1',
    scheduleId: 'schedule-1',
    deptId: '1',
    requestedBy: 'user-1',
    reason: 'Schedule needs correction.',
    status: 'pending',
    respondedBy: null,
    respondedAt: null,
    responseRemarks: null,
    createdAt: '2026-11-28T00:00:00.000Z',
    updatedAt: '2026-11-28T00:00:00.000Z',
    ...overrides,
  },
});

const changeRow = (
  overrides: Partial<ScheduleChangeRequest> = {},
): RequestRow => ({
  kind: 'change',
  request: {
    requestId: 'change-1',
    scheduleId: 'schedule-1',
    deptId: '1',
    requestedBy: 'user-1',
    reason: 'Schedule needs correction.',
    status: 'pending',
    respondedBy: null,
    respondedAt: null,
    responseRemarks: null,
    createdAt: '2026-11-28T00:00:00.000Z',
    updatedAt: '2026-11-28T00:00:00.000Z',
    ...overrides,
  },
});

test('selection keys include the request kind so identical ids stay distinct', () => {
  assert.equal(requestSelectionKey(publishRow({ requestId: 'r1' })), 'publish:r1');
  assert.equal(requestSelectionKey(changeRow({ requestId: 'r1' })), 'change:r1');
});

test('only pending requests are selectable', () => {
  assert.equal(isPendingRequest(publishRow()), true);
  assert.equal(isPendingRequest(publishRow({ status: 'approved' })), false);
});

test('request status filter drops resolved requests', () => {
  const rows = [publishRow(), publishRow({ requestId: 'publish-2', status: 'approved' })];

  assert.deepEqual(
    filterRequestRows(rows, 'all', '', '').map((row) => row.request.requestId),
    ['publish-1', 'publish-2'],
  );
  assert.deepEqual(
    filterRequestRows(rows, 'pending', '', '').map((row) => row.request.requestId),
    ['publish-1'],
  );
});

test('request query filter matches subject code case-insensitively', () => {
  const rows = [
    publishRow({ schedule: publishSchedule('CSC101', 'Programming') }),
    publishRow({
      requestId: 'publish-2',
      schedule: publishSchedule('MATH201', 'Statistics'),
    }),
  ];

  assert.deepEqual(
    filterRequestRows(rows, 'all', 'csc', '').map((row) => row.request.requestId),
    ['publish-1'],
  );
  assert.deepEqual(
    filterRequestRows(rows, 'all', 'zzz', '').map((row) => row.request.requestId),
    [],
  );
});

test('department filter uses the request department with a schedule fallback', () => {
  const rows = [
    publishRow({
      deptId: '2',
      schedule: publishSchedule('CSC101', 'Programming', '1'),
    }),
    changeRow({
      deptId: null,
      schedule: changeSchedule('MATH201', 'Statistics', '2'),
    }),
    unfinalizeRow({
      schedule: unfinalizeSchedule('MATH201', 'Statistics', '1'),
    }),
  ];

  assert.deepEqual(
    filterRequestRows(rows, 'all', '', '2').map((row) => row.request.requestId),
    ['publish-1', 'change-1'],
  );
});

test('kind breakdown counts mixed selections in publish, unfinalize, change order', () => {
  assert.equal(
    requestKindBreakdown([
      publishRow(),
      publishRow({ requestId: 'publish-2' }),
      changeRow(),
    ]),
    '2 Publish, 1 Change',
  );
  assert.equal(
    requestKindBreakdown([changeRow(), unfinalizeRow(), publishRow()]),
    '1 Publish, 1 Unfinalize, 1 Change',
  );
});

test('decision result message reports success counts and the first failure', () => {
  assert.equal(requestDecisionResultMessage('approve', 2, 0), 'Approved 2 requests.');
  assert.equal(requestDecisionResultMessage('approve', 1, 0), 'Approved 1 request.');
  assert.equal(requestDecisionResultMessage('reject', 1, 0), 'Rejected 1 request.');
  assert.equal(
    requestDecisionResultMessage('approve', 2, 1, 'Request is stale.'),
    '2 succeeded, 1 failed. Request is stale.',
  );
  assert.equal(
    requestDecisionResultMessage('reject', 0, 2),
    '0 succeeded, 2 failed.',
  );
});
