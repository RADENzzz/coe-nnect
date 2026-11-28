# Contextual Bulk Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the timetable bulk bar status-aware with Cancel finalization and Request change actions, and move secondary header actions into a More menu.

**Architecture:** Extend the existing pure eligibility utility and `Promise.allSettled` fan-out hook with two new single-row actions. Add status chips and contextual button visibility to the bar, generalize the confirmation modal's note field for a shared change reason, and add a small accessible More menu for the header. `TimetablePage` owns the selection counts and wires everything together.

**Tech Stack:** React 18, TypeScript, TanStack Query, Tailwind CSS, `node:test` source/unit tests.

**Spec:** `docs/superpowers/specs/2026-11-28-multi-select-context-actions-design.md`

## Global Constraints

- Extend the existing frontend fan-out over single-row APIs; no backend, schema, migration, or new array endpoint changes.
- Use global `useFeedback()` only; no `alert`, `confirm`, `prompt`, local toast, or local success/failure state.
- Do not change `?request=`, `?publishRequest=`, `?changeRequest=`, `?newTerm=1`, or `?termId=…` handling.
- Only `draft` rows remain editable/overwrite candidates; `finalized` and `published` rows stay locked by existing rules.
- No direct publish from the timetable; publication stays behind Dean approval.
- IDP stays manual via **Send to IDP** on the Dean approval page; do not add it to the timetable bar.
- Published rows remain unselectable; Request unfinalize stays on the detail drawer.
- CI Browser E2E is authoritative; local browser E2E stays skipped because `e2e/.env.local` points at a dead Supabase project.
- Commit subjects must not use `feat` or `chore`, must not end with `:`, and every authored commit includes `Co-authored-by: trynotybort <trynotybort@gmail.com>`.
- Do not stage `.superpowers/`, `final-review.diff`, unrelated docs plans/specs, or `docs/integrations/idp-request-change-update.md`.
- Append tests to `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`. That file already declares `read`, `modal`, and `page`; use new constant names below and do not redeclare those.

## Review Focus

- Mixed `draft` + `finalized` selection: Cancel finalization and Request change must act only on eligible rows and report skipped rows — pinned by Task 1 eligibility assertions and Task 2 skipped-count feedback assertion.
- Unselected or published rows must never appear in status chips or trigger an action — pinned by Task 1 `countSelectedStatuses` unit test and Task 4 conditional-render assertions.
- Request change with a reason shorter than 5 characters must not be submittable — pinned by Task 3 modal assertion.
- Header More menu must close on Escape and outside click and keep menu items keyboard reachable — pinned by Task 5 source assertions.
- Bulk handlers and the More menu must not navigate or touch search params — pinned by Task 6 source assertions.

---

### Task 1: Eligibility and status-count utility

**Files:**
- Modify: `apps/frontend/src/features/timetable/utils/bulk-actions.util.ts`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: `ScheduleEntry` from `../types.ts`; existing `getBulkActionEligibleIds`.
- Produces:
  - `BulkRowAction` extended with `'cancel-finalization' | 'request-change'`.
  - `export interface BulkStatusCounts { draft: number; review: number; finalized: number; }`
  - `export function countSelectedStatuses(entries: ScheduleEntry[], selectedIds: Set<string>): BulkStatusCounts`

- [ ] **Step 1: Write the failing tests**

First replace the existing import at the top of the shared test file with:

```ts
import {
  countSelectedStatuses,
  getBulkActionEligibleIds,
} from './utils/bulk-actions.util.ts';
```

Then append these tests to the same file:

```ts
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

test('status counts only include selected draft, review, and finalized rows', () => {
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
  });
});
```

Note: the existing `entry` helper at the top of the file already accepts an optional status; do not redeclare it or the existing `selected` set. Do not add a second import statement.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: FAIL because the new statuses/export do not exist.

- [ ] **Step 3: Extend the utility**

Add both actions to `BulkRowAction` and `ELIGIBLE_STATUSES`:
- `cancel-finalization`: `finalized`
- `request-change`: `review`, `finalized`

Add `countSelectedStatuses` as a pure helper that filters `selectedIds.has(entry.id)`, ignores `published`, and increments the bucket for `entry.status ?? 'draft'`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/timetable/utils/bulk-actions.util.ts apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Add contextual bulk eligibility and status counts" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 2: Hook fan-out for the new actions

**Files:**
- Modify: `apps/frontend/src/features/timetable/hooks/useBulkScheduleActions.ts`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: extended `BulkRowAction` (Task 1); `createChangeRequest` from `../../../api/schedule-change-request.api`; existing `updateScheduleStatus`, global feedback, and query invalidation.
- Produces: `BulkScheduleAction` extended with `'cancel-finalization' | 'request-change'`; `runBulkAction(action, note?)` unchanged.

- [ ] **Step 1: Write the failing source assertions**

Append:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: FAIL because the hook lacks the new cases and skipped count.

- [ ] **Step 3: Implement the fan-out cases**

- Import `createChangeRequest`.
- Add `case 'cancel-finalization': return updateScheduleStatus(id, 'draft');`.
- Add `case 'request-change': return createChangeRequest(id, note ?? '');`.
- Keep the existing `Promise.allSettled`, `succeededIds`, `failures`, `onSucceeded(succeededIds)`, and invalidation behavior.
- Compute `const skipped = selectedIds.size - ids.length;` immediately after the eligible-ID check.

- [ ] **Step 4: Add skipped-row feedback**

Append:

```ts
test('bulk hook reports skipped rows without native dialogs', () => {
  assert.match(contextHook, /Updated \$\{succeededIds\.length\} selected row/);
  assert.match(contextHook, /\$\{skipped\} skipped/);
  assert.match(contextHook, /feedback\.success\(/);
  assert.match(contextHook, /feedback\.failed\(/);
});
```

Derive `const skippedSuffix = skipped > 0 ? ` ${skipped} skipped.` : '';` and append it to both feedback messages (`feedback.success` and `feedback.failed`). Do not change `onSucceeded` semantics.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/timetable/hooks/useBulkScheduleActions.ts apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Add contextual bulk action fan-out" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 3: Confirmation modal reason handling

**Files:**
- Modify: `apps/frontend/src/features/timetable/components/BulkActionConfirmModal.tsx`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: `BulkConfirmAction` extended with `'request-change'`; existing `note`, `busy`, `onNoteChange`, `onConfirm`.
- Produces: same prop interface, with `BulkConfirmAction` including `'request-change'`.

- [ ] **Step 1: Write the failing source assertions**

Append:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: FAIL because the modal has no Request change copy or validation.

- [ ] **Step 3: Generalize the note field**

- Add `'request-change'` to `BulkConfirmAction` and `ACTION_COPY` with title `Request change`, confirm label `Send request`, and an amber tone.
- Derive `const isChange = action === 'request-change';`.
- Render the textarea when `action === 'request-publish' || isChange`.
- Keep Request publish's optional note label `Note for the Dean`.
- Use label `Reason for the change` when `isChange`, with placeholder `e.g. Faculty reassignment approved by the department`.
- Compute `noteTooShort = isChange && note.trim().length < 5` and `noteTooLong = note.length > 500`.
- Disable the confirm button when `busy || noteTooShort || noteTooLong`; show a character hint beneath the textarea.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/timetable/components/BulkActionConfirmModal.tsx apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Add shared change reason to bulk modal" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 4: Status-aware selection bar

**Files:**
- Modify: `apps/frontend/src/features/timetable/components/BulkActionBar.tsx`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: `BulkStatusCounts` (Task 1); extended `BulkScheduleAction` (Task 2).
- Produces: `BulkActionBarProps` gains `statusCounts: BulkStatusCounts`.

- [ ] **Step 1: Write the failing source assertions**

Append:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: FAIL because the bar has no status chips or new actions.

- [ ] **Step 3: Add chips and conditional buttons**

- Add `statusCounts` to `BulkActionBarProps` and destructure it.
- Render a chip for each of draft/review/finalized only when its count is greater than zero, beside `{count} selected`.
- Add a **Cancel finalization** button when `statusCounts.finalized > 0`; call `onAction('cancel-finalization')`.
- Add a **Request change** button when `statusCounts.review + statusCounts.finalized > 0`; call `onAction('request-change')`.
- Keep all existing buttons, disabled state, `role="toolbar"`, `above-bottom-nav`, and responsive wrapping.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/timetable/components/BulkActionBar.tsx apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Add status chips and contextual bulk buttons" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 5: Header More menu

**Files:**
- Create: `apps/frontend/src/features/timetable/components/TimetableMoreMenu.tsx`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Produces:
  - `export interface TimetableMoreMenuItem { key: string; label: string; onSelect: () => void; disabled?: boolean; title?: string; dataTour?: string; }`
  - `export default function TimetableMoreMenu({ items }: { items: TimetableMoreMenuItem[] }): JSX.Element | null`

- [ ] **Step 1: Write the failing source assertions**

Append:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the menu**

- Return `null` when `items.length === 0`.
- Render a button labeled `More` with a caret, `aria-haspopup="menu"`, and `aria-expanded={open}`.
- Keep local `open` state; close on Escape (`keydown`) and outside `pointerdown`.
- Render a `role="menu"` container with one `role="menuitem"` button per item.
- Apply `item.disabled`, `item.title`, and `data-tour={item.dataTour}` to each menu item button.
- Close the menu after an item is selected.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/timetable/components/TimetableMoreMenu.tsx apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Add accessible timetable More menu" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 6: Wire contextual actions and header menu into TimetablePage

**Files:**
- Modify: `apps/frontend/src/features/timetable/TimetablePage.tsx`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: `countSelectedStatuses` (Task 1), extended hook and bar/modal (Tasks 2–4), `TimetableMoreMenu` (Task 5).
- Produces: no new exported interfaces.

- [ ] **Step 1: Write the failing source assertions**

Append:

```ts
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
```

Note: do not redeclare `page`, `modal`, or any other existing constant in the shared test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: FAIL because the page lacks the new wiring.

- [ ] **Step 3: Wire counts and actions**

- Import `countSelectedStatuses` from `./utils/bulk-actions.util.ts`.
- Derive `const statusCounts = useMemo(() => countSelectedStatuses(entries, selectedScheduleIds), [entries, selectedScheduleIds]);`.
- Pass `statusCounts={statusCounts}` to `<BulkActionBar>`.
- In `handleBulkAction`, route `cancel-finalization` directly to `runBulkAction(action)` alongside review/finalize; route `request-change` to the confirmation modal alongside delete/request-publish.
- In `handleConfirmBulkAction`, replace the note argument with exactly:
  `action === 'request-publish' || action === 'request-change' ? publishNote : undefined`,
  then clear `publishNote`.
- Keep `bulkConfirmAction` typed so it accepts `'request-change'`.

- [ ] **Step 4: Replace the three header buttons**

- Remove the standalone Versions, Clear auto-drafts, and Focus Plot buttons.
- Build a filtered `moreMenuItems` array using the same visibility rules as before:
  - Versions when `activeTerm && !activeVersion`.
  - Clear auto-drafts when `writable && activeTerm && isDepartmentHead`.
  - Focus Plot when `writable && activeTerm`.
- Preserve titles, `disabled: isGenerating` where applicable, and `dataTour` values (`tt-focus`; no tour for Versions/Clear auto-drafts).
- Render `<TimetableMoreMenu items={moreMenuItems} />` after Auto-Generate and before Plot Subject.
- Keep Auto-Generate, Plot Subject, entry count, and coverage pill exactly where they are.

- [ ] **Step 5: Run the focused test**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: PASS.

- [ ] **Step 6: Run whole-branch verification**

Run: `pnpm typecheck && pnpm typecheck:e2e && pnpm test && pnpm test:e2e:list`

Expected: all commands exit 0. CI Browser E2E remains authoritative; do not run local browser E2E.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/timetable/TimetablePage.tsx apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Wire contextual bulk actions and header menu" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```
