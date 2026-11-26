import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL('../../../../../' + path, import.meta.url), 'utf8');

test('full term page is routed, prefetched, and shared with compact mode', () => {
  const app = read('apps/frontend/src/App.tsx');
  const prefetch = read('apps/frontend/src/lib/route-prefetch.ts');
  const page = read(
    'apps/frontend/src/features/system-config/TermManagementPage.tsx',
  );
  const notification = read('apps/frontend/src/lib/notification-target.ts');
  const search = read('apps/backend/src/modules/search/search.service.ts');
  const dashboard = read(
    'apps/frontend/src/features/dean/DeanDashboardPage.tsx',
  );

  // Contract checks from the task brief.
  assert.match(app, /path="system-settings\/terms"/);
  assert.match(prefetch, /'\/dean\/system-settings\/terms'/);
  assert.match(page, /System Settings \/ Term Management/);
  assert.match(page, /mode="full"/);
  assert.match(notification, /\/system-settings\/terms.*\?termId/);
  assert.match(search, /\/dean\/system-settings\/terms\?termId=/);
  assert.match(dashboard, /\/dean\/system-settings\/terms/);
  assert.match(dashboard, /canWriteTerms\(profile\)/);

  // The full page reuses the shared section and the shared write gate; it
  // neither forks term rows/dialogs nor duplicates System Settings panels.
  assert.match(page, /import TermManagementSection/);
  assert.match(page, /import \{ canWriteTerms \}/);
  assert.match(page, /canWriteTerms\(profile\)/);
  assert.match(page, /<TermManagementSection canWrite=\{canWrite\} mode="full" \/>/);
  assert.doesNotMatch(page, /SemesterTypesPanel/);
  assert.match(page, /to="\/dean\/system-settings"/);
  assert.doesNotMatch(page, /window\.alert|window\.confirm|window\.prompt/);

  // The old dashboard shortcut stays compatible; the new one is gated.
  assert.match(dashboard, /to="\/dean\/system-settings\/terms\?newTerm=1"/);
  assert.doesNotMatch(dashboard, /to="\/dean\/system-settings\?newTerm=1"/);
});
