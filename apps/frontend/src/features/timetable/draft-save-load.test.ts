import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('draft snapshot API client is wired', () => {
  const api = read('apps/frontend/src/api/schedule.api.ts');

  assert.match(api, /export type DraftSnapshotEntry/);
  assert.match(api, /status: 'draft' \| 'review'/);
  assert.match(api, /export async function fetchDraftSnapshots/);
  assert.match(api, /\/v1\/schedules\/draft-snapshots'/);
  assert.match(api, /export async function saveDraftSnapshot/);
  assert.match(api, /export async function preflightDraftSnapshot/);
  assert.match(api, /draft-snapshots\/\$\{snapshotId\}\/preflight/);
  assert.match(api, /export async function applyDraftSnapshot/);
  assert.match(api, /draft-snapshots\/\$\{snapshotId\}\/load/);
  assert.match(api, /confirmed: true/);
});

test('save as draft flow is wired', () => {
  const page = read('apps/frontend/src/features/timetable/TimetablePage.tsx');
  const dialog = read(
    'apps/frontend/src/features/timetable/components/SaveDraftDialog.tsx',
  );

  assert.match(page, /key: 'save-draft'/);
  assert.match(page, /label: 'Save as draft…'/);
  assert.match(page, /handleOpenSaveDraft/);
  assert.match(page, /handleSaveDraft/);
  assert.match(page, /saveDraftSnapshot\(/);
  assert.match(page, /feedback\.success\(/);
  assert.match(page, /feedback\.error\(/);
  assert.match(
    page,
    /\['term-draft-snapshots', activeTerm\.termId, myDeptId\]/,
  );
  assert.doesNotMatch(page, /alert\(|confirm\(|prompt\(/);
  assert.match(dialog, /<Modal/);
  assert.match(dialog, /Save timetable draft/);
  assert.match(dialog, /Draft name/);
  assert.match(dialog, /entryCount/);
  assert.match(page, /dataTour: 'tt-focus'/);
});

test('load drafts flow is wired', () => {
  const page = read('apps/frontend/src/features/timetable/TimetablePage.tsx');
  const drawer = read(
    'apps/frontend/src/features/timetable/components/SavedDraftDrawer.tsx',
  );
  const summary = read(
    'apps/frontend/src/features/timetable/components/DraftLoadSummaryModal.tsx',
  );

  assert.match(page, /key: 'load-draft'/);
  assert.match(page, /label: 'Load drafts…'/);
  assert.match(page, /handleOpenDrafts/);
  assert.match(page, /handlePreflightDraft/);
  assert.match(page, /handleApplyDraft/);
  assert.match(page, /preflightDraftSnapshot\(/);
  assert.match(page, /applyDraftSnapshot\(/);
  assert.match(page, /\['schedules', activeTerm\.termId\]/);
  assert.match(page, /\['unscheduled', activeTerm\.termId, myDeptId\]/);
  assert.match(page, /\['faculty-requests'\]/);
  assert.match(
    page,
    /\['term-draft-snapshots', activeTerm\.termId, myDeptId\]/,
  );
  assert.match(drawer, /role="dialog"/);
  assert.match(drawer, /aria-label="Saved timetable drafts"/);
  assert.match(drawer, /schoolYear/);
  assert.match(drawer, /semester/);
  assert.match(summary, /conflicts\.length/);
  assert.match(summary, /result\.summary/);
  assert.match(summary, /Load this draft/);
  assert.match(
    summary,
    /disabled=\{busy \|\| !result \|\| result\.failed \|\| result\.conflicts\.length > 0\}/,
  );
  assert.doesNotMatch(page + drawer + summary, /alert\(|confirm\(|prompt\(/);
});
