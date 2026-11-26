import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

const panel = read(
  'apps/frontend/src/features/subjects/components/SubjectDetailPanel.tsx',
);
const page = read('apps/frontend/src/features/subjects/SubjectsPage.tsx');

test('detail drawer renders edit-access status and request actions', () => {
  assert.match(panel, /Edit access/);
  assert.match(panel, /Request edit/);
  assert.match(panel, /Cancel request/);
  assert.match(panel, /Approve/);
  assert.match(panel, /Reject/);
  assert.match(panel, /Revoke/);
  assert.match(panel, /Shared subject/);

  const start = panel.indexOf('<InfoSection title="Edit access"');
  assert.ok(start > 0, 'Edit access section must be in the Details tab');
  const section = panel.slice(
    start,
    panel.indexOf('</InfoSection>', start) + '</InfoSection>'.length,
  );
  assert.match(section, /Shared subject — all departments may edit/);
  assert.match(section, /editRequest\?\.status === 'pending' && canRespond/);
  assert.match(section, /editRequest\?\.status === 'pending' && canCancel/);
  assert.match(section, /editRequest\?\.status === 'approved' && canRespond/);
  assert.match(section, /!editRequest && isForeign/);
  assert.match(section, /editRequest\.reason/);
  assert.match(section, /editRequest\.responseRemarks/);

  // Permission flags alone must never surface actions; the request gates them.
  assert.match(panel, /const requestPending = editRequest\?\.status === 'pending'/);
  assert.match(panel, /disabled={requestPending}/);
  assert.match(
    panel,
    /\[subject\?\.subjectId, editRequest\?\.requestId, editRequest\?\.status\]/,
  );
});

test('page mutations emit exact feedback and invalidate the request caches', () => {
  assert.match(page, /feedback\.success\('Edit access requested\.'\)/);
  assert.match(page, /feedback\.failed\(extractApiError\(err/);
  assert.match(page, /invalidateQueries\(\{ queryKey: \['subject-edit-requests'\] \}\)/);
  assert.match(page, /invalidateQueries\(\{ queryKey: \['subjects'\] \}\)/);

  for (const message of [
    'Edit access requested.',
    'Edit request cancelled.',
    'Edit request approved.',
    'Edit request rejected.',
    'Edit access revoked.',
  ]) {
    assert.ok(page.includes(`feedback.success('${message}')`), message);
  }

  assert.ok(
    page.includes(
      "qc.invalidateQueries({ queryKey: ['subject-edit-request', subjectId] })",
    ),
  );
  assert.match(page, /createSubjectEditRequest\(subjectId, reason\)/);
  assert.match(page, /cancelSubjectEditRequest\(requestId\)/);
  assert.match(page, /respondToSubjectEditRequest\(requestId, action, remarks\)/);
  assert.equal((page.match(/feedback\.failed\(extractApiError\(err,/g) ?? []).length, 3);
});

test('detail drawer awaits async request actions and blocks duplicate submissions', () => {
  assert.match(panel, /onRequestEdit: \(reason: string\) => Promise<boolean>/);
  assert.match(panel, /onCancelRequest: \(\) => Promise<boolean>/);
  assert.match(
    panel,
    /onRespond: \(action: SubjectEditAction, remarks: string\) => Promise<boolean>/,
  );
  assert.match(panel, /requestActionPending\?: boolean/);
  assert.match(panel, /cancelActionPending\?: boolean/);
  assert.match(panel, /respondActionPending\?: boolean/);

  const handlers = panel.slice(
    panel.indexOf('const submitRequestReason'),
    panel.indexOf('const copyCode'),
  );
  assert.match(handlers, /const ok = await onRequestEdit\(reason\);/);
  assert.match(handlers, /if \(ok\) setReasonOpen\(false\);/);
  assert.match(handlers, /const ok = await onRespond\(remarksAction, value\);/);
  assert.match(handlers, /if \(ok\) setRemarksOpen\(false\);/);
  assert.match(handlers, /await onCancelRequest\(\);/);
  assert.match(handlers, /await onRespond\('revoke', ''\);/);
  assert.match(
    handlers,
    /if \(!reason \|\| reasonSubmitting \|\| requestActionPending\) return;/,
  );
  assert.match(handlers, /if \(remarksSubmitting \|\| respondActionPending\) return;/);
  assert.match(
    handlers,
    /if \(directAction !== null \|\| cancelActionPending\) return;/,
  );
  assert.match(
    handlers,
    /if \(directAction !== null \|\| respondActionPending\) return;/,
  );

  assert.ok(
    panel.includes('disabled={cancelActionPending || directAction !== null}'),
  );
  assert.ok(
    panel.includes('disabled={respondActionPending || directAction !== null}'),
  );
  assert.ok(panel.includes('busy={reasonSubmitting || requestActionPending}'));
  assert.ok(panel.includes('busy={remarksSubmitting || respondActionPending}'));
  assert.ok(
    panel.includes(
      'disabled={!requestReason.trim() || reasonSubmitting || requestActionPending}',
    ),
  );
  assert.ok(
    panel.includes(
      "disabled={(remarksAction === 'reject' && !remarks.trim()) || remarksSubmitting || respondActionPending}",
    ),
  );

  const reset = panel.slice(
    panel.indexOf('// A different subject or a different request'),
    panel.indexOf('const requestPending'),
  );
  assert.match(reset, /setReasonSubmitting\(false\)/);
  assert.match(reset, /setRemarksSubmitting\(false\)/);
  assert.match(reset, /setDirectAction\(null\)/);
});

test('page handlers return success booleans and expose per-action pending state', () => {
  assert.match(
    page,
    /const handleRequestEdit = async \(reason: string\): Promise<boolean> => \{/,
  );
  assert.match(
    page,
    /const handleCancelEditRequest = async \(\): Promise<boolean> => \{/,
  );
  assert.ok(page.includes('const handleRespondEditRequest = async ('));
  assert.equal((page.match(/Promise<boolean> => \{/g) ?? []).length, 3);

  assert.match(page, /await requestEditMutation\.mutateAsync\(/);
  assert.match(page, /await cancelEditRequestMutation\.mutateAsync\(/);
  assert.match(page, /await respondEditRequestMutation\.mutateAsync\(/);
  const handlers = page.slice(
    page.indexOf('const handleRequestEdit'),
    page.indexOf('// ── Deep-link'),
  );
  assert.equal((handlers.match(/return false;/g) ?? []).length, 6);
  assert.doesNotMatch(handlers, /\.mutate\(/);

  assert.match(page, /const requestActionPending =/);
  assert.match(page, /const cancelActionPending =/);
  assert.match(page, /const respondActionPending =/);
  assert.ok(page.includes('requestActionPending={requestActionPending}'));
  assert.ok(page.includes('cancelActionPending={cancelActionPending}'));
  assert.ok(page.includes('respondActionPending={respondActionPending}'));
  assert.equal((page.match(/feedback\.failed\(extractApiError\(err,/g) ?? []).length, 3);
});
