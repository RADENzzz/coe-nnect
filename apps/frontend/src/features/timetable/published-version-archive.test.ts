import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('published archive drawer, source compare modal, and page handlers are wired', () => {
  const drawer = read(
    'apps/frontend/src/features/timetable/components/VersionHistoryDrawer.tsx',
  );
  const modal = read(
    'apps/frontend/src/features/timetable/components/VersionCompareModal.tsx',
  );
  const page = read('apps/frontend/src/features/timetable/TimetablePage.tsx');

  // Required source contracts.
  assert.match(drawer, /fetchPublishedVersions/);
  assert.match(drawer, /\['published-versions', semester\]/);
  assert.match(drawer, /groupBySchoolYear|schoolYear/);
  assert.match(drawer, /version\.stale/);
  assert.match(drawer, /onReuse/);
  assert.match(modal, /sourceA: VersionSource \| null/);
  assert.match(modal, /sourceB: VersionSource \| null/);
  assert.match(page, /onReuse=/);
  assert.doesNotMatch(drawer + modal + page, /alert\(|confirm\(|prompt\(/);

  // Stronger wiring assertions consistent with the archive brief.
  assert.match(drawer, /PublishedVersionSummary/);
  assert.match(drawer, /version\.locked/);
  // Stale versions stay reusable even though the backend marks them locked;
  // only deactivated, non-stale source terms are blocked from reuse.
  assert.match(drawer, /!version\.locked \|\| version\.stale/);
  assert.match(drawer, /Reactivate the source term before reusing/);
  assert.doesNotMatch(drawer, /Unlock the term before reusing/);
  assert.match(drawer, /canReuse/);
  assert.match(drawer, /history/);
  assert.match(drawer, /Compare/);
  assert.match(modal, /compareVersionSources/);
  assert.match(modal, /data\.added/);
  assert.match(modal, /data\.removed/);
  assert.match(modal, /data\.moved/);
  assert.match(modal, /data\.unchanged/);
  assert.match(page, /handleReuse/);
  assert.match(page, /kind: 'published'/);
  assert.match(page, /kind: 'history'/);
  assert.match(page, /kind: 'live'/);
  assert.match(page, /sourceA=/);
  assert.match(page, /sourceB=/);
  assert.match(page, /useFeedback\(\)/);

  // Department-scoped visual compare contracts.
  assert.match(modal, /departments: Department\[\]/);
  assert.match(modal, /scopeDeptId: string/);
  assert.match(modal, /data\.entriesA/);
  assert.match(modal, /data\.entriesB/);
  assert.equal((modal.match(/<TimetableGrid/g) ?? []).length, 2);
  assert.match(modal, /diffToneByEntryId/);
  assert.match(modal, /compareVersionSources\(sourceA!, sourceB!, deptId/);
  assert.match(modal, /'published-version-compare'[\s\S]*?deptId/);
  assert.match(modal, /Department:|All departments/);
  assert.match(modal, /Changes/);
  assert.match(drawer, /scopeDeptId/);
  assert.match(page, /scopeDeptId=/);
  assert.match(page, /departments=/);
});
