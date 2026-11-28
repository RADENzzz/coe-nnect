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
