# Timetable Selection and Scrolling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the timetable grid stop trapping wheel scrolling, add first-tick select mode with status-locked selection, and add bulk Request unfinalize for published rows.

**Architecture:** Keep the existing full-page timetable layout and fan-out hook. Selection state and lock live in `TimetablePage.tsx`; pure selection helpers live in a new utility; row components keep their existing click/checkbox interfaces. Published rows join the selectable set and use the existing single-row unfinalize request API.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS, TanStack Query, Node's built-in test runner, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-28-timetable-selection-scrolling-design.md`

## Global Constraints

- Frontend-only fan-out over single-row APIs; no backend, schema, migration, or endpoint changes.
- Use global `useFeedback()` only; no `alert`, `confirm`, `prompt`, local toast, or local success/failure state.
- Preserve `?request=`, `?publishRequest=`, `?changeRequest=`, `?newTerm=1`, `?termId=…`; no direct publish; Dean approval stays manual; IDP stays manual via **Send to IDP**.
- Keep Auto-Generate and Plot Subject visible; moved menu items keep their `data-tour` values, notably `tt-focus`.
- Commit subjects must not use `feat` or `chore`, must not end with `:`, and include `Co-authored-by: trynotybort <trynotybort@gmail.com>`.
- Do not stage `.superpowers/`, `final-review.diff`, unrelated docs plans/specs, `docs/integrations/idp-request-change-update.md`, or the uncommitted `e2e/specs/published-version.spec.ts` LF normalization.
- CI Browser E2E is authoritative; local browser E2E stays skipped because `e2e/.env.local` points at a dead Supabase project.
- Source-regex tests are the repo convention here and are allowed under the standing CI-Browser-E2E ruling.

## Review Focus

- Wheel over the grid with horizontal overflow: removing `overscroll-contain` must not remove `overflow-auto` or the sticky header. Pinned in Task 1's source assertions.
- Entries with no explicit `status`: normalize to `draft` so the status lock and bulk eligibility agree. Pinned in Task 2's `normalizeEntryStatus` assertion.
- Foreign or read-only rows that match the locked status: must remain unselectable. Pinned in Task 2's `writable: false` and foreign-ID assertions.
- A body click on a mismatched status while select mode is active: must not open the drawer and must report through global feedback. Pinned in Task 3's `handleEntryActivation` and feedback assertions.
- Partial bulk unfinalize with skipped rows: fulfilled IDs only leave the selection, skipped count is reported globally, no local state/toast is introduced. Pinned in Task 4's hook assertions.

---

### Task 1: Allow wheel scroll chaining from the grid

**Files:**
- Modify: `apps/frontend/src/features/timetable/components/TimetableGrid.tsx:389-392`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: existing `containerRef` and grid layout.
- Produces: no new interface. The grid scrollport keeps `overflow-auto` and loses only `overscroll-contain`.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`:

```ts
test('timetable grid lets vertical wheel scroll chain to the page', () => {
  assert.match(grid, /ref=\{containerRef\}/);
  assert.match(grid, /className="flex-1 overflow-auto"/);
  assert.doesNotMatch(grid, /overflow-auto overscroll-contain/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: FAIL with the `doesNotMatch` assertion for `overflow-auto overscroll-contain`.

- [ ] **Step 3: Change the grid scrollport class**

In `TimetableGrid.tsx`, change only the scrollport class from `flex-1 overflow-auto overscroll-contain` to `flex-1 overflow-auto`. Keep the ref, sticky header, and horizontal overflow behavior unchanged.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/timetable/components/TimetableGrid.tsx apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Allow wheel scroll chaining from timetable grid

Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 2: Add status-locked selection helpers

**Files:**
- Create: `apps/frontend/src/features/timetable/utils/selection.util.ts`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: `ScheduleEntry` from `../types.ts`.
- Produces:
  - `export type SelectionStatus = NonNullable<ScheduleEntry['status']>`
  - `export function normalizeEntryStatus(entry: ScheduleEntry): SelectionStatus`
  - `export function getSelectableScheduleIds(entries: ScheduleEntry[], foreignEntryIds: Set<string>, writable: boolean, lockedStatus: SelectionStatus | null): Set<string>`

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`, adding an import for the two helpers from `./utils/selection.util.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: FAIL because `./utils/selection.util.ts` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `selection.util.ts` with exactly the exported signatures in the Interfaces block. `normalizeEntryStatus` returns `entry.status ?? 'draft'`. `getSelectableScheduleIds` returns an empty set when `writable` is false; otherwise it includes entries not in `foreignEntryIds` and, when `lockedStatus` is non-null, only entries whose normalized status equals `lockedStatus`. Do not exclude `published`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/timetable/utils/selection.util.ts apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Add status-locked timetable selection helpers

Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 3: Enter select mode after the first checkbox tick

**Files:**
- Modify: `apps/frontend/src/features/timetable/TimetablePage.tsx:230,978-987,1623-1668,2213-2243`
- Modify: `apps/frontend/src/features/timetable/components/ClassBlock.tsx:121-126,167-179`
- Modify: `apps/frontend/src/features/timetable/views/AgendaClassCard.tsx:39-56`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: `SelectionStatus`, `normalizeEntryStatus`, `getSelectableScheduleIds` from Task 2; existing `handleClick`, `foreignEntryIds`, `writable`, and `useFeedback()`.
- Produces: `handleEntryActivation(entry: ScheduleEntry): void` passed to `TimetableGrid` and `AgendaView`; `selectMode: boolean` derived from `selectedScheduleIds.size > 0`. `PlotFocusMode` keeps using `handleClick`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: FAIL on the new `selectionStatus` / `handleEntryActivation` assertion.

- [ ] **Step 3: Wire select-mode state and status lock in the page**

In `TimetablePage.tsx`:

- Import the Task 2 helpers and add `const [selectionStatus, setSelectionStatus] = useState<SelectionStatus | null>(null);`.
- Derive `const selectMode = selectedScheduleIds.size > 0;`.
- Replace the existing `selectableScheduleIds` memo body with `getSelectableScheduleIds(entries, foreignEntryIds, writable, selectionStatus)`.
- In `handleToggleSelect`, first return early for foreign/read-only rows. If `selectionStatus` is non-null and `normalizeEntryStatus(entry) !== selectionStatus`, call `feedback.error(\`Selection is locked to ${selectionStatus} rows. Clear the selection to switch.\`)` and return before the `selectableScheduleIds` check. Then return early for IDs outside `selectableScheduleIds`. On add, set the lock when it is null; on remove, clear the lock when the next set is empty.
- Clear `selectionStatus` in the existing term/department/version effect, in `handleClearSelection`, and in `handleBulkSucceeded` when the next selection is empty.
- Add `handleEntryActivation` with the exact branch in the test; pass it to `TimetableGrid` and `AgendaView` via `onEntryClick`. Leave `PlotFocusMode` on `handleClick`.
- Pass `selectableEntryIds={selectMode ? undefined : selectableScheduleIds}` to both `TimetableGrid` and `AgendaView` so checkboxes hide in select mode; keep passing `selectedEntryIds` in both places.

- [ ] **Step 4: Show selection on row bodies**

In `ClassBlock.tsx`, add `selected && 'outline outline-2 outline-primary'` to the block's class list so selection stays visible without replacing conflict/diff rings. In `AgendaClassCard.tsx`, add the same outline class to the outer card `div`. Keep checkbox markup and `onToggleSelect` unchanged.

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/timetable/TimetablePage.tsx apps/frontend/src/features/timetable/components/ClassBlock.tsx apps/frontend/src/features/timetable/views/AgendaClassCard.tsx apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Select timetable rows by body in select mode

Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 4: Fan out bulk Request unfinalize

**Files:**
- Modify: `apps/frontend/src/features/timetable/utils/bulk-actions.util.ts:3-56`
- Modify: `apps/frontend/src/features/timetable/hooks/useBulkScheduleActions.ts:3-16,62-79,104-145`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: `createUnfinalizeRequest(scheduleId: string, reason: string)` from `apps/frontend/src/api/schedule-unfinalize.api.ts`.
- Produces: `BulkRowAction` includes `'request-unfinalize'`; `ELIGIBLE_STATUSES['request-unfinalize']` is `published`; `BulkStatusCounts` includes `published: number`; `runBulkAction` accepts the new action with an optional shared note.

- [ ] **Step 1: Write the failing tests**

Update the existing eligible-ID test in `multi-select-bulk-actions.test.ts` to add:

```ts
assert.deepEqual(
  getBulkActionEligibleIds('request-unfinalize', entries, selected),
  ['p'],
);
```

Update the existing status-count test expectation to include `published: 1`.

Append:

```ts
test('bulk unfinalize fans out through the existing single-row API and invalidates per-entry state', () => {
  assert.match(contextHook, /createUnfinalizeRequest\(id, note \?\? ''\)/);
  assert.match(contextHook, /from .*schedule-unfinalize\.api/);
  assert.match(contextHook, /queryKey: \['schedule-unfinalize-request', id\]/);
  assert.match(contextHook, /onSucceeded\(succeededIds\)/);
  assert.doesNotMatch(contextHook, /alert\(|confirm\(|prompt\(|setSearchParams|navigate\(|useState<[^>]*success/i);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: FAIL because `'request-unfinalize'` is not in `BulkRowAction`.

- [ ] **Step 3: Extend the utility**

In `bulk-actions.util.ts`, add `'request-unfinalize'` to `BulkRowAction`, map it to `new Set(['published'])`, and add `published: number` to `BulkStatusCounts` with `published: 0` in the initial accumulator. Published rows must no longer be skipped by `countSelectedStatuses`.

- [ ] **Step 4: Extend the hook**

In `useBulkScheduleActions.ts`, import `createUnfinalizeRequest`, add `case 'request-unfinalize': return createUnfinalizeRequest(id, note ?? '');`, and add `queryClient.invalidateQueries({ queryKey: ['schedule-unfinalize-request', id] })` for affected IDs inside `refreshDependentQueries`. Keep `Promise.allSettled`, skipped-count reporting, fulfilled-only `onSucceeded(succeededIds)`, feedback text, and pending-action behavior unchanged.

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/timetable/utils/bulk-actions.util.ts apps/frontend/src/features/timetable/hooks/useBulkScheduleActions.ts apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Fan out bulk unfinalize requests

Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 5: Expose bulk unfinalize in the bar and modal

**Files:**
- Modify: `apps/frontend/src/features/timetable/components/BulkActionBar.tsx:37-116`
- Modify: `apps/frontend/src/features/timetable/components/BulkActionConfirmModal.tsx:4-21,60-140`
- Modify: `apps/frontend/src/features/timetable/TimetablePage.tsx:1678-1708`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: `statusCounts.published` and `BulkScheduleAction` from Task 4.
- Produces: `BulkConfirmAction` includes `'request-unfinalize'`; `handleBulkAction` routes it through the shared reason modal; `handleConfirmBulkAction` forwards `publishNote` for it.

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`:

```ts
test('bulk bar and modal expose Request unfinalize with one shared reason', () => {
  assert.match(contextBar, /statusCounts\.published/);
  assert.match(contextBar, /Request unfinalize/);
  assert.match(contextModal, /'request-unfinalize'/);
  assert.match(contextModal, /Reason for the unfinalize request/);
  assert.match(contextModal, /note\.trim\(\)\.length < 5/);
  assert.match(contextPage, /action === 'request-unfinalize'/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: FAIL on `statusCounts.published` / `Request unfinalize`.

- [ ] **Step 3: Add the bar affordance**

In `BulkActionBar.tsx`, render a `published` chip next to the existing status chips when `statusCounts.published > 0`, and a **Request unfinalize** button when published rows are selected. Use the existing `buttonClass`, `disabled` state, and icon pattern; do not add an IDP action.

- [ ] **Step 4: Add the modal action**

In `BulkActionConfirmModal.tsx`, add `'request-unfinalize'` to `BulkConfirmAction` and `ACTION_COPY` with title `Request unfinalize`, label `Send request`, and amber tone. Extend the shared-reason field and the 5–500 character validation to include this action, with label `Reason for the unfinalize request` and copy explaining that the Dean will decide.

- [ ] **Step 5: Wire the page confirmation path**

In `TimetablePage.tsx`, add `'request-unfinalize'` to the `handleBulkAction` confirmation branch and to the `handleConfirmBulkAction` note condition. Keep the existing `publishNote` state and reset behavior; do not add a new modal component.

- [ ] **Step 6: Run the focused test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/timetable/components/BulkActionBar.tsx apps/frontend/src/features/timetable/components/BulkActionConfirmModal.tsx apps/frontend/src/features/timetable/TimetablePage.tsx apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Expose bulk unfinalize in bar and modal

Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 6: Verify the whole change

**Files:** none.

**Interfaces:**
- Consumes: all earlier tasks.
- Produces: verification evidence only.

- [ ] **Step 1: Run full checks**

Run: `pnpm typecheck && pnpm typecheck:e2e && pnpm test && pnpm test:e2e:list`

Expected: all commands exit 0; frontend, constraint-rules, and backend tests pass; E2E list succeeds. Pre-existing unused `generateTimeSlots` ESLint warning is not part of this command and remains deferred.

- [ ] **Step 2: Check staged scope**

Run: `git status --short`

Expected: no staged `.superpowers/`, `final-review.diff`, unrelated docs plans/specs, `docs/integrations/idp-request-change-update.md`, or `e2e/specs/published-version.spec.ts`. The related spec and plan may be committed separately by the controller; this task does not stage them.
