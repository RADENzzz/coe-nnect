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
