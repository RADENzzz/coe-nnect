import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('draft snapshot API supports preview, compare, and delete', () => {
  const api = read('apps/frontend/src/api/schedule.api.ts');

  assert.match(api, /export type DraftSnapshotDetail/);
  assert.match(api, /export async function fetchDraftSnapshot/);
  assert.match(api, /draft-snapshots\/\$\{snapshotId\}\/entries/);
  assert.match(api, /export async function deleteDraftSnapshot/);
  assert.match(api, /method: 'DELETE'/);
  assert.match(api, /compareVersionSources[\s\S]*?termId\?: string/);
  assert.match(api, /params\.termId = termId/);
});

test('saved draft preview compare picker and delete dialog are wired', () => {
  const preview = read('apps/frontend/src/features/timetable/components/DraftPreviewModal.tsx');
  const picker = read('apps/frontend/src/features/timetable/components/DraftComparePicker.tsx');
  const remove = read('apps/frontend/src/features/timetable/components/DeleteDraftModal.tsx');
  const drawer = read('apps/frontend/src/features/timetable/components/SavedDraftDrawer.tsx');

  assert.match(preview, /Saved draft preview/);
  assert.match(preview, /fetchDraftSnapshot/);
  assert.match(preview, /versionEntryToEntry/);
  assert.match(preview, /<TimetableGrid/);
  assert.match(preview, /readOnlyEntryIds/);
  assert.match(preview, /No draft or review rows in this saved draft/);
  assert.match(preview, /Compare with live/);
  assert.doesNotMatch(preview, /onEntryClick|onEntryMove|onExternalDrop/);

  assert.match(picker, /Choose a draft to compare/);
  assert.match(picker, /Live timetable/);
  assert.match(picker, /kind: 'draft'/);
  assert.match(picker, /kind: 'live'/);

  assert.match(remove, /Delete saved draft\?/);
  assert.match(remove, /Delete saved draft/);
  assert.match(remove, /Cancel/);
  assert.doesNotMatch(remove, /confirm\(/);

  assert.match(drawer, /View saved rows/);
  assert.match(drawer, /Compare/);
  assert.match(drawer, /Delete/);
  assert.match(drawer, /onPreview/);
  assert.match(drawer, /onCompare/);
  assert.match(drawer, /onDelete/);
  assert.match(drawer, /aria-label="Saved timetable drafts"/);
});

test('compare picker exposes exact accessible names', () => {
  const picker = read(
    'apps/frontend/src/features/timetable/components/DraftComparePicker.tsx',
  );

  assert.match(picker, /aria-label="Live timetable"/);
  assert.match(picker, /aria-label=\{snapshot\.name\}/);
});

test('version compare modal reuses draft labels and global feedback', () => {
  const modal = read(
    'apps/frontend/src/features/timetable/components/VersionCompareModal.tsx',
  );

  assert.match(modal, /termId\?: string \| null/);
  assert.match(modal, /compareVersionSources\(sourceA!, sourceB!, deptId, termId/);
  assert.match(modal, /label \?\? sourceLabel/);
  assert.match(modal, /useFeedback\(\)/);
  assert.match(modal, /feedback\.failed/);
  assert.doesNotMatch(modal, /Failed to load comparison/);
});

test('timetable page wires draft preview compare and delete', () => {
  const page = read('apps/frontend/src/features/timetable/TimetablePage.tsx');

  assert.match(page, /handlePreviewDraft/);
  assert.match(page, /handleOpenDraftCompare/);
  assert.match(page, /handlePickDraftCompare/);
  assert.match(page, /handleOpenDeleteDraft/);
  assert.match(page, /handleDeleteDraft/);
  assert.match(page, /deleteDraftSnapshot\(/);
  assert.match(page, /<DraftPreviewModal/);
  assert.match(page, /<DraftComparePicker/);
  assert.match(page, /<DeleteDraftModal/);
  assert.match(page, /termId=\{compareTermId \?\? undefined\}/);
  assert.match(page, /\['term-draft-snapshots', activeTerm\.termId, myDeptId\]/);
  assert.doesNotMatch(page, /alert\(|confirm\(|prompt\(/);
});

test('draft deletion separates refresh failures from delete failures', () => {
  const page = read('apps/frontend/src/features/timetable/TimetablePage.tsx');
  const start = page.indexOf(
    'const handleDeleteDraft = useCallback(async () => {',
  );
  assert.ok(start >= 0, 'handleDeleteDraft must exist');

  const depsStart = page.indexOf('\n  }, [', start);
  assert.ok(depsStart >= 0, 'handleDeleteDraft dependency list must exist');
  const handler = page.slice(start, depsStart);
  const deps = page.slice(depsStart, page.indexOf(']);', depsStart));

  assert.match(
    handler,
    /deleted, but the .*draft list could not be refreshed/,
    'refresh failure must be reported separately from delete failure',
  );
  assert.match(handler, /feedback\.success/);
  assert.match(handler, /compareDraft\?\.snapshotId === snapshot\.snapshotId/);
  assert.match(handler, /setComparePickerOpen\(false\)/);
  assert.match(deps, /compareDraft/);
});
