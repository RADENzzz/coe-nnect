import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  countSelectedStatuses,
  getBulkActionEligibleIds,
} from './utils/bulk-actions.util.ts';
import {
  getSelectableScheduleIds,
  normalizeEntryStatus,
} from './utils/selection.util.ts';

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
  assert.deepEqual(
    getBulkActionEligibleIds('request-unfinalize', entries, selected),
    ['p'],
  );
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

test('the fixed manual plotting notice is gone', () => {
  assert.doesNotMatch(page, /need manual plotting/);
  assert.doesNotMatch(page, /Plot manually →/);
  assert.doesNotMatch(page, /fetchUnscheduled\(activeTerm!\.termId, myDeptId \|\| undefined\)/);
});

test('new bulk actions use the existing single-row status rules', () => {
  const entries = [
    entry('d', 'draft'),
    entry('r', 'review'),
    entry('f', 'finalized'),
    entry('p', 'published'),
    entry('unselected', 'finalized'),
  ];

  assert.deepEqual(
    getBulkActionEligibleIds('cancel-finalization', entries, selected),
    ['f'],
  );
  assert.deepEqual(
    getBulkActionEligibleIds('request-change', entries, selected),
    ['r', 'f'],
  );
});

test('status counts include selected draft, review, finalized, and published rows', () => {
  const entries = [
    entry('d', 'draft'),
    entry('r', 'review'),
    entry('f', 'finalized'),
    entry('p', 'published'),
    entry('unselected', 'draft'),
  ];

  assert.deepEqual(countSelectedStatuses(entries, new Set(['d', 'r', 'f', 'p'])), {
    draft: 1,
    review: 1,
    finalized: 1,
    published: 1,
  });
});

const contextHook = read(
  'apps/frontend/src/features/timetable/hooks/useBulkScheduleActions.ts',
);

test('bulk hook supports cancel finalization and shared-reason change requests', () => {
  assert.match(contextHook, /updateScheduleStatus\(id, 'draft'\)/);
  assert.match(contextHook, /createChangeRequest\(id, note \?\? ''\)/);
  assert.match(contextHook, /from .*schedule-change-request\.api/);
  assert.match(contextHook, /const skipped = selectedIds\.size - ids\.length/);
  assert.match(contextHook, /skipped/);
  assert.doesNotMatch(contextHook, /alert\(|confirm\(|prompt\(|setSearchParams|navigate\(/);
});

test('bulk hook reports skipped rows without native dialogs', () => {
  assert.match(contextHook, /Updated \$\{succeededIds\.length\} selected row/);
  assert.match(contextHook, /\$\{skipped\} skipped/);
  assert.match(contextHook, /feedback\.success\(/);
  assert.match(contextHook, /feedback\.failed\(/);
});

const contextModal = read(
  'apps/frontend/src/features/timetable/components/BulkActionConfirmModal.tsx',
);

test('bulk modal handles a shared change reason', () => {
  assert.match(contextModal, /'request-change'/);
  assert.match(contextModal, /note\.trim\(\)\.length < 5/);
  assert.match(contextModal, /Reason for the change/);
  assert.match(contextModal, /Note for the Dean/);
  assert.match(contextModal, /auto-generated draft/);
  assert.doesNotMatch(contextModal, /alert\(|confirm\(|prompt\(/);
});

const contextBar = read(
  'apps/frontend/src/features/timetable/components/BulkActionBar.tsx',
);

test('selection bar shows status mix and contextual actions', () => {
  assert.match(contextBar, /statusCounts\.draft/);
  assert.match(contextBar, /statusCounts\.review/);
  assert.match(contextBar, /statusCounts\.finalized/);
  assert.match(contextBar, /Cancel finalization/);
  assert.match(contextBar, /Request change/);
  assert.doesNotMatch(contextBar, /Send to IDP/);
});

const contextMenu = read(
  'apps/frontend/src/features/timetable/components/TimetableMoreMenu.tsx',
);

test('header More menu is accessible and closeable', () => {
  assert.match(contextMenu, /aria-haspopup="menu"/);
  assert.match(contextMenu, /aria-expanded/);
  assert.match(contextMenu, /Escape/);
  assert.match(contextMenu, /pointerdown/);
  assert.match(contextMenu, /dataTour/);
  assert.doesNotMatch(contextMenu, /alert\(|confirm\(|prompt\(|setSearchParams|navigate\(/);
});

const contextPage = read(
  'apps/frontend/src/features/timetable/TimetablePage.tsx',
);

test('timetable page wires contextual actions and the header More menu', () => {
  assert.match(contextPage, /countSelectedStatuses\(entries, selectedScheduleIds\)/);
  assert.match(contextPage, /statusCounts=\{statusCounts\}/);
  assert.match(contextPage, /<TimetableMoreMenu/);
  assert.match(contextPage, /'cancel-finalization'/);
  assert.match(contextPage, /'request-change'/);
  assert.match(contextPage, /action === 'request-publish' \|\| action === 'request-change'/);
  assert.doesNotMatch(contextPage, /bulk[A-Za-z]*\([^)]*setSearchParams/);
  assert.doesNotMatch(contextPage, /bulk[A-Za-z]*\([^)]*navigate\(/);
});

const invalidationHook = read(
  'apps/frontend/src/features/timetable/hooks/useBulkScheduleActions.ts',
);

test('bulk hook invalidates per-entry request queries for affected rows', () => {
  assert.match(invalidationHook, /refreshDependentQueries\(ids\)/);
  assert.match(invalidationHook, /queryKey: \['schedule-publish-request', id\]/);
  assert.match(invalidationHook, /queryKey: \['schedule-change-request', id\]/);
  assert.doesNotMatch(invalidationHook, /entry\?\.id/);
});

test('timetable grid lets vertical wheel scroll chain to the page', () => {
  assert.match(grid, /ref=\{containerRef\}/);
  assert.match(grid, /className="flex-1 overflow-auto"/);
  assert.doesNotMatch(grid, /overflow-auto overscroll-contain/);
});

test('selectable ids include published rows and lock to one status', () => {
  const entries = [
    entry('d', 'draft'),
    entry('r', 'review'),
    entry('f', 'finalized'),
    entry('p', 'published'),
    entry('foreign', 'draft'),
  ];
  const foreign = new Set(['foreign']);

  assert.deepEqual(
    [...getSelectableScheduleIds(entries, foreign, true, null)],
    ['d', 'r', 'f', 'p'],
  );
  assert.deepEqual(
    [...getSelectableScheduleIds(entries, foreign, true, 'draft')],
    ['d'],
  );
  assert.deepEqual(
    [...getSelectableScheduleIds(entries, foreign, true, 'published')],
    ['p'],
  );
  assert.deepEqual(
    [...getSelectableScheduleIds(entries, new Set(), false, null)],
    [],
  );
});

test('missing entry status is treated as draft', () => {
  assert.equal(normalizeEntryStatus(entry('x', undefined)), 'draft');
  assert.equal(normalizeEntryStatus(entry('y', 'published')), 'published');
});

test('selection enters body-click mode after the first checkbox tick', () => {
  assert.match(page, /const \[selectionStatus, setSelectionStatus\] = useState<SelectionStatus \| null>\(null\)/);
  assert.match(page, /const selectMode = selectedScheduleIds\.size > 0/);
  assert.match(page, /getSelectableScheduleIds\(entries, foreignEntryIds, writable, selectionStatus\)/);
  assert.match(page, /selectableEntryIds=\{selectMode \? undefined : selectableScheduleIds\}/);
  assert.match(page, /const handleEntryActivation = useCallback/);
  assert.match(page, /if \(selectMode\) handleToggleSelect\(entry\); else handleClick\(entry\)/);
  assert.match(page, /onEntryClick=\{handleEntryActivation\}/);
  assert.match(page, /Selection is locked to/);
  assert.match(page, /setSelectionStatus\(null\)/);
});

test('selected rows stay visible when checkboxes are hidden', () => {
  assert.match(classBlock, /selected &&/);
  assert.match(agendaCard, /selected &&/);
});

test('bulk unfinalize fans out through the existing single-row API and invalidates per-entry state', () => {
  assert.match(contextHook, /createUnfinalizeRequest\(id, note \?\? ''\)/);
  assert.match(contextHook, /from .*schedule-unfinalize\.api/);
  assert.match(contextHook, /queryKey: \['schedule-unfinalize-request', id\]/);
  assert.match(contextHook, /onSucceeded\(succeededIds\)/);
  assert.doesNotMatch(contextHook, /alert\(|confirm\(|prompt\(|setSearchParams|navigate\(|useState<[^>]*success/i);
});
