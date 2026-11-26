import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('change request API client is wired to the schedule change routes', () => {
  const source = read('apps/frontend/src/api/schedule-change-request.api.ts');

  assert.match(source, /export type ChangeRequestStatus/);
  assert.match(source, /reason: string/);
  assert.match(source, /'\/v1\/schedules\/change-requests'/);
  assert.match(source, /\/v1\/schedules\/\$\{scheduleId\}\/change-request/);
  assert.match(source, /\/v1\/schedules\/change-requests\/\$\{requestId\}/);
  assert.match(source, /export function changeRequestLabel/);
  assert.match(source, /export function changeRequesterName/);
  assert.match(source, /return data\.data/);
  assert.doesNotMatch(source, /alert\(|confirm\(|prompt\(|toast/);
});
