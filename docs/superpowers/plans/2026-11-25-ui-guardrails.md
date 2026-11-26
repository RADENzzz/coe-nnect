# UI Guardrails and Page Help Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent destructive mistakes and make the existing tour system reachable from every page, without adding a second help system.

**Architecture:** One shared confirmation dialog with a typed-confirmation mode, one form-error summary component, and a header help button that resolves the current route to an existing tour. The six long forms validate on blur and report every problem in one place instead of disabling submit silently.

**Tech Stack:** React + Vite, TanStack Query, the existing `Modal` and tutorial store, Node's built-in test runner for pure validators.

**Spec:** `docs/superpowers/specs/2026-11-25-dynamic-semesters-and-guardrails-design.md`

**Depends on:** `docs/superpowers/plans/2026-11-25-dynamic-semester-types.md` (creates `ConfirmDialog` and the semester panel). If that plan has not landed, create `ConfirmDialog` here first.

## Global Constraints

- Commit messages are plain descriptive sentences. No `feat:`, `fix:`, or `chore:` prefixes.
- Reuse `Modal`, `lockBodyScroll`, `useFeedback`, `useTutorialStore`, and `getTourForPath`. Do not add a second modal, toast, or tour engine.
- No action that already confirms loses its confirmation.
- The submit button stays enabled unless a request is in flight. Invalid input is reported, not hidden behind a dead button.
- Frontend verification from `apps/frontend`: `pnpm typecheck`, `pnpm test`.

## Review Focus

1. **Bulk delete with one item selected.** A single-row delete must still be quick; the typed confirmation only appears for multi-row actions and the explicitly listed high-impact ones.
2. **Cancel is the default focus.** Pressing Enter in a confirmation must not destroy anything.
3. **Read-only role.** Write controls are disabled with a reason, not hidden behind a submit that fails.
4. **Tour for an unmapped route.** The help button says so instead of opening an unrelated tour.
5. **First-visit offer noise.** It appears once per tour per browser and never while another tour is running.

---

### Task 1: Shared confirmation and error summary

**Files:**
- Modify: `apps/frontend/src/components/ui/ConfirmDialog.tsx`
- Create: `apps/frontend/src/components/ui/FormErrorSummary.tsx`
- Create: `apps/frontend/src/components/ui/form-errors.ts`

**Interfaces:**
- `ConfirmDialog` props add `requireText?: string`.
- `FormErrorSummary` props: `{ errors: FieldError[]; onJump?: (field: string) => void }`.
- `FieldError`: `{ field: string; message: string }`.

- [ ] **Step 1: Add typed confirmation**

When `requireText` is set, render an input labelled `Type "<requireText>" to confirm`. The confirm button is disabled until `value.trim() === requireText`. Reset the input whenever the dialog opens or `requireText` changes. Keep Cancel focused by default and keep both buttons disabled while `busy`.

- [ ] **Step 2: Build `FormErrorSummary`**

Render nothing when `errors.length === 0`. Otherwise render a red panel with:

- A heading: `Fix N thing(s) before continuing`.
- A list of buttons, one per error, labelled with the message.
- Clicking a button calls `onJump(field)`.

`form-errors.ts` exports the `FieldError` type and:

```ts
export function mergeFieldError(
  errors: FieldError[],
  field: string,
  message: string,
): FieldError[];
export function clearFieldError(errors: FieldError[], field: string): FieldError[];
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/ui/ConfirmDialog.tsx apps/frontend/src/components/ui/FormErrorSummary.tsx apps/frontend/src/components/ui/form-errors.ts
git commit -m "Add typed confirmations and a shared form error summary"
```

---

### Task 2: Confirmation audit

**Files:**
- Modify: `apps/frontend/src/features/system-config/components/TermsPanel.tsx`
- Modify: `apps/frontend/src/features/programs/ProgramsPage.tsx`
- Modify: `apps/frontend/src/features/prospectus/ProspectusPage.tsx`
- Modify: `apps/frontend/src/features/subjects/SubjectsPage.tsx`
- Modify: `apps/frontend/src/features/sections/SectionsPage.tsx`
- Modify: `apps/frontend/src/features/faculty/FacultyPage.tsx`
- Modify: `apps/frontend/src/features/rooms/RoomsPage.tsx`
- Modify: `apps/frontend/src/features/admin/AdminUsersPage.tsx`
- Modify: `apps/frontend/src/features/import/ProspectusPdfListPage.tsx`
- Modify: `apps/frontend/src/features/timetable/TimetablePage.tsx`
- Modify: `apps/frontend/src/features/settings/components/AppearanceSettingsTab.tsx`

**Interfaces:**
- Consumes: `ConfirmDialog` with `tone` and `requireText`.

- [ ] **Step 1: Audit each surface**

For every action in the table, record whether it currently confirms and what it says. Add a confirmation only where it is missing. Use Standard unless the table says Typed.

| Surface | Action | Level |
| --- | --- | --- |
| Terms | Delete term | Typed: term name |
| Terms | Deactivate the active term | Typed: `DEACTIVATE` |
| Programs | Delete program | Typed: program code |
| Prospectus | Bulk remove rows | Typed when more than one row; Standard for one |
| Prospectus | Delete a slot or mapping | Standard |
| Subjects | Delete subject | Standard |
| Subjects | Bulk delete | Typed when more than one row |
| Subjects | Deactivate a subject with active mappings | Standard, description names the mapping count |
| Sections | Delete section | Standard |
| Sections | Bulk delete | Typed when more than one row |
| Faculty | Delete or deactivate | Standard |
| Faculty | Change role | Standard, description names the new role |
| Rooms | Delete room | Standard |
| Admin users | Deactivate, delete, change role | Standard |
| Import | Discard draft, delete PDF, overwrite tables | Standard |
| Timetable | Unfinalize, discard auto-generate, clear drafts | Standard |
| Settings | Reset appearance | Standard |

- [ ] **Step 2: Apply the rule**

Every dialog names the object and the consequence in one sentence. The confirm button repeats the verb (`Delete subject`, not `OK`). Cancel is the default focus. The danger tone is used for anything destructive.

- [ ] **Step 3: Manual verification**

Walk the table. Each action opens a dialog, names the object, and Cancel does nothing. Bulk actions require typing only when more than one row is selected. The active-term deactivation cannot be confirmed without typing `DEACTIVATE`.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features
git commit -m "Confirm every destructive action and require typing for high-impact ones"
```

---

### Task 3: Long-form validation

**Files:**
- Create: `apps/frontend/src/features/prospectus/utils/validate-prospectus-form.ts`
- Create: `apps/frontend/src/features/prospectus/utils/validate-prospectus-form.test.ts`
- Modify: `apps/frontend/package.json` (`test` script: add the new test file)
- Modify: `apps/frontend/src/features/prospectus/components/ProspectusFormModal.tsx`
- Modify: `apps/frontend/src/features/import/components/ImportProspectusDialog.tsx`
- Modify: `apps/frontend/src/features/subjects/components/SubjectFormModal.tsx`
- Modify: `apps/frontend/src/features/system-config/components/TermsPanel.tsx`
- Modify: `apps/frontend/src/features/rooms/components/RoomFormModal.tsx`
- Modify: `apps/frontend/src/features/sections/SectionsPage.tsx`

**Interfaces:**
- Produces: `validateProspectusForm(input): FieldError[]`.

- [ ] **Step 1: Write the failing validator test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProspectusForm } from './validate-prospectus-form.ts';

const valid = {
  programId: '1',
  subjectId: '2',
  yearLevel: '3',
  semester: '1st',
  lectureSessionsPerWeek: '2',
  lectureMinutesPerSession: '90',
  labSessionsPerWeek: '1',
  labMinutesPerSession: '180',
};

test('accepts a complete placement', () => {
  assert.deepEqual(validateProspectusForm(valid), []);
});

test('reports every missing required field at once', () => {
  const errors = validateProspectusForm({
    ...valid,
    programId: '',
    subjectId: '',
    semester: '',
  });
  assert.deepEqual(errors.map((e) => e.field).sort(), ['programId', 'semester', 'subjectId']);
});

test('rejects out-of-range sessions and minutes', () => {
  const errors = validateProspectusForm({
    ...valid,
    lectureSessionsPerWeek: '0',
    labSessionsPerWeek: '4',
    lectureMinutesPerSession: '15',
    labMinutesPerSession: '400',
  });
  assert.deepEqual(
    errors.map((e) => e.field).sort(),
    ['labMinutesPerSession', 'labSessionsPerWeek', 'lectureMinutesPerSession', 'lectureSessionsPerWeek'],
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test src/features/prospectus/utils/validate-prospectus-form.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the validator**

Rules: program, subject, year (1–6), and semester are required; lecture sessions 1–5, lecture minutes 30–240, lab sessions 1–3, lab minutes 60–300. Messages are short and actionable, for example `Choose a program.` and `Lecture minutes must be between 30 and 240.`

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test src/features/prospectus/utils/validate-prospectus-form.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Wire the forms**

For each listed form:

- Add `const [errors, setErrors] = useState<FieldError[]>([])`.
- On submit, run the validator. If it returns errors, `setErrors`, render `<FormErrorSummary>`, scroll it into view, and return without calling the mutation.
- On field change, remove that field's error.
- Give each input an `id` matching the error's `field` so `onJump` can `document.getElementById(field)?.focus()`.
- Do not disable submit for invalid input.

`ImportProspectusDialog` also blocks Import while a regular table's semester is not in the catalog, using the same summary.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: no errors, validator tests pass.

Manual: submit the prospectus form empty; the summary lists program, subject, year, and semester, and clicking a message focuses that field.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/prospectus apps/frontend/src/features/import apps/frontend/src/features/subjects apps/frontend/src/features/system-config apps/frontend/src/features/rooms apps/frontend/src/features/sections apps/frontend/package.json
git commit -m "Validate long forms in one place before submit"
```

---

### Task 4: Page help button and first-visit offer

**Files:**
- Create: `apps/frontend/src/features/help/components/PageHelpButton.tsx`
- Modify: `apps/frontend/src/components/layout/TopBar.tsx`
- Modify: `apps/frontend/src/features/tutorial/TutorialProvider.tsx` (only if the offer needs to defer to the welcome modal)

**Interfaces:**
- Consumes: `getTourForPath(pathname, role)` and `useTutorialStore.startTour`.
- Produces: a header button and a one-time offer card.

- [ ] **Step 1: Build the button**

- Use `useLocation()` and the signed-in role.
- Resolve `getTourForPath(location.pathname, role)`.
- Render an icon button with `aria-label="Page help"` and `title="Help for this page"`.
- Clicking opens a small popover with:
  - `Take a tour of this page` — disabled with `No tour for this page yet` when no tour matches.
  - `Open the Help page` — navigates to `/help`.
  - `What's new` — navigates to `/help#version`.
- Close on Escape and on outside click. Use the existing popover styling from the notification bell.

- [ ] **Step 2: Add the first-visit offer**

On route change, if a tour matches, the tour has at most five steps, no tour is active, and `localStorage['coe-nnect:tour-offered:<tourId>']` is unset:

- Show a small card anchored under the button: `New here? Take a 30-second tour of this page.` with **Start** and **Dismiss**.
- Start calls `startTour(tour.id)` and sets the flag.
- Dismiss sets the flag.
- Never show it on `/` or while the welcome modal is open.

- [ ] **Step 3: Mount it**

In `TopBar.tsx`, render `<PageHelpButton />` next to `<NotificationBell />` in both the mobile group and the desktop group (the two `data-tour="notifications"` wrappers).

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: no errors.

Manual: open Prospectus, click `?`, start the tour. Open a route without a tour (for example a dev-tools page); the tour item is disabled. Clear localStorage and reload; the offer appears once.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/help/components/PageHelpButton.tsx apps/frontend/src/components/layout/TopBar.tsx apps/frontend/src/features/tutorial/TutorialProvider.tsx
git commit -m "Add page-level help and a one-time tour offer"
```

---

### Task 5: Full verification

- [ ] **Step 1: Frontend checks**

From `apps/frontend`:

```bash
pnpm typecheck
pnpm test
```

Expected: no type errors, all tests pass.

- [ ] **Step 2: Manual checklist**

- Every row in the Task 2 table opens a confirmation and Cancel is safe.
- The prospectus empty submit lists every problem and jumps to the field.
- The import review blocks on an unrecognized semester.
- The header `?` resolves the current page's tour.
- The first-visit offer appears once and does not stack with the welcome modal.
- Read-only roles see disabled write controls with a reason.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "Fix issues found while verifying the guardrails pass"
```

Only commit when the checklist surfaced a change.
