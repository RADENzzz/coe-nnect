import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');

test('published version API client is wired to archive, compare, reuse, and summary routes', () => {
  const api = read('apps/frontend/src/api/schedule.api.ts');
  const termsApi = read('apps/frontend/src/api/terms.api.ts');

  assert.match(
    api,
    /export type VersionSource = \{ kind: 'published' \| 'history' \| 'live'; id: string \}/,
  );
  assert.match(api, /fetchPublishedVersions[\s\S]*?\/v1\/schedules\/published-versions/);
  assert.match(api, /compareVersionSources[\s\S]*?\/v1\/schedules\/version-compare/);
  assert.match(api, /preflightReuse[\s\S]*?\/preflight/);
  assert.match(api, /applyReuse[\s\S]*?method: 'POST'/);
  assert.match(api, /entriesA:\s*ScheduleVersionEntry\[\]/);
  assert.match(api, /entriesB:\s*ScheduleVersionEntry\[\]/);
  assert.match(api, /compareVersionSources[\s\S]*?deptId[\s\S]*?params:/);
  assert.match(api, /fetchVersion\(\s*versionId: string,[\s\S]*?deptId\?: string/);
  assert.match(api, /fetchPublishedVersion\(\s*versionId: string,[\s\S]*?deptId\?: string/);
  assert.match(termsApi, /fetchTermLifecycleSummary[\s\S]*?-summary/);
  assert.match(
    termsApi,
    /action === 'deactivate'[\s\S]*?\/v1\/terms\/\$\{id\}\/deactivation-summary[\s\S]*?\/v1\/terms\/\$\{id\}\/activation-summary/,
  );
  assert.doesNotMatch(termsApi, /\$\{action\}-summary/);
  assert.doesNotMatch(api + termsApi, /window\.alert|window\.confirm|window\.prompt/);
});

test('reuse requests carry only backend-declared fields', () => {
  const api = read('apps/frontend/src/api/schedule.api.ts');
  const preflightStart = api.indexOf('export async function preflightReuse');
  const applyStart = api.indexOf('export async function applyReuse');
  const preflight = api.slice(preflightStart, applyStart);
  const apply = api.slice(applyStart);

  assert.match(preflight, /termId/);
  assert.match(preflight, /deptId/);
  assert.doesNotMatch(preflight, /\bstatus\s*:/);
  assert.match(apply, /confirmed: true/);
  assert.doesNotMatch(apply, /\bstatus\s*:/);
});
