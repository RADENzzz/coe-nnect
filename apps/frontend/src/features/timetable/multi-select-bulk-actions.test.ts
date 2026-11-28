import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getBulkActionEligibleIds } from './utils/bulk-actions.util.ts';

const read = (path: string) =>
  readFileSync(new URL('../../../../../' + path, import.meta.url), 'utf8');

const entry = (id: string, status?: 'draft' | 'review' | 'finalized' | 'published') =>
  ({ id, status }) as never;

const selected = new Set(['d', 'r', 'f', 'p']);

test('bulk actions only return rows whose status allows the action', () => {
  const entries = [
    entry('d', 'draft'),
    entry('r', 'review'),
    entry('f', 'finalized'),
    entry('p', 'published'),
  ];

  assert.deepEqual(getBulkActionEligibleIds('delete', entries, selected), ['d', 'r']);
  assert.deepEqual(getBulkActionEligibleIds('review', entries, selected), ['d']);
  assert.deepEqual(getBulkActionEligibleIds('finalize', entries, selected), ['d', 'r']);
  assert.deepEqual(getBulkActionEligibleIds('request-publish', entries, selected), ['f']);
});

test('frontend test script registers the bulk-actions test file', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  ) as { scripts: { test: string } };

  assert.match(
    packageJson.scripts.test,
    /(?:^|\s)src\/features\/timetable\/multi-select-bulk-actions\.test\.ts(?:\s|$)/,
  );
});

const hook = read('apps/frontend/src/features/timetable/hooks/useBulkScheduleActions.ts');

test('bulk hook fans out through existing single-row APIs only', () => {
  assert.match(hook, /Promise\.allSettled\(/);
  assert.match(hook, /deleteSchedule\(id\)/);
  assert.match(hook, /updateScheduleStatus\(id, 'review'\)/);
  assert.match(hook, /updateScheduleStatus\(id, 'finalized'\)/);
  assert.match(hook, /createPublishRequest\(id, note\)/);
  assert.match(hook, /clearAutoDrafts\(termId, deptId\)/);
  assert.doesNotMatch(hook, /alert\(|confirm\(|prompt\(|setSearchParams|navigate\(/);
});

test('bulk hook refreshes dependent queries and reports partial failures globally', () => {
  for (const key of [
    'schedules',
    'faculty-requests',
    'flagged',
    'unplotted-minors',
    'schedule-versions',
    'coverage',
    'schedule-unfinalize-requests',
    'schedule-publish-requests',
    'schedule-change-requests',
  ]) {
    assert.match(hook, new RegExp(`\\['${key}'\\]`));
  }
  assert.match(hook, /feedback\.error\(/);
  assert.match(hook, /feedback\.success\(/);
  assert.match(hook, /feedback\.failed\(/);
  assert.match(hook, /onSucceeded\(succeededIds\)/);
});

const bar = read('apps/frontend/src/features/timetable/components/BulkActionBar.tsx');
const modal = read('apps/frontend/src/features/timetable/components/BulkActionConfirmModal.tsx');

test('bulk bar exposes selected-row actions and no IDP action', () => {
  for (const label of ['Delete', 'Review', 'Finalize', 'Request publish', 'Clear selection']) {
    assert.ok(bar.includes(label));
  }
  assert.doesNotMatch(bar, /Send to IDP/);
  assert.match(bar, /above-bottom-nav/);
});

test('bulk confirmation modal uses the shared Modal and supports one publish note', () => {
  assert.match(modal, /from '..\/..\/..\/components\/ui\/Modal'/);
  assert.match(modal, /action === 'request-publish'/);
  assert.match(modal, /onNoteChange/);
  assert.match(modal, /auto-generated draft/i);
  assert.doesNotMatch(modal, /alert\(|confirm\(|prompt\(/);
});

const classBlock = read('apps/frontend/src/features/timetable/components/ClassBlock.tsx');
const agendaCard = read('apps/frontend/src/features/timetable/views/AgendaClassCard.tsx');
const grid = read('apps/frontend/src/features/timetable/components/TimetableGrid.tsx');
const agenda = read('apps/frontend/src/features/timetable/views/AgendaView.tsx');

test('row checkboxes do not open the drawer or start a drag', () => {
  for (const source of [classBlock, agendaCard]) {
    assert.match(source, /type="checkbox"/);
    assert.match(source, /onToggleSelect\?\.\(entry\)/);
    assert.match(source, /stopPropagation\(\)/);
    assert.match(source, /onPointerDown/);
  }
});

test('grid and agenda forward selection props to row cards', () => {
  for (const source of [grid, agenda]) {
    assert.match(source, /selectableEntryIds/);
    assert.match(source, /selectedEntryIds/);
    assert.match(source, /onToggleSelect/);
  }
});

const page = read('apps/frontend/src/features/timetable/TimetablePage.tsx');

test('timetable page owns selection and keeps deep links untouched during bulk actions', () => {
  assert.match(page, /const \[selectedScheduleIds, setSelectedScheduleIds\] = useState<Set<string>>\(new Set<string>\(\)\)/);
  assert.match(page, /useBulkScheduleActions\(/);
  assert.match(page, /<BulkActionBar/);
  assert.match(page, /<BulkActionConfirmModal/);
  assert.match(page, /Clear auto-drafts/);
  assert.doesNotMatch(page, /bulk[A-Za-z]*\([^)]*setSearchParams/);
  assert.doesNotMatch(page, /bulk[A-Za-z]*\([^)]*navigate\(/);
});
