# Generate Options Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `2 / 3 / 5` auto-generate count out of the crowded timetable header and into a small **Generate options** dialog without changing generation behavior.

**Architecture:** `AutoGenerateButton` becomes a plain action button. Clicking it opens a shared `Modal` that owns a temporary local count draft initialized from the page count. Confirming closes the dialog and calls the existing generation path with an explicit count override, so the selected value is used on the first request even before React state settles. The results chooser and accept path stay untouched.

**Tech Stack:** React + TanStack Query, shared `Modal`, node:test source-contract tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-28-generate-options-dialog-design.md`

## Global Constraints

- Work stays on `NEW-UPDATES`; do not create, merge, or revert PRs.
- Commit subjects must not use `feat`, must not use `chore`, and must not end with `:`.
- Every authored commit includes `Co-authored-by: trynotybort <trynotybort@gmail.com>`.
- Use global `useFeedback()` only; no `alert`, `confirm`, `prompt`, local toast, or local success/failure state. Field errors stay unchanged.
- Only `draft` rows are editable/overwritable; no direct publish.
- IDP stays manual via **Send to IDP**.
- Preserve `?request=`, `?publishRequest=`, `?changeRequest=`, `?newTerm=1`, and `?termId=…` semantics.
- No backend, schema, migration, or API contract changes. Do not refresh stale `docs/DATABASE STRUCTURE/`.
- Fixed presets remain `2 / 3 / 5`; page default remains `3`. Legacy single API stays for compatibility/tests only.
- Candidate mode stays non-destructive: generating and closing the chooser write nothing; only Accept writes drafts.
- CI Browser E2E is authoritative. Local browser E2E stays skipped because `e2e/.env.local` points at a dead Supabase project.
- Do not commit `.superpowers/`, `final-review.diff`, untracked docs plans/specs, or `docs/integrations/idp-request-change-update.md` with implementation commits. Commit this plan file separately as docs only.

## Review Focus

- Cancel must neither generate nor persist a changed count; pinned by Task 1 source contract and Task 3 E2E cancel/reopen.
- The selected count must reach the first API call despite React state timing; pinned by Task 2 override assertion and Task 3 E2E.
- The header selector must be gone while progress, disabled reason, and button styling stay intact; pinned by Task 1 and Task 2 contract tests.
- The chooser, overwrite confirmation, blocked-minor path, room-deficit errors, and conflict feedback stay unchanged; pinned by existing wiring tests and Task 3 E2E.
- No native dialogs or local feedback state are introduced by the new component.

---

### Task 1: Add the generate options dialog

**Files:**
- Create: `apps/frontend/src/features/timetable/auto-schedule/AutoGenerateOptionsDialog.tsx`
- Modify: `apps/frontend/src/features/timetable/auto-schedule/auto-generate-candidates.test.ts`

**Interfaces:**
- `AutoGenerateOptionsDialogProps`:
  - `open: boolean`
  - `count: 2 | 3 | 5`
  - `onClose: () => void`
  - `onGenerate: (count: 2 | 3 | 5) => void`
- Local draft state: `useState<2 | 3 | 5>(count)`.
- Fixed presets: `[2, 3, 5] as const`.
- Modal title: **Generate options**; radio group legend: **Number of schedule options to generate**; footer buttons: **Cancel** and **Generate**.

- [ ] **Step 1: Write the failing source-contract test**

Append to `apps/frontend/src/features/timetable/auto-schedule/auto-generate-candidates.test.ts`:

```ts
test('generate options dialog uses accessible count radios and a non-generating cancel', () => {
  const dialog = read(
    'apps/frontend/src/features/timetable/auto-schedule/AutoGenerateOptionsDialog.tsx',
  );

  assert.match(dialog, /import Modal from/);
  assert.match(dialog, /title="Generate options"/);
  assert.match(dialog, /useState<2 \| 3 \| 5>\(count\)/);
  assert.match(dialog, /\[2, 3, 5\] as const/, 'fixed count presets');
  assert.match(dialog, /<fieldset/);
  assert.match(
    dialog,
    /<legend[^>]*>Number of schedule options to generate<\/legend>/,
  );
  assert.match(dialog, /type="radio"/);
  assert.match(dialog, /onGenerate\(draftCount\)/, 'Generate passes the draft count');
  assert.match(dialog, /onClick=\{onClose\}/, 'Cancel only closes');
  assert.doesNotMatch(dialog, /<select/, 'no header-style select in the dialog');
  assert.doesNotMatch(dialog, /\balert\(|\bconfirm\(|\bprompt\(/);
  assert.doesNotMatch(dialog, /useState[^\n]*(success|failure)/i);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/auto-schedule/auto-generate-candidates.test.ts`  
Expected: FAIL because `AutoGenerateOptionsDialog.tsx` does not exist.

- [ ] **Step 3: Implement the dialog**

Create `AutoGenerateOptionsDialog.tsx` with:

- `import { useEffect, useState } from 'react';` and `import Modal from '../../../components/ui/Modal';`.
- The exact props interface from above.
- `const COUNTS = [2, 3, 5] as const;`.
- `const [draftCount, setDraftCount] = useState<2 | 3 | 5>(count);`.
- `useEffect(() => { if (open) setDraftCount(count); }, [count, open]);` so a reopened dialog starts from the persisted page count.
- `<Modal open={open} onClose={onClose} title="Generate options" size="sm">`.
- A `<fieldset>` with `<legend>Number of schedule options to generate</legend>`.
- One label-wrapped native `<input type="radio" name="candidate-count" value={option} checked={draftCount === option} onChange={() => setDraftCount(option)} />` per `COUNTS` entry, with the visible label text equal to `2`, `3`, or `5`.
- Footer with `<button type="button" onClick={onClose}>Cancel</button>` and `<button type="button" onClick={() => onGenerate(draftCount)}>Generate</button>`.
- No feedback, toast, or success/failure state. Escape and backdrop dismissal keep the shared `Modal` defaults because nothing has been written.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/auto-schedule/auto-generate-candidates.test.ts`  
Expected: PASS, including the new dialog test.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/timetable/auto-schedule/AutoGenerateOptionsDialog.tsx apps/frontend/src/features/timetable/auto-schedule/auto-generate-candidates.test.ts
git commit -m "refactor: add generate options dialog" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 2: Open the dialog from the header button and pass the selected count

**Files:**
- Modify: `apps/frontend/src/features/timetable/auto-schedule/auto-generate.utils.tsx`
- Modify: `apps/frontend/src/features/timetable/TimetablePage.tsx`
- Modify: `apps/frontend/src/features/timetable/auto-generate-candidate-wiring.test.ts`

**Interfaces:**
- `AutoGenerateButton` props: `isGenerating`, `isServerSide`, `elapsedMs`, `onClick`, `disabled?`, `disabledReason?`. No `candidateCount` or `onCandidateCountChange`.
- `performAutoGenerate(options?: { acknowledgeUnplottedMinors?: boolean; candidateCount?: 2 | 3 | 5 })`.
- `handleAutoGenerate(): void` opens the dialog after the existing no-sections guard.
- `handleConfirmGenerate(count: 2 | 3 | 5): void` closes the dialog, persists the count, and starts generation with `candidateCount: count`.
- `generateDialogOpen: boolean` lives in `TimetablePage`.

- [ ] **Step 1: Update the wiring contract tests first**

Replace the count-selector assertions at the end of `default generate snapshots live rows and skips pre-abandon` in `auto-generate-candidate-wiring.test.ts`:

```ts
assert.doesNotMatch(utils, /candidateCount: 2 \| 3 \| 5/);
assert.doesNotMatch(utils, /onCandidateCountChange/);
assert.doesNotMatch(utils, /<select/);
assert.doesNotMatch(utils, />Options/);
assert.match(utils, /getGenerationProgressMessage/);
assert.match(utils, /aria-busy=\{isGenerating\}/);
```

Add one more test:

```ts
test('auto-generate opens options dialog and uses the selected count immediately', () => {
  assert.match(
    page,
    /import AutoGenerateOptionsDialog from '\.\/auto-schedule\/AutoGenerateOptionsDialog'/,
  );
  assert.match(
    page,
    /const \[generateDialogOpen, setGenerateDialogOpen\] = useState\(false\)/,
  );

  const perform = section(
    'const performAutoGenerate = useCallback(',
    'const handleAutoGenerate = useCallback(',
  );
  assert.match(
    perform,
    /candidateCount: options\?\.candidateCount \?\? candidateCount/,
  );

  const handle = section(
    'const handleAutoGenerate = useCallback(',
    'const handleConfirmGenerate = useCallback(',
  );
  assert.match(handle, /setGenerateDialogOpen\(true\)/);
  assert.match(handle, /deptSections\.length === 0/);
  assert.match(handle, /setAlertState\(/);
  assert.doesNotMatch(handle, /performAutoGenerate/);

  const confirm = section(
    'const handleConfirmGenerate = useCallback(',
    'const performLegacyAutoGenerate = useCallback(',
  );
  assert.match(confirm, /setGenerateDialogOpen\(false\)/);
  assert.match(confirm, /setCandidateCount\(count\)/);
  assert.match(
    confirm,
    /performAutoGenerate\(\{\s*candidateCount: count\s*\}\)/,
  );

  assert.match(page, /<AutoGenerateOptionsDialog/);
  assert.match(page, /open=\{generateDialogOpen\}/);
  assert.match(page, /count=\{candidateCount\}/);
  assert.match(page, /onGenerate=\{handleConfirmGenerate\}/);
  assert.doesNotMatch(
    page,
    /<AutoGenerateButton[\s\S]{0,600}candidateCount=/,
  );
});
```

Keep the existing `candidateCount` state assertion and all chooser/accept/close assertions unchanged.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/auto-schedule/auto-generate-candidates.test.ts src/features/timetable/auto-generate-candidate-wiring.test.ts`  
Expected: FAIL because the button still renders the selector and the page does not own dialog state.

- [ ] **Step 3: Simplify `AutoGenerateButton`**

In `auto-generate.utils.tsx`:

- Remove `candidateCount` and `onCandidateCountChange` from `AutoGenerateButtonProps` and the destructuring.
- Delete the `Options` label, `<select>`, and wrapping `<div>`.
- Return the existing `<button>` directly.
- Preserve the progress meter, label, spinner, classes, `aria-busy`, `aria-live`, `aria-disabled`, and disabled reason exactly as they are.

- [ ] **Step 4: Wire the dialog into `TimetablePage`**

In `TimetablePage.tsx`:

- Import `AutoGenerateOptionsDialog` from `./auto-schedule/AutoGenerateOptionsDialog`.
- Add `const [generateDialogOpen, setGenerateDialogOpen] = useState(false);` beside `candidateCount`.
- Extend `performAutoGenerate` options with `candidateCount?: 2 | 3 | 5` and send `candidateCount: options?.candidateCount ?? candidateCount` in the API payload. Keep `candidateCount` in the dependency array.
- Change `handleAutoGenerate` to a synchronous callback that keeps the active-term/dept guard and no-sections alert exactly as written, then calls `setGenerateDialogOpen(true)`. Its dependencies become `[activeTerm, myDeptId, deptSections.length]`.
- Add `handleConfirmGenerate` immediately after `handleAutoGenerate`:

```ts
const handleConfirmGenerate = useCallback(
  (count: 2 | 3 | 5) => {
    setGenerateDialogOpen(false);
    setCandidateCount(count);
    void performAutoGenerate({ candidateCount: count });
  },
  [performAutoGenerate],
);
```

- In the header, remove `candidateCount={candidateCount}` and `onCandidateCountChange={setCandidateCount}` from `<AutoGenerateButton>`; keep `onClick={handleAutoGenerate}` and all existing disabled/progress props.
- Render `<AutoGenerateOptionsDialog open={generateDialogOpen} count={candidateCount} onClose={() => setGenerateDialogOpen(false)} onGenerate={handleConfirmGenerate} />` near the other modals, outside the chooser condition.
- Leave `performAutoGenerate({ acknowledgeUnplottedMinors: true })` in the blocked-minors modal unchanged; it now uses the persisted page count.

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/auto-schedule/auto-generate-candidates.test.ts src/features/timetable/auto-generate-candidate-wiring.test.ts`  
Expected: PASS, including the new dialog and wiring tests.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/timetable/auto-schedule/auto-generate.utils.tsx apps/frontend/src/features/timetable/TimetablePage.tsx apps/frontend/src/features/timetable/auto-generate-candidate-wiring.test.ts
git commit -m "refactor: open generate options before scheduling" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 3: Move Browser E2E count selection into the dialog

**Files:**
- Modify: `e2e/specs/auto-generate-candidates.spec.ts`

**Interfaces:**
- Dialog role name: **Generate options**.
- Radio group legend: **Number of schedule options to generate**.
- Radio accessible names: `2`, `3`, `5`.
- Dialog buttons: **Cancel**, **Generate**.
- `generationResponse(page)` and `confirmResponse(page)` helpers stay unchanged.

- [ ] **Step 1: Replace the header-select interaction**

Remove:

```ts
await page
  .getByLabel('Number of schedule options to generate')
  .selectOption('3');
await expect(
  page.getByLabel('Number of schedule options to generate'),
).toHaveValue('3');
```

Replace it with a cancel/reopen check followed by generation through the dialog:

```ts
await page.getByRole('button', { name: 'Auto-Generate' }).click();
const cancelledDialog = page.getByRole('dialog', { name: 'Generate options' });
await expect(cancelledDialog).toBeVisible();
await cancelledDialog.getByRole('radio', { name: '5', exact: true }).check();
await cancelledDialog.getByRole('button', { name: 'Cancel' }).click();
await expect(cancelledDialog).toBeHidden();
await expect(
  page.getByRole('heading', { name: 'Generated schedule options' }),
).toBeHidden();

await page.getByRole('button', { name: 'Auto-Generate' }).click();
const firstDialog = page.getByRole('dialog', { name: 'Generate options' });
await expect(firstDialog).toBeVisible();
await expect(
  firstDialog.getByRole('radio', { name: '3', exact: true }),
).toBeChecked();

const firstGeneration = generationResponse(page);
await firstDialog.getByRole('radio', { name: '3', exact: true }).check();
await firstDialog.getByRole('button', { name: 'Generate' }).click();
await expect(firstDialog).toBeHidden();
const generated = await firstGeneration;
```

- [ ] **Step 2: Update the second generation interaction**

Replace:

```ts
const secondGeneration = generationResponse(page);
await page.getByRole('button', { name: 'Auto-Generate' }).click();
const regenerated = await secondGeneration;
```

with:

```ts
const secondGeneration = generationResponse(page);
await page.getByRole('button', { name: 'Auto-Generate' }).click();
const secondDialog = page.getByRole('dialog', { name: 'Generate options' });
await expect(secondDialog).toBeVisible();
await expect(
  secondDialog.getByRole('radio', { name: '3', exact: true }),
).toBeChecked();
await secondDialog.getByRole('button', { name: 'Generate' }).click();
await expect(secondDialog).toBeHidden();
const regenerated = await secondGeneration;
```

Keep every existing assertion about the read-only chooser, foreign-department canary, overwrite confirmation, accept-time writes, and Current no-op unchanged.

- [ ] **Step 3: Verify E2E collection**

Run: `pnpm test:e2e:list`  
Expected: PASS; `auto-generate-candidates.spec.ts` is still collected. Do not run local browser E2E because the local Supabase project is dead.

- [ ] **Step 4: Run full verification**

Run each command separately:

```bash
pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/auto-schedule/auto-generate-candidates.test.ts src/features/timetable/auto-generate-candidate-wiring.test.ts
pnpm test
pnpm typecheck
pnpm typecheck:e2e
pnpm test:e2e:list
```

Expected: all pass. CI Browser E2E remains the authoritative behavioral check.

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/auto-generate-candidates.spec.ts
git commit -m "test: drive generation through options dialog" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```
