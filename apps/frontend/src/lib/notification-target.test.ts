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

test('publish request notifications use the publishRequest param', () => {
  for (const shell of ['', '/dean'] as ShellBase[]) {
    assert.equal(
      notificationHref(
        scheduleNotification({
          triggerKey: 'schedule.publish_requested',
          entityType: 'schedule_publish_request',
          entityId: 'p1',
        }),
        shell,
      ),
      `${shell}/approvals?publishRequest=p1`,
    );
  }
});

test('publish request entity fallback uses the publishRequest param', () => {
  for (const shell of ['', '/dean'] as ShellBase[]) {
    assert.equal(
      notificationHref(
        notification({
          triggerKey: 'subject.updated',
          entityType: 'schedule_publish_request',
          entityId: 'p1',
        }),
        shell,
      ),
      `${shell}/approvals?publishRequest=p1`,
    );
  }
});

test('publish outcomes link to the timetable even with a subjectId', () => {
  for (const triggerKey of [
    'schedule.publish_approved',
    'schedule.publish_rejected',
  ]) {
    assert.equal(
      notificationHref(scheduleNotification({ triggerKey, entityId: 's1' }), ''),
      '/timetable?focus=s1',
    );
  }
});

test('publishRequest and request deep links stay independent', () => {
  assert.equal(
    notificationHref(
      notification({
        triggerKey: 'schedule.publish_requested',
        entityType: 'schedule_publish_request',
        entityId: '5',
      }),
      '',
    ),
    '/approvals?publishRequest=5',
  );
  assert.equal(
    notificationHref(
      notification({
        triggerKey: 'schedule.unfinalize_requested',
        entityType: 'schedule_unfinalize_request',
        entityId: '5',
      }),
      '',
    ),
    '/approvals?request=5&status=published',
  );
});

test('uses distinct non-empty icons for publish notifications', () => {
  const icons = [
    notificationIcon(
      notification({ triggerKey: 'schedule.publish_requested' }),
    ),
    notificationIcon(
      notification({ triggerKey: 'schedule.publish_approved' }),
    ),
    notificationIcon(
      notification({ triggerKey: 'schedule.publish_rejected' }),
    ),
  ];

  assert.deepEqual(icons, ['pending_actions', 'task_alt', 'cancel']);
  assert.ok(icons.every((icon) => icon.length > 0));
  assert.equal(new Set(icons).size, icons.length);
});

test('change request notifications use the changeRequest param', () => {
  for (const shell of ['', '/dean'] as ShellBase[]) {
    assert.equal(
      notificationHref(
        notification({
          triggerKey: 'schedule.change_requested',
          entityType: 'schedule_change_request',
          entityId: 'c1',
          payload: {},
        }),
        shell,
      ),
      `${shell}/approvals?changeRequest=c1`,
    );
  }
});

test('change request outcomes link to the timetable even with a subjectId', () => {
  for (const triggerKey of [
    'schedule.change_approved',
    'schedule.change_rejected',
  ]) {
    for (const shell of ['', '/dean'] as ShellBase[]) {
      assert.equal(
        notificationHref(
          scheduleNotification({ triggerKey, entityId: 's1' }),
          shell,
        ),
        `${shell}/timetable?focus=s1`,
      );
    }
  }
});

test('change request entity fallback uses the changeRequest param', () => {
  for (const shell of ['', '/dean'] as ShellBase[]) {
    assert.equal(
      notificationHref(
        notification({
          triggerKey: 'subject.updated',
          entityType: 'schedule_change_request',
          entityId: 'c1',
          payload: {},
        }),
        shell,
      ),
      `${shell}/approvals?changeRequest=c1`,
    );
  }
});

test('changeRequest, request, and publishRequest deep links stay independent', () => {
  assert.equal(
    notificationHref(
      notification({
        triggerKey: 'schedule.change_requested',
        entityType: 'schedule_change_request',
        entityId: 'c1',
      }),
    ),
    '/approvals?changeRequest=c1',
  );
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
        triggerKey: 'schedule.publish_requested',
        entityType: 'schedule_publish_request',
        entityId: 'p1',
      }),
    ),
    '/approvals?publishRequest=p1',
  );
});

test('uses distinct non-empty icons for change request notifications', () => {
  const icons = [
    notificationIcon(
      notification({ triggerKey: 'schedule.change_requested' }),
    ),
    notificationIcon(
      notification({ triggerKey: 'schedule.change_approved' }),
    ),
    notificationIcon(
      notification({ triggerKey: 'schedule.change_rejected' }),
    ),
  ];

  assert.deepEqual(icons, ['pending_actions', 'task_alt', 'cancel']);
  assert.ok(icons.every((icon) => icon.length > 0));
  assert.equal(new Set(icons).size, icons.length);
});
