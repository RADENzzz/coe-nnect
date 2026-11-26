import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');

const page = read('apps/frontend/src/features/prospectus/ProspectusPage.tsx');
const panel = read(
  'apps/frontend/src/features/prospectus/components/ProspectusDetailPanel.tsx',
);

test('prospectus page renders one Sessions/wk column after Units', () => {
  assert.match(page, /formatSessionsPerWeek\(e\)/);

  const unitsAt = page.indexOf("key: 'units'");
  const sessionsAt = page.indexOf("key: 'sessionsPerWeek'");
  const typeAt = page.indexOf("key: 'type'");

  assert.ok(unitsAt >= 0 && sessionsAt > unitsAt && typeAt > sessionsAt);
  assert.match(page, /header: 'Sessions\/wk'/);
  assert.match(page, /cardVariant: 'mono'/);
});

test('prospectus page owns the two-field save mutation', () => {
  const start = page.indexOf('const updateSessionsMutation');
  const end = page.indexOf('// ── Bulk action');
  assert.ok(start >= 0 && end > start);
  const mutation = page.slice(start, end);

  assert.match(mutation, /updateProspectus\(id, patch\)/);
  assert.match(
    mutation,
    /feedback\.success\('Sessions per week updated\.'\)/,
  );
  assert.match(
    mutation,
    /feedback\.error\(\s*extractApiError\(err, 'Failed to update sessions per week'\),?\s*\)/,
  );
  assert.match(mutation, /invalidateAfterProspectusChange\(\)/);
  assert.match(page, /mutateAsync\(\{ id, patch \}\)/);
  assert.match(page, /onSaveSessions=/);
});

test('detail panel edits a local draft and never calls the API', () => {
  assert.match(panel, /onSaveSessions\?:/);
  assert.match(panel, /SESSION_LIMITS/);
  assert.match(panel, /useState<SessionsPerWeekPatch>/);
  assert.match(
    panel,
    /entry\.prospectusId,\s*entry\.lectureSessionsPerWeek,\s*entry\.labSessionsPerWeek/,
  );
  assert.match(panel, /buildSessionsPerWeekPatch\(draft\)/);
  assert.match(panel, /await onSaveSessions\(entry\.prospectusId/);
  assert.match(panel, /disabled=\{!dirty \|\| saving \|\| !onSaveSessions\}/);
  assert.match(panel, /Save changes/);
  assert.match(panel, /\{canWrite && \(/);
  assert.match(panel, /disabled=\{!canWrite/);
  assert.doesNotMatch(panel, /updateProspectus\(/);
});
