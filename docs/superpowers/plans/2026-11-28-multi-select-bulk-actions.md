# Multi-select Bulk Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add checkbox selection and a floating bulk-action bar to the timetable so a department head can delete, review, finalize, and request publication for several plotted entries at once.

**Architecture:** Frontend-only fan-out over the existing single-row APIs. A pure eligibility utility decides which selected rows an action applies to; a hook performs `Promise.allSettled`, global feedback, query invalidation, and selection cleanup; small presentational components render the bar and confirmation modal; `TimetablePage` owns the selection `Set` and wires it into grid and agenda rows.

**Tech Stack:** React 18, TypeScript, TanStack Query, Tailwind CSS, `node:test` source/unit tests.

**Spec:** `docs/superpowers/specs/2026-11-28-multi-select-bulk-actions-design.md`

## Global Constraints

- Use Approach A: frontend fan-out over existing single-row APIs; no backend, schema, migration, or new array endpoint changes.
- Use global `useFeedback()` only; no `alert`, `confirm`, `prompt`, local toast, or local success/failure state.
- Do not change `?request=`, `?publishRequest=`, `?changeRequest=`, `?newTerm=1`, or `?termId=…` handling.
- Only `draft` rows remain editable/overwrite candidates; `finalized` and `published` rows stay locked by existing rules.
- No direct publish from the timetable; publication stays behind Dean approval.
- IDP stays manual via **Send to IDP** on the Dean approval page; do not add it to the timetable bar.
- CI Browser E2E is authoritative; local browser E2E stays skipped because `e2e/.env.local` points at a dead Supabase project.
- Commit subjects must not use `feat` or `chore`, must not end with `:`, and every authored commit includes `Co-authored-by: trynotybort <trynotybort@gmail.com>`.
- Do not stage `.superpowers/`, `final-review.diff`, unrelated docs plans/specs, or `docs/integrations/idp-request-change-update.md`.

## Review Focus

- Mixed eligible/ineligible selection: a `finalized` row in Delete or a `draft` row in Request publish must be skipped and reported, never silently acted on. Pinned by Task 1 utility assertions and Task 2 fan-out source assertions.
- Published, foreign-department, and read-only rows: no checkbox and no bulk action may be offered for them. Pinned by Task 4 checkbox source assertions and Task 5 selectable-set assertions.
- Checkbox inside a row card: clicking or focusing the checkbox must not open the detail drawer or start a dnd-kit drag. Pinned by Task 4 `stopPropagation`/`onPointerDown` assertions.
- Partial fan-out failure: successes are removed from the selection, failures stay selected, and feedback reports both counts. Pinned by Task 2 source assertions for `Promise.allSettled`, `onSucceeded`, and `feedback.failed`.
- Deep links: bulk handlers must not navigate or clear search params. Pinned by Task 5 source assertions for absence of `searchParams`, `navigate`, and `setSearchParams` in the new bulk handlers.

---

### Task 1: Eligibility utility and test wiring

**Files:**
- Create: `apps/frontend/src/features/timetable/utils/bulk-actions.util.ts`
- Modify: `apps/frontend/package.json`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: `ScheduleEntry` from `../types`.
- Produces:
  - `export type BulkRowAction = 'delete' | 'review' | 'finalize' | 'request-publish';`
  - `export function getBulkActionEligibleIds(action: BulkRowAction, entries: ScheduleEntry[], selectedIds: Set<string>): string[]`
  - Treat `entry.status ?? 'draft'` as the row status.

- [ ] **Step 1: Write the failing test**

Create `multi-select-bulk-actions.test.ts` with direct unit tests and source assertions:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { getBulkActionEligibleIds } from './utils/bulk-actions.util.ts';

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
```

Also assert the test file itself is registered in `apps/frontend/package.json`.

- [ ] **Step 2: Add the new test file to the frontend test script**

Append `src/features/timetable/multi-select-bulk-actions.test.ts` to the explicit file list in the `test` script of `apps/frontend/package.json`. Do not reorder existing entries.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`
Expected: FAIL with `Cannot find module './utils/bulk-actions.util.ts'`.

- [ ] **Step 4: Implement `getBulkActionEligibleIds`**

In `utils/bulk-actions.util.ts`, filter `entries` to `selectedIds.has(entry.id)`, then apply the exact status sets from the test. Keep the function pure and do not import React or API modules.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/timetable/utils/bulk-actions.util.ts apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts apps/frontend/package.json
git commit -m "Add bulk action eligibility utility" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 2: Bulk action fan-out hook

**Files:**
- Create: `apps/frontend/src/features/timetable/hooks/useBulkScheduleActions.ts`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: `getBulkActionEligibleIds` (Task 1), `deleteSchedule`, `updateScheduleStatus`, `clearAutoDrafts` from `../../../api/schedule.api`, `createPublishRequest` from `../../../api/schedule-publish-request.api`, `extractApiError` from `../../../lib/api-error`, `useFeedback`, and `useQueryClient`.
- Produces:
  - `export type BulkScheduleAction = BulkRowAction | 'clear-auto-drafts';`
  - `export interface BulkActionResult { pendingAction: BulkScheduleAction | null; runBulkAction: (action: BulkScheduleAction, note?: string) => Promise<void>; }`
  - `export function useBulkScheduleActions(options: { termId: string | undefined; deptId: string; entries: ScheduleEntry[]; selectedIds: Set<string>; onSucceeded: (ids: string[]) => void; }): BulkActionResult`

- [ ] **Step 1: Write the failing source assertions**

Append to `multi-select-bulk-actions.test.ts`:

```ts
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
```

`read` is the existing `readFileSync(new URL('../../../../../' + path, import.meta.url), 'utf8')` helper pattern used by other timetable source tests.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`
Expected: FAIL with `Cannot find module .../useBulkScheduleActions.ts` or missing source file assertion.

- [ ] **Step 3: Implement the hook**

For row actions, call `getBulkActionEligibleIds`; if it returns an empty array, call `feedback.error(...)` and return without changing selection. Fan out with `Promise.allSettled`, collect fulfilled IDs, then call `onSucceeded(succeededIds)`. For `clear-auto-drafts`, require `termId` and `deptId`, call `clearAutoDrafts`, and do not call `onSucceeded`. Set `pendingAction` for the duration of the call and clear it in `finally`.

- [ ] **Step 4: Add invalidation and feedback assertions**

Append to the same test:

```ts
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
```

- [ ] **Step 5: Complete the hook implementation**

Invalidate exactly the keys asserted above. Use `feedback.success(...)` when `failures.length === 0`, and `feedback.failed(...)` with succeeded/failed counts plus `extractApiError(failures[0].reason, ...)` otherwise. Do not call `onSucceeded` for failures and do not mutate any search params.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/timetable/hooks/useBulkScheduleActions.ts apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Add bulk schedule action fan-out hook" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 3: Bulk action bar and confirmation modal

**Files:**
- Create: `apps/frontend/src/features/timetable/components/BulkActionBar.tsx`
- Create: `apps/frontend/src/features/timetable/components/BulkActionConfirmModal.tsx`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: `BulkScheduleAction` (Task 2), `Modal` from `../../../components/ui/Modal`, `Icon` from `../../../components/ui/Icon`.
- Produces:
  - `BulkActionBar({ count, pendingAction, onAction, onClearSelection }: { count: number; pendingAction: BulkScheduleAction | null; onAction: (action: BulkScheduleAction) => void; onClearSelection: () => void; })`
  - `BulkActionConfirmModal({ action, count, note, busy, onNoteChange, onConfirm, onClose }: { action: 'delete' | 'request-publish' | 'clear-auto-drafts' | null; count: number; note: string; busy: boolean; onNoteChange: (note: string) => void; onConfirm: () => void; onClose: () => void; })`

- [ ] **Step 1: Write the failing source assertions**

Append to the test file:

```ts
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
  assert.doesNotMatch(modal, /alert\(|confirm\(|prompt\(/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`
Expected: FAIL because the component files do not exist.

- [ ] **Step 3: Implement `BulkActionBar`**

Render a fixed `above-bottom-nav` bar only when `count > 0`. Show the count, disable buttons while `pendingAction !== null`, call `onAction` for each of Delete/Review/Finalize/Request publish, and call `onClearSelection` for the clear button. Use responsive wrapping classes; do not add navigation or search-param writes.

- [ ] **Step 4: Implement `BulkActionConfirmModal`**

Wrap the shared `Modal`. Use `count` in the description, render a single optional textarea only when `action === 'request-publish'`, wire `onNoteChange`, and call `onConfirm` from the confirm button with `busy` applied. Close via `onClose` only.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/timetable/components/BulkActionBar.tsx apps/frontend/src/features/timetable/components/BulkActionConfirmModal.tsx apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Add bulk action bar and confirmation modal" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 4: Row checkboxes for grid and agenda

**Files:**
- Modify: `apps/frontend/src/features/timetable/components/ClassBlock.tsx`
- Modify: `apps/frontend/src/features/timetable/components/TimetableGrid.tsx`
- Modify: `apps/frontend/src/features/timetable/views/AgendaClassCard.tsx`
- Modify: `apps/frontend/src/features/timetable/views/AgendaView.tsx`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: `ScheduleEntry` from `../types`, `BulkRowAction` concept only through callback shape.
- Produces:
  - `ClassBlock` and `AgendaClassCard` each accept `selectable?: boolean`, `selected?: boolean`, `onToggleSelect?: (entry: ScheduleEntry) => void`.
  - `TimetableGrid` and `AgendaView` each accept `selectableEntryIds?: Set<string>`, `selectedEntryIds?: Set<string>`, `onToggleSelect?: (entry: ScheduleEntry) => void`, and pass them to row components.

- [ ] **Step 1: Write the failing source assertions**

Append to the test file:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`
Expected: FAIL because selection props are absent.

- [ ] **Step 3: Add checkbox UI to both row components**

Render a leading checkbox when `selectable` is true. Call `onToggleSelect?.(entry)` on change. Stop click, keydown, and pointer-down propagation so the parent row click handler and dnd-kit draggable do not react. Keep the existing row visual design and badge layout intact; do not repurpose the existing `disabled` drag prop.

- [ ] **Step 4: Fix `AgendaClassCard` nested-interactive markup**

Change its root from a `<button>` to a wrapper `<div>` containing the checkbox and the existing button body, so the checkbox is not nested inside a button. Preserve the existing `onClick(entry)` behavior and keyboard access on the body button.

- [ ] **Step 5: Forward selection props through `TimetableGrid` and `AgendaView`**

For each entry, set `selectable` from `selectableEntryIds?.has(entry.id) ?? false`, `selected` from `selectedEntryIds?.has(entry.id) ?? false`, and pass `onToggleSelect` through. Do not change `readOnlyEntryIds`, `busy`, or `disabled` semantics.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/timetable/components/ClassBlock.tsx apps/frontend/src/features/timetable/components/TimetableGrid.tsx apps/frontend/src/features/timetable/views/AgendaClassCard.tsx apps/frontend/src/features/timetable/views/AgendaView.tsx apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Add row checkboxes for bulk selection" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 5: Wire bulk actions into TimetablePage

**Files:**
- Modify: `apps/frontend/src/features/timetable/TimetablePage.tsx`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: `useBulkScheduleActions` (Task 2), `BulkActionBar` and `BulkActionConfirmModal` (Task 3), selection props from `TimetableGrid`/`AgendaView` (Task 4), `clearAutoDrafts` from `../../../api/schedule.api`.
- Produces: no new exported interfaces; page-level state and handlers only.

- [ ] **Step 1: Write the failing source assertions**

Append to the test file:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`
Expected: FAIL because the page has no selection state or bulk components.

- [ ] **Step 3: Add selection state and selectable set**

Add `selectedScheduleIds: Set<string>` state. Build `selectableScheduleIds` from `entries` where `writable`, not in `foreignEntryIds`, and `status !== 'published'`. Clear selection when `activeTerm?.termId`, `myDeptId`, or `activeVersion?.versionId` changes. Keep `selectedEntryId` for the detail drawer unchanged.

- [ ] **Step 4: Wire the hook and bar**

Call `useBulkScheduleActions` with `termId: activeTerm?.termId`, `deptId: myDeptId`, `entries`, `selectedScheduleIds`, and `onSucceeded` that removes only succeeded IDs from the `Set`. Pass the selection props into `AgendaView` and `TimetableGrid`, and render `<BulkActionBar>` when `selectedScheduleIds.size > 0`. Row actions open the confirmation modal only for Delete and Request publish; Review and Finalize call `runBulkAction` directly.

- [ ] **Step 5: Add the header Clear auto-drafts action**

In the header action group beside Auto-Generate, render a `Clear auto-drafts` button visible only when `writable && activeTerm && isDepartmentHead`. Disable it while `isGenerating`, and open the same confirmation modal with `action === 'clear-auto-drafts'`. On confirm, call `runBulkAction('clear-auto-drafts')`. Do not clear selection for this action.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/timetable/TimetablePage.tsx apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Wire bulk actions into timetable page" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 6: Remove the unscheduled-session notice

**Files:**
- Modify: `apps/frontend/src/features/timetable/TimetablePage.tsx`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: none.

- [ ] **Step 1: Write the failing source assertion**

Append to the test file:

```ts
test('the fixed manual plotting notice is gone', () => {
  assert.doesNotMatch(page, /need manual plotting/);
  assert.doesNotMatch(page, /Plot manually →/);
  assert.doesNotMatch(page, /fetchUnscheduled\(activeTerm!\.termId, myDeptId \|\| undefined\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`
Expected: FAIL because the amber panel and its query still exist.

- [ ] **Step 3: Remove the panel and its unused query**

Delete the fixed amber `<details>` block near the end of `TimetablePage.tsx` and the `useQuery` whose `queryFn` is `fetchUnscheduled(activeTerm!.termId, myDeptId || undefined)`. Keep the `fetchUnscheduled` import because the auto-generate flow calls it directly at line ~779.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Run whole-branch verification**

Run: `pnpm typecheck && pnpm typecheck:e2e && pnpm test && pnpm test:e2e:list`
Expected: all commands exit 0; frontend and backend unit tests pass; E2E list succeeds without running local browser tests.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/timetable/TimetablePage.tsx apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Remove unscheduled session notice" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```
