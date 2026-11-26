import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('subject edit-request API and editable-state derivation are wired', () => {
  const api = read('apps/frontend/src/api/subject-edit-requests.api.ts');
  const page = read('apps/frontend/src/features/subjects/SubjectsPage.tsx');
  const panel = read(
    'apps/frontend/src/features/subjects/components/SubjectDetailPanel.tsx',
  );

  assert.match(api, /fetchSubjectEditRequests/);
  assert.match(api, /\/v1\/subjects\/edit-requests/);
  assert.match(api, /fetchSubjectEditRequestForSubject/);
  assert.match(api, /createSubjectEditRequest/);
  assert.match(api, /respondToSubjectEditRequest/);
  assert.match(api, /cancelSubjectEditRequest/);
  assert.match(api, /SubjectEditAction/);
  assert.match(api, /api\.get/);
  assert.match(api, /api\.post/);
  assert.match(api, /api\.patch/);
  assert.match(api, /api\.delete/);
  assert.match(api, /return data\.data/);

  const isForeign = page.slice(
    page.indexOf('const isForeign'),
    page.indexOf('// ── Detail panel'),
  );
  assert.match(isForeign, /s\.isMinor/);
  assert.match(isForeign, /approvedSubjectIds/);
  assert.match(page, /owningDeptId/);
  assert.match(page, /requestingDeptId/);
  assert.doesNotMatch(page, /next\.set\('dept'/);
  assert.match(page, /\['subject-edit-requests', \{ status: 'approved' \}\]/);
  assert.match(page, /\['subject-edit-request', detailEntry\?\.subjectId\]/);
  assert.match(page, /canRespond/);
  assert.match(page, /canCancel/);

  assert.match(panel, /editRequest: SubjectEditRequest \| null/);
  assert.match(panel, /canRespond: boolean/);
  assert.match(panel, /canCancel: boolean/);
  assert.match(panel, /onRequestEdit: \(reason: string\) => Promise<boolean>/);
  assert.match(panel, /onCancelRequest: \(\) => Promise<boolean>/);
  assert.match(
    panel,
    /onRespond: \(action: SubjectEditAction, remarks: string\) => Promise<boolean>/,
  );
});

test('permission-sensitive edit-request queries bypass the global stale cache', () => {
  const page = read('apps/frontend/src/features/subjects/SubjectsPage.tsx');

  const grants = page.slice(
    page.indexOf("queryKey: ['subject-edit-requests', { status: 'approved' }]"),
    page.indexOf('const approvedSubjectIds'),
  );
  assert.match(grants, /staleTime: 0/);
  assert.match(grants, /refetchOnWindowFocus: true/);

  const detail = page.slice(
    page.indexOf("queryKey: ['subject-edit-request', detailEntry?.subjectId]"),
    page.indexOf('// ── Keyboard'),
  );
  assert.match(detail, /staleTime: 0/);
  assert.match(detail, /refetchOnWindowFocus: true/);
});

test('current owner can respond to a stale pending request from the live subject', () => {
  const page = read('apps/frontend/src/features/subjects/SubjectsPage.tsx');

  assert.ok(
    page.indexOf('const detailLive') < page.indexOf('const canRespond'),
    'canRespond must be derived from the live subject',
  );
  const respond = page.slice(
    page.indexOf('const canRespond ='),
    page.indexOf('const canCancel ='),
  );
  assert.match(respond, /detailLive/);
  assert.match(respond, /isActive/);
  assert.match(respond, /deptId/);
  assert.match(respond, /stale/i);
});
