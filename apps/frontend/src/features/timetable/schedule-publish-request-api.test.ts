import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('publish request API client is wired to the schedule publish routes', () => {
  const source = read('apps/frontend/src/api/schedule-publish-request.api.ts');

  assert.match(source, /api\.get\('\/v1\/schedules\/publish-requests', \{ params \}\)/);
  assert.match(source, /api\.patch\(`\/v1\/schedules\/publish-requests\/\$\{requestId\}`/);
  assert.match(source, /api\.get\(`\/v1\/schedules\/\$\{scheduleId\}\/publish-request`\)/);
  assert.match(source, /api\.post\(`\/v1\/schedules\/\$\{scheduleId\}\/publish-request`/);
  assert.match(source, /return data\.data/);
  assert.doesNotMatch(source, /alert\(|confirm\(|prompt\(|toast/);
});
