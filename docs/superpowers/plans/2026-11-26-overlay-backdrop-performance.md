# Overlay Backdrop Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unconditional full-viewport blur from overlay scrims while keeping the glass theme’s frosted dialogs.

**Architecture:** Tailwind’s unconditional `backdrop-blur-*` utilities are replaced by two marker classes. `globals.css` applies 2px/4px `backdrop-filter` only under `html.glass`, so non-glass themes get a cheap dim scrim. The shared `Modal` helper and all direct overlay layers migrate to the markers without changing tint, fade, panel motion, focus, or stack behavior.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vite, `node:test`, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-26-overlay-backdrop-performance-design.md`

## Global Constraints

- No commit, push, merge, or PR. HEAD stays `9e6739f443cea6783f8d8cc9a59bcf888e65907a`.
- Execute with subagent-driven development in the current checkout; no worktree.
- Capture a `baseline/` snapshot before Task 1 edits; review via scoped diffs from that snapshot, never commit ranges.
- Each task that creates a test file registers it in `apps/frontend/package.json` in that same task.
- Overlay blur strengths in glass theme remain exactly 2px and 4px.
- Keep every overlay’s existing dark tint, `animate-backdrop-in`, panel motion, z-index, and focus behavior.
- Do not touch `html.glass` card/sidebar blur, `.liquid-blob`, tour spotlight/popover, sticky-header blur, or other decorative filters.
- Add `-webkit-backdrop-filter` beside every new `backdrop-filter`.
- Automated source tests cannot prove frame rate; a human browser check in both non-glass and glass themes is required before calling the work done.

## Review Focus

- **Glass theme active:** overlay blur must still be 2px/4px — pinned in Task 1 Step 2 CSS assertions.
- **Non-glass theme with preserved motion:** no overlay scrim may have an unconditional `backdrop-blur-*` utility, and `bg-black/...`/`animate-backdrop-in` must remain — pinned in Task 1 Step 2 and Tasks 2–3 Step 1.
- **Chat and inbox specifically:** both z-45 scrims must use the 2px marker — pinned in Task 2 Step 1.
- **Two scrims in one component:** `PlotSubjectModal.tsx` has both an outer and nested blurred layer; both must migrate — pinned in Task 4 Step 1 by the zero-literal-blur count.
- **Decorative blur must survive:** `UserDetailDrawer.tsx:102` keeps its avatar blur while its scrim migrates — pinned by the allowed-count of 1 in Task 4 Step 1.

---

### Task 1: Shared modal backdrop and glass-theme CSS gate

**Files:**
- Modify: `apps/frontend/src/components/ui/modal-backdrop.ts`
- Modify: `apps/frontend/src/components/ui/modal-backdrop.test.ts`
- Modify: `apps/frontend/src/components/ui/Modal.tsx`
- Modify: `apps/frontend/src/features/import/components/MajorMinorClassifier.tsx`
- Modify: `apps/frontend/src/features/import/components/ImportProspectusDialog.tsx`
- Modify: `apps/frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: none.
- Produces: `getModalBackdropClassName(): string`, returning `absolute inset-0 bg-black/60 animate-backdrop-in overlay-backdrop-blur-sm`.
- Produces: `overlay-backdrop-blur-xs` and `overlay-backdrop-blur-sm` marker classes, styled only under `html.glass` in `globals.css`.

- [ ] **Step 1: Capture the baseline snapshot**

Create `.superpowers/sdd/2026-11-26-overlay-backdrop-performance/baseline/` and copy every pre-existing file listed in this plan into it at its repository-relative path. Record the current HEAD in `.superpowers/sdd/2026-11-26-overlay-backdrop-performance/progress.md`. Do not commit.

- [ ] **Step 2: Write the failing test**

Replace `apps/frontend/src/components/ui/modal-backdrop.test.ts` with:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as modalBackdrop from './modal-backdrop.ts';

test('modal backdrop defers blur to the glass theme', () => {
  const getClassName = Reflect.get(modalBackdrop, 'getModalBackdropClassName');
  assert.equal(typeof getClassName, 'function');
  if (typeof getClassName !== 'function') return;

  const className = Reflect.apply(getClassName, null, []);
  assert.match(className, /absolute inset-0 bg-black\/60/);
  assert.match(className, /animate-backdrop-in/);
  assert.match(className, /overlay-backdrop-blur-sm/);
  assert.doesNotMatch(className, /(?:^|\s)backdrop-blur-/);

  const css = readFileSync(
    new URL('../../styles/globals.css', import.meta.url),
    'utf8',
  );
  const rules = [
    ['html.glass .overlay-backdrop-blur-xs', '2px'],
    ['html.glass .overlay-backdrop-blur-sm', '4px'],
  ] as const;

  for (const [selector, amount] of rules) {
    const start = css.indexOf(selector);
    assert.notEqual(start, -1, `${selector} must exist`);
    const rule = css.slice(start, css.indexOf('}', start));
    assert.match(
      rule,
      new RegExp(`-webkit-backdrop-filter:\\s*blur\\(${amount}\\)`),
    );
    assert.match(rule, new RegExp(`backdrop-filter:\\s*blur\\(${amount}\\)`));
  }
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/components/ui/modal-backdrop.test.ts`

Expected: FAIL because `overlay-backdrop-blur-sm` and the two `html.glass` rules do not exist.

- [ ] **Step 4: Change the helper signature and body**

In `apps/frontend/src/components/ui/modal-backdrop.ts`, change `getModalBackdropClassName()` to take no parameters and return exactly:

```ts
'absolute inset-0 bg-black/60 animate-backdrop-in overlay-backdrop-blur-sm'
```

- [ ] **Step 5: Remove the obsolete Modal prop**

In `apps/frontend/src/components/ui/Modal.tsx`, remove `blurBackdrop?: boolean` from `ModalProps`, remove `blurBackdrop = true` from the destructured props, and change the backdrop call to `className={getModalBackdropClassName()}`. Remove `blurBackdrop={false}` from `MajorMinorClassifier.tsx` and `ImportProspectusDialog.tsx`.

- [ ] **Step 6: Add the glass-gated CSS rules**

In `apps/frontend/src/styles/globals.css`, next to the existing `html.glass` rules, add:

```css
/* Overlay scrims are plain dims outside glass; only glass keeps frosting. */
html.glass .overlay-backdrop-blur-xs {
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

html.glass .overlay-backdrop-blur-sm {
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}
```

- [ ] **Step 7: Run the focused test and typecheck**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/components/ui/modal-backdrop.test.ts`

Expected: PASS.

Run: `pnpm --filter @coe-nnect/frontend typecheck`

Expected: PASS, proving the removed prop left no callers.

---

### Task 2: Chat and notification inbox scrims

**Files:**
- Modify: `apps/frontend/src/features/chat/ChatDrawer.tsx`
- Modify: `apps/frontend/src/components/notifications/NotificationBell.tsx`
- Create: `apps/frontend/src/features/chat/chat-backdrop.test.ts`
- Modify: `apps/frontend/package.json`

**Interfaces:**
- Consumes: `overlay-backdrop-blur-xs` from Task 1.
- Produces: no new runtime API.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/chat/chat-backdrop.test.ts` with:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const targets = [
  ['./ChatDrawer.tsx', 'overlay-backdrop-blur-xs'],
  ['../../components/notifications/NotificationBell.tsx', 'overlay-backdrop-blur-xs'],
] as const;

test('chat and inbox scrims defer blur to the glass theme', () => {
  for (const [relativePath, marker] of targets) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /["'\s]backdrop-blur-/);
    assert.match(source, new RegExp(marker));
    assert.match(source, /bg-black\//);
    assert.match(source, /animate-backdrop-in/);
  }
});
```

Register `src/features/chat/chat-backdrop.test.ts` in the `apps/frontend/package.json` `test` script after `src/components/ui/modal-backdrop.test.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/chat/chat-backdrop.test.ts`

Expected: FAIL because both files still contain `backdrop-blur-[2px]`.

- [ ] **Step 3: Replace the two blur utilities**

In `ChatDrawer.tsx` and `NotificationBell.tsx`, replace `backdrop-blur-[2px]` with `overlay-backdrop-blur-xs`. Leave the surrounding `bg-black/40`/`bg-black/30` and `animate-backdrop-in` classes unchanged.

- [ ] **Step 4: Run the focused test**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/chat/chat-backdrop.test.ts`

Expected: PASS.

---

### Task 3: Sheet and dialog scrims

**Files:**
- Modify: `apps/frontend/src/components/ui/BottomSheet.tsx`
- Modify: `apps/frontend/src/features/auth/LoginPage.tsx`
- Modify: `apps/frontend/src/features/auth/components/SystemStatusBanner.tsx`
- Modify: `apps/frontend/src/features/timetable/components/ScheduleDetailDrawer.tsx`
- Create: `apps/frontend/src/components/ui/overlay-backdrop-panels.test.ts`
- Modify: `apps/frontend/package.json`

**Interfaces:**
- Consumes: `overlay-backdrop-blur-xs` from Task 1.
- Produces: no new runtime API.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/components/ui/overlay-backdrop-panels.test.ts` with:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const targets = [
  './BottomSheet.tsx',
  '../../features/auth/LoginPage.tsx',
  '../../features/auth/components/SystemStatusBanner.tsx',
  '../../features/timetable/components/ScheduleDetailDrawer.tsx',
] as const;

test('sheet and dialog scrims defer blur to the glass theme', () => {
  for (const relativePath of targets) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /["'\s]backdrop-blur-/);
    assert.match(source, /overlay-backdrop-blur-xs/);
    assert.match(source, /bg-black\//);
    assert.match(source, /animate-backdrop-in/);
  }
});
```

Register `src/components/ui/overlay-backdrop-panels.test.ts` in the `apps/frontend/package.json` `test` script after `src/features/chat/chat-backdrop.test.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/components/ui/overlay-backdrop-panels.test.ts`

Expected: FAIL because the four files still contain `backdrop-blur-[2px]`.

- [ ] **Step 3: Replace the blur utilities**

In all four files, replace `backdrop-blur-[2px]` with `overlay-backdrop-blur-xs`. Leave each `bg-black/...` and `animate-backdrop-in` class unchanged.

- [ ] **Step 4: Run the focused test**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/components/ui/overlay-backdrop-panels.test.ts`

Expected: PASS.

---

### Task 4: Custom modal and detail-panel scrims

**Files:**
- Modify: all files listed in the `targets` array below
- Create: `apps/frontend/src/components/ui/overlay-backdrop-custom.test.ts`
- Modify: `apps/frontend/package.json`

**Interfaces:**
- Consumes: `overlay-backdrop-blur-sm` from Task 1.
- Produces: no new runtime API.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/components/ui/overlay-backdrop-custom.test.ts` with:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const targets = [
  ['../../features/plot-subject/PlotSubjectModal.tsx', 0],
  ['../../features/timetable/auto-schedule/SolverLiveBoard.tsx', 0],
  ['../../features/timetable/components/StackPicker.tsx', 0],
  ['../../features/help/components/GifCard.tsx', 0],
  ['../../features/import/components/PdfCanvas.tsx', 0],
  ['../../features/dashboard/components/UserDetailDrawer.tsx', 1],
  ['../../features/faculty/components/FacultyDetailPanel.tsx', 0],
  ['../../features/rooms/components/RoomDetailPanel.tsx', 0],
  ['../../features/subjects/components/SubjectDetailPanel.tsx', 0],
  ['../../features/prospectus/components/ProspectusDetailPanel.tsx', 0],
  ['../../features/admin/components/UserDrawer.tsx', 0],
] as const;

test('custom overlay scrims defer blur to the glass theme', () => {
  for (const [relativePath, allowedDecorativeBlur] of targets) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    const literalBlurCount =
      source.match(/["'\s]backdrop-blur-/g)?.length ?? 0;
    assert.equal(literalBlurCount, allowedDecorativeBlur);
    assert.match(source, /overlay-backdrop-blur-sm/);
  }
});
```

Register `src/components/ui/overlay-backdrop-custom.test.ts` in the `apps/frontend/package.json` `test` script after `src/components/ui/overlay-backdrop-panels.test.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/components/ui/overlay-backdrop-custom.test.ts`

Expected: FAIL because the files still contain `backdrop-blur-sm`.

- [ ] **Step 3: Replace every blur utility**

In all target files, replace only the overlay-scrim `backdrop-blur-sm` occurrences with `overlay-backdrop-blur-sm`. `PlotSubjectModal.tsx` has two scrims; replace both. In `UserDetailDrawer.tsx`, replace only the full-screen scrim at line 75 and leave the avatar blur at line 102 unchanged. Leave all backgrounds, animations, panel classes, and z-index unchanged.

- [ ] **Step 4: Run the focused test**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/components/ui/overlay-backdrop-custom.test.ts`

Expected: PASS.

---

### Task 5: Whole-plan verification and handoff record

**Files:**
- Create: `.superpowers/sdd/2026-11-26-overlay-backdrop-performance/progress.md` already started in Task 1; update it here.
- Create: `.superpowers/sdd/2026-11-26-overlay-backdrop-performance/review-final.diff`

**Interfaces:**
- Consumes: all four focused test files and the Task 1 baseline snapshot.
- Produces: no source API.

- [ ] **Step 1: Run all overlay focused tests**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/components/ui/modal-backdrop.test.ts src/features/chat/chat-backdrop.test.ts src/components/ui/overlay-backdrop-panels.test.ts src/components/ui/overlay-backdrop-custom.test.ts`

Expected: 4 tests, 4 pass, 0 fail.

- [ ] **Step 2: Run frontend gates**

Run each command separately and require exit code 0:

```powershell
pnpm --filter @coe-nnect/frontend typecheck
pnpm --filter @coe-nnect/frontend test
pnpm --filter @coe-nnect/frontend build
```

Expected: typecheck clean, all registered frontend tests pass, build succeeds. Record the pre-existing `>500 kB` chunk warning as pre-existing, not a regression.

- [ ] **Step 3: Run workspace gates**

Run each command separately and require exit code 0:

```powershell
pnpm typecheck
pnpm test
```

Expected: all workspace typechecks/tests pass.

- [ ] **Step 4: Generate the scoped review package**

Using the Task 1 `baseline/` snapshot and the current working tree, generate `review-final.diff` with one section per modified file and added-file sections for the three new tests. Do not use `git diff` between commits.

- [ ] **Step 5: Record handoff state**

In `progress.md`, record: findings/fixes per task, focused and full verification results, HEAD unchanged, no commits, and the outstanding human browser check for both non-glass and glass themes.
