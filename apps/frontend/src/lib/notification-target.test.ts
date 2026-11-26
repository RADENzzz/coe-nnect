import assert from 'node:assert/strict';
import test from 'node:test';
import type { NotificationItem } from '../api/notifications.api';
import {
  notificationHref,
  notificationIcon,
  type ShellBase,
} from './notification-target.ts';

const base = {
  notificationId: 'n1',
  recipientId: 'u1',
  triggerKey: 'subject_edit_request.submitted',
  category: 'approvals',
  title: 'CS 101 — edit access requested',
  body: null,
  entityType: 'subject_edit_request',
  entityId: 'r1',
  payload: { requestId: 'r1', subjectId: '16', subjectCode: 'CS 101' },
  isRead: false,
  readAt: null,
  createdAt: '2026-11-26T00:00:00.000Z',
};

const triggers = [
  'subject_edit_request.submitted',
  'subject_edit_request.approved',
  'subject_edit_request.rejected',
  'subject_edit_request.cancelled',
  'subject_edit_request.revoked',
];

function notification(
  overrides: Partial<NotificationItem> = {},
): NotificationItem {
  return { ...base, ...overrides } as NotificationItem;
}

function scheduleNotification(
  overrides: Partial<NotificationItem> = {},
): NotificationItem {
  return notification({
    triggerKey: 'schedule.status_changed',
    entityType: 'schedule',
    entityId: 's1',
    payload: { subjectId: '16', subjectCode: 'CS 101' },
    ...overrides,
  });
}

test('links subject edit request notifications to the subject drawer', () => {
  for (const triggerKey of triggers) {
    const item = notification({ triggerKey });

    assert.equal(
      notificationHref(item, '' as ShellBase),
      '/subjects?request=r1',
    );
    assert.equal(
      notificationHref(item, '/dean' as ShellBase),
      '/dean/subjects?request=r1',
    );
  }
});

test('falls back to the entity id for older subject edit request rows', () => {
  const item = notification({
    triggerKey: 'subject.updated',
    entityType: 'subject_edit_request',
    payload: {},
  });

  assert.equal(notificationHref(item), '/subjects?request=r1');
});

test('uses the key icon for subject edit request notifications', () => {
  for (const triggerKey of triggers) {
    assert.equal(notificationIcon(notification({ triggerKey })), 'key');
  }
});

test('links subject-bearing schedule notifications to the subject drawer', () => {
  for (const triggerKey of [
    'schedule.status_changed',
    'schedule.flagged',
    'schedule.conflict_detected',
    'schedule.unfinalize_approved',
    'schedule.unfinalize_rejected',
  ]) {
    assert.equal(
      notificationHref(scheduleNotification({ triggerKey }), '' as ShellBase),
      '/subjects?subject=16',
    );
    assert.equal(
      notificationHref(
        scheduleNotification({ triggerKey }),
        '/dean' as ShellBase,
      ),
      '/dean/subjects?subject=16',
    );
  }
});

test('uses the subject drawer for the schedule entity fallback', () => {
  const item = notification({
    triggerKey: 'subject.updated',
    entityType: 'schedule',
  });

  assert.equal(notificationHref(item), '/subjects?subject=16');
});

test('keeps timetable fallback for schedule rows without a subject id', () => {
  const item = scheduleNotification({ payload: { subjectCode: 'CS 101' } });

  assert.equal(notificationHref(item), '/timetable?focus=s1');
});

test('keeps approval-required notification destinations unchanged', () => {
  assert.equal(
    notificationHref(
      notification({
        triggerKey: 'schedule.unfinalize_requested',
        entityType: 'schedule_unfinalize_request',
        entityId: 'u1',
      }),
    ),
    '/approvals?request=u1&status=published',
  );
  assert.equal(
    notificationHref(
      notification({
        triggerKey: 'request.submitted',
        entityType: 'faculty_request',
        entityId: 'q1',
      }),
    ),
    '/approvals?request=q1',
  );
});

test('keeps subject edit request links request-focused', () => {
  assert.equal(
    notificationHref(
      notification({
        triggerKey: 'subject_edit_request.submitted',
        entityType: 'subject_edit_request',
        entityId: 'r1',
        payload: { requestId: 'r1', subjectId: '16' },
      }),
    ),
    '/subjects?request=r1',
  );
});
