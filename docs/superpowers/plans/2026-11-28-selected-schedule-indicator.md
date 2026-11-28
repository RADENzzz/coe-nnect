# Selected Schedule Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make selected timetable rows show a persistent, clearly visible outline in both grid and agenda views.

**Architecture:** Fix the root cause in `ClassBlock` by removing the `focus:outline-none` utility that overrides the selected outline when a clicked row receives focus. Keep the existing focus-visible ring for keyboard users, strengthen the selected outline to a 3px primary outline with a 2px offset, and raise selected rows above neighbors so the offset is not clipped by sibling stacking.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS, Node's built-in test runner, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-28-selected-schedule-indicator-design.md`

## Global Constraints

- Frontend-only class and inline-style changes; no backend, schema, migration, or endpoint changes.
- Keep the existing `primary` token and all current `data-tour` values.
- Do not change selection state, status locking, bulk actions, feedback messages, deep links, or tours.
- Use global `useFeedback()` only for bulk results; no new local success/failure state.
- Source-regex tests are the repo convention here and are allowed under the standing CI-Browser-E2E ruling; local browser E2E stays skipped because `e2e/.env.local` points at a dead Supabase project.
- Commit subjects must not use `feat` or `chore`, must not end with `:`, and include `Co-authored-by: trynotybort <trynotybort@gmail.com>`.
- Do not stage `.superpowers/`, `final-review.diff`, unrelated docs plans/specs, `docs/integrations/idp-request-change-update.md`, or the uncommitted `e2e/specs/published-version.spec.ts`.

## Review Focus

- **Focus override:** clicking a focusable grid block to select it must not paint the selected outline transparent. Task 1 pins this with `assert.doesNotMatch(classBlock, /focus:outline-none/)`.
- **Keyboard focus indicator:** removing `focus:outline-none` must not remove the existing white focus-visible ring. Task 1 pins the retained `focus-visible:ring-2 ... ring-white` classes.
- **Outline visibility:** the selected outline must be 3px, use `primary`, and have a 2px offset in both row surfaces. Task 1 pins the exact class sequence on `classBlock` and `agendaCard`.
- **Stacking:** a selected grid block must draw above neighbors, but dragging must still win. Task 1 pins `zIndex: dragging ? 9999 : selected ? 3 : 1`.
- **Agenda consistency:** agenda selected cards must use the same visible outline and be positioned so the offset can draw above adjacent cards. Task 1 pins `relative z-10` plus the outline classes on `agendaCard`.

---

### Task 1: Make the selected outline survive focus and draw above neighbors

**Files:**
- Modify: `apps/frontend/src/features/timetable/components/ClassBlock.tsx:107-119,193-203,254-264`
- Modify: `apps/frontend/src/features/timetable/views/AgendaClassCard.tsx:40-45`
- Test: `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`

**Interfaces:**
- Consumes: existing `selected`, `dragging`, `classBlock`, and `agendaCard` source strings in the test file.
- Produces: no new exports. The selected grid block uses z-index 3; dragging remains 9999.

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts`:

```ts
test('selected grid blocks keep their outline while focused', () => {
  assert.doesNotMatch(classBlock, /focus:outline-none/);
  assert.match(classBlock, /focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-white/);
  assert.match(classBlock, /outline-\[3px\] outline-primary outline-offset-2/);
  assert.match(classBlock, /zIndex: dragging \? 9999 : selected \? 3 : 1/);
});

test('selected agenda cards use the same visible outline', () => {
  assert.match(agendaCard, /selected && 'relative z-10 outline outline-\[3px\] outline-primary outline-offset-2'/);
  assert.doesNotMatch(agendaCard, /outline outline-2 outline-primary/);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: FAIL on `focus:outline-none` still present and the missing 3px outline/z-index assertions.

- [ ] **Step 3: Fix the grid block**

In `ClassBlock.tsx`:

- In the `style` object, change `zIndex: dragging ? 9999 : 1` to `zIndex: dragging ? 9999 : selected ? 3 : 1`.
- In both `clsx(...)` blocks (tiny and normal variants), remove `focus:outline-none` from the focus class string while keeping `focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-white focus-visible:ring-offset-surface-container-lowest`.
- In both blocks, replace `selected && 'outline outline-2 outline-primary'` with `selected && 'outline outline-[3px] outline-primary outline-offset-2'`.

- [ ] **Step 4: Fix the agenda card**

In `AgendaClassCard.tsx`, replace the outer wrapper's `selected && 'outline outline-2 outline-primary'` with `selected && 'relative z-10 outline outline-[3px] outline-primary outline-offset-2'`. Keep every other class and the checkbox unchanged.

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/multi-select-bulk-actions.test.ts`

Expected: PASS.

- [ ] **Step 6: Run full verification**

Run: `pnpm typecheck && pnpm typecheck:e2e && pnpm test && pnpm test:e2e:list`

Expected: all commands exit 0; frontend, constraint-rules, and backend tests pass; E2E list succeeds. Local browser E2E remains skipped by the standing environment ruling.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-11-28-selected-schedule-indicator-design.md docs/superpowers/plans/2026-11-28-selected-schedule-indicator.md apps/frontend/src/features/timetable/components/ClassBlock.tsx apps/frontend/src/features/timetable/views/AgendaClassCard.tsx apps/frontend/src/features/timetable/multi-select-bulk-actions.test.ts
git commit -m "Make selected schedule outlines visible

Co-authored-by: trynotybort <trynotybort@gmail.com>"
```
