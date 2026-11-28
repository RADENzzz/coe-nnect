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
