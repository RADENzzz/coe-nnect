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
