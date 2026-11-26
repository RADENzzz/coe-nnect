# Global Feedback Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered inline success/error messages with one top-center, timed, sounded popup used across the whole app.

**Architecture:** Reuse and rewrite the existing `FeedbackToast` provider as a single-item queue rendered in a portal above all content. Add a shared API-error normalizer, extend the existing Web Audio preference store with feedback sounds, move the provider to the app root, migrate transient result messages to `useFeedback()`, and add the missing duplicate-code conflict on subject update.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Node test runner, Jest/NestJS backend, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-11-25-global-feedback-popup-design.md`

## Global Constraints

- Do not commit, push, merge, or open a PR. All changes stay uncommitted.
- The popup is top-center, one visible at a time, queued, and auto-closes after `6000ms` by default.
- Success uses a chime; `error` and `failed` use the same warning tone.
- Keep the existing `FeedbackProvider` / `useFeedback()` names and `success`, `error`, `failed` methods.
- `FeedbackProvider` is mounted exactly once, in `App.tsx`; remove it from `AppShell.tsx`.
- Field-level validation, terminal verification screens, `SystemStatusBanner`, the realtime notification toaster, chat sounds, and PDF save-status indicators stay unchanged.
- No new audio files; sounds stay synthesised through `lib/sound.ts`.
- Exact error fallbacks: 400 `Invalid request.`, 403 `You do not have permission to do that.`, 404 `The requested item was not found.`, 409 `This conflicts with an existing record.`, 422 `Please check the entered values.`, 500 `Something went wrong on the server.`, 503 `The service is temporarily unavailable.`, network `Could not reach the server.`
- Run verification from the repo root with `pnpm typecheck` and `pnpm test`.

## Review Focus

- Stored sound preferences created before the new flag must still work — pinned by Task 2’s stored-preference migration test.
- A duplicate subject code during edit must become a readable `409`, not a generic `500` — pinned by Task 4’s conflict test.
- Rapid messages and a repeated `id` must not stack duplicate popups — pinned by Task 3’s queue and id-replacement source tests.
- The popup must remain visible above an open modal, pause while hovered/focused or tab hidden, and respect reduced motion for entrance animation without losing its countdown — pinned by Task 3’s portal, pause-state, and CSS source tests.
- Field-level validation and terminal screens must survive the migration — pinned by Task 5’s `errors` preservation assertions and Task 7’s `capError` / terminal `success` assertions.

---

### Task 1: Shared API error normalizer

**Files:**
- Create: `apps/frontend/src/lib/api-error.ts`
- Create: `apps/frontend/src/lib/api-error.test.ts`
- Modify: `apps/frontend/package.json:10`

**Interfaces:**
- Consumes: Axios-shaped errors with optional `response.status` and `response.data.message`/`response.data.error`.
- Produces: `extractApiError(error: unknown, fallback: string): string`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/lib/api-error.test.ts` with `node:test` assertions:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { extractApiError } from './api-error';

test('prefers a string response message', () => {
  assert.equal(
    extractApiError({ response: { status: 400, data: { message: 'Bad code' } } }, 'Fallback'),
    'Bad code',
  );
});

test('joins string-array response messages', () => {
  assert.equal(
    extractApiError(
      { response: { status: 422, data: { message: ['Code is required', 'Title is required'] } } },
      'Fallback',
    ),
    'Code is required, Title is required',
  );
});

test('uses exact status fallbacks', () => {
  const cases: Array<[number, string]> = [
    [400, 'Invalid request.'],
    [403, 'You do not have permission to do that.'],
    [404, 'The requested item was not found.'],
    [409, 'This conflicts with an existing record.'],
    [422, 'Please check the entered values.'],
    [500, 'Something went wrong on the server.'],
    [503, 'The service is temporarily unavailable.'],
  ];
  for (const [status, expected] of cases) {
    assert.equal(extractApiError({ response: { status, data: {} } }, 'Fallback'), expected);
  }
});

test('uses network and caller fallbacks', () => {
  assert.equal(extractApiError(new Error('Network Error'), 'Fallback'), 'Could not reach the server.');
  assert.equal(extractApiError({}, 'Fallback'), 'Fallback');
});
```

- [ ] **Step 2: Add the test to the frontend test script**

In `apps/frontend/package.json`, append `src/lib/api-error.test.ts` to the `test` script list.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend test`
Expected: FAIL because `./api-error` does not exist.

- [ ] **Step 4: Implement `extractApiError`**

In `apps/frontend/src/lib/api-error.ts`, implement the order from the spec: string `data.message`, joined array `data.message`, string `data.error`, exact status map, network fallback when `code === 'ERR_NETWORK'` or the error message is `Network Error`, then the caller fallback. Ignore empty/whitespace strings.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend test`
Expected: PASS.

---

### Task 2: Feedback sound preferences

**Files:**
- Modify: `apps/frontend/src/lib/sound.ts`
- Create: `apps/frontend/src/lib/sound.test.ts`
- Modify: `apps/frontend/package.json:10`

**Interfaces:**
- Consumes: existing `coe-nnect:sound-preferences` localStorage key.
- Produces: `SoundKind` includes `success` and `error`; `SoundPreferences.feedback: boolean`; `playSuccessSound(): void`; `playErrorSound(): void`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/lib/sound.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SOUND_PREFERENCES, getSoundPreferences, setSoundPreferences } from './sound';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  clear() { this.map.clear(); }
}

test('feedback sound defaults on and persists off', () => {
  (globalThis as any).localStorage = new MemoryStorage();
  assert.equal(getSoundPreferences().feedback, true);

  setSoundPreferences({ ...DEFAULT_SOUND_PREFERENCES, feedback: false });
  assert.equal(getSoundPreferences().feedback, false);
});

test('stored preferences without feedback keep the default', () => {
  (globalThis as any).localStorage = new MemoryStorage();
  (globalThis as any).localStorage.setItem(
    'coe-nnect:sound-preferences',
    JSON.stringify({ notifications: true, chat: false, volume: 0.4 }),
  );
  const prefs = getSoundPreferences();
  assert.equal(prefs.feedback, true);
  assert.equal(prefs.chat, false);
  assert.equal(prefs.volume, 0.4);
});
```

- [ ] **Step 2: Add the test to the frontend test script**

Append `src/lib/sound.test.ts` to the `test` script list in `apps/frontend/package.json`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend test`
Expected: FAIL on the missing `feedback` property.

- [ ] **Step 4: Extend the sound module**

In `apps/frontend/src/lib/sound.ts`:
- Add `'success' | 'error'` to `SoundKind`.
- Add `feedback: boolean` to `SoundPreferences`, default `true`.
- Read and write `feedback` from/to storage with `parsed.feedback !== false`.
- Reuse the notification chime shape for `success` and a shorter lower two-note shape for `error`.
- Export `playSuccessSound()` and `playErrorSound()`; both call the internal `play()` with `force: false`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend test`
Expected: PASS.

---

### Task 3: Top-center feedback popup provider

**Files:**
- Modify: `apps/frontend/src/components/ui/FeedbackToast.tsx`
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/components/layout/AppShell.tsx`
- Modify: `apps/frontend/src/styles/globals.css`
- Create: `apps/frontend/src/components/ui/feedback-popup.test.ts`
- Modify: `apps/frontend/package.json:10`

**Interfaces:**
- Consumes: `playSuccessSound()` and `playErrorSound()` from Task 2.
- Produces: unchanged `FeedbackProvider`, `useFeedback()`, `FeedbackApi`; `FeedbackOptions` gains `id?: string`.

- [ ] **Step 1: Write the failing source-contract test**

Create `apps/frontend/src/components/ui/feedback-popup.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('feedback popup renders as one top-center portal item', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  assert.match(source, /createPortal\(/);
  assert.match(source, /fixed left-1\/2/);
  assert.match(source, /role="alert"/);
  assert.match(source, /role="status"/);
  assert.match(source, /feedback-countdown/);
  assert.match(source, /queue/);
  assert.doesNotMatch(source, /sm:right-6/);
});

test('feedback popup calls the right sounds', () => {
  const source = read('apps/frontend/src/components/ui/FeedbackToast.tsx');
  assert.match(source, /playSuccessSound\(\)/);
  assert.match(source, /playErrorSound\(\)/);
});

test('provider is mounted once at the app root', () => {
  const app = read('apps/frontend/src/App.tsx');
  const shell = read('apps/frontend/src/components/layout/AppShell.tsx');
  assert.match(app, /<FeedbackProvider>/);
  assert.doesNotMatch(shell, /<FeedbackProvider>/);
});

test('countdown line animates outside reduced-motion suppression', () => {
  const css = read('apps/frontend/src/styles/globals.css');
  assert.match(css, /\.feedback-countdown\s*\{/);
  const reducedMotionBlock = css.slice(
    css.indexOf('@media (prefers-reduced-motion: reduce)'),
    css.indexOf('@media (prefers-reduced-motion: reduce)') + 1200,
  );
  assert.doesNotMatch(reducedMotionBlock, /\.feedback-countdown/);
});
```

- [ ] **Step 2: Add the test to the frontend test script**

Append `src/components/ui/feedback-popup.test.ts` to the `test` script list.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend test`
Expected: FAIL on portal, sound, or provider assertions.

- [ ] **Step 4: Rewrite `FeedbackToast.tsx`**

Implement in `apps/frontend/src/components/ui/FeedbackToast.tsx`:
- Keep `FeedbackVariant`, `FeedbackOptions`, `FeedbackApi`, `FeedbackProvider`, and `useFeedback()` exports.
- Add `id?: string` to `FeedbackOptions`.
- Hold `active: FeedbackItem | null` and `queue: FeedbackItem[]`; new messages enter the queue unless no active item exists.
- If a pushed item has an `id` matching the active item, replace it and restart its timer instead of queuing a duplicate.
- Default duration `6000`; clamp to at least `800`.
- Use a JS timer for dismissal and a separate CSS-animated countdown line; do not use `animationend` as the only dismissal path.
- Track `paused` from `onMouseEnter`/`onMouseLeave`, `onFocus`/`onBlur` on the banner, and `document.visibilitychange`; clear and restart the timer with the remaining milliseconds when paused/resumed.
- Portal one banner to `document.body` with `pointer-events-none fixed left-1/2` positioning, a centered transform, a `z-[220]` class, and `aria-live="polite"` on the region.
- Use `role="alert"` for `error`/`failed`, `role="status"` for `success`, and an `aria-label="Dismiss message"` close button.
- Call `playSuccessSound()` when a success becomes active and `playErrorSound()` when error/failed becomes active.

- [ ] **Step 5: Move the provider**

In `apps/frontend/src/App.tsx`, import `FeedbackProvider` and wrap the existing `MaintenanceGate` tree once. In `apps/frontend/src/components/layout/AppShell.tsx`, remove the import and the `<FeedbackProvider>` wrapper so `ShellInner` is rendered directly.

- [ ] **Step 6: Add countdown CSS**

In `apps/frontend/src/styles/globals.css`, add:

```css
.feedback-countdown {
  animation: countdown var(--feedback-duration, 6000ms) linear forwards;
  transform-origin: left center;
}
```

Do not add `.feedback-countdown` to the existing reduced-motion suppression list. Keep `animate-fade-up` suppression for the entrance animation.

- [ ] **Step 7: Run the test and typecheck**

Run: `pnpm --filter @coe-nnect/frontend test` then `pnpm typecheck`
Expected: PASS.

---

### Task 4: Subject duplicate-code conflict on update

**Files:**
- Modify: `apps/backend/src/modules/subjects/subjects.service.ts:208-217`
- Create: `apps/backend/src/modules/subjects/subjects.service.spec.ts`

**Interfaces:**
- Consumes: `ConflictException` from `@nestjs/common`, existing `repo.findOne`, existing `assertOwnership`.
- Produces: update rejects duplicate `subjectCode` with message `Subject code "<code>" already exists`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/subjects/subjects.service.spec.ts`:

```ts
import { ConflictException } from '@nestjs/common';
import assert from 'node:assert/strict';
import { SubjectsService } from './subjects.service';

function makeService(existing: unknown) {
  const repo = {
    findOne: jest
      .fn()
      .mockResolvedValueOnce({ subjectId: '43', deptId: '1', subjectCode: 'OLD 100' })
      .mockResolvedValueOnce(existing),
    save: jest.fn(),
  };
  const service = new SubjectsService(
    repo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { assertDepartmentActive: jest.fn().mockResolvedValue(undefined) } as any,
    { assertUsable: jest.fn().mockResolvedValue(undefined) } as any,
  );
  return { service, repo };
}

test('update rejects a duplicate subject code before saving', async () => {
  const { service, repo } = makeService({ subjectId: '99', subjectCode: 'A&H 100' });
  await assert.rejects(
    service.update(
      '43',
      { subjectCode: 'A&H 100' } as any,
      { role: 'administrator', deptId: '1' } as any,
    ),
    (error: unknown) => {
      assert.ok(error instanceof ConflictException);
      assert.equal((error as any).message, 'Subject code "A&H 100" already exists');
      return true;
    },
  );
  assert.equal(repo.save.mock.calls.length, 0);
});
```

Note: Jest globals are available in the backend test environment; import `test` is unnecessary.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/backend test -- --runTestsByPath src/modules/subjects/subjects.service.spec.ts`
Expected: FAIL because update currently reaches `repo.save`.

- [ ] **Step 3: Add the duplicate pre-check**

In `subjects.service.ts`, inside the existing `if (dto.subjectCode !== undefined)` branch in `update()`, query `repo.findOne({ where: { subjectCode: dto.subjectCode } })` before mutating `found`. If a row exists and its `subjectId` differs from `found.subjectId`, throw `ConflictException` with the exact message above. Leave the create-path check unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/backend test -- --runTestsByPath src/modules/subjects/subjects.service.spec.ts`
Expected: PASS.

---

### Task 5: Migrate core CRUD pages to the popup

**Files:**
- Modify: `apps/frontend/src/features/subjects/SubjectsPage.tsx`
- Modify: `apps/frontend/src/features/subjects/components/SubjectFormModal.tsx`
- Modify: `apps/frontend/src/features/programs/ProgramsPage.tsx`
- Modify: `apps/frontend/src/features/rooms/RoomsPage.tsx`
- Modify: `apps/frontend/src/features/rooms/components/RoomFormModal.tsx`
- Modify: `apps/frontend/src/features/sections/SectionsPage.tsx`
- Modify: `apps/frontend/src/features/prospectus/ProspectusPage.tsx`
- Create: `apps/frontend/src/features/core-feedback-migration.test.ts`
- Modify: `apps/frontend/package.json:10`

**Interfaces:**
- Consumes: `useFeedback()` from `FeedbackToast.tsx`, `extractApiError()` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Write the failing migration test**

Create `apps/frontend/src/features/core-feedback-migration.test.ts` with `const read = (path: string) => readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');` and these assertions:

```ts
const cases: Array<[string, RegExp[]]> = [
  ['apps/frontend/src/features/subjects/SubjectsPage.tsx', [/useFeedback\(\)/, /feedback\.(success|error|failed)/]],
  ['apps/frontend/src/features/subjects/components/SubjectFormModal.tsx', [/useFeedback\(\)/]],
  ['apps/frontend/src/features/programs/ProgramsPage.tsx', [/useFeedback\(\)/, /feedback\.(success|error)/]],
  ['apps/frontend/src/features/rooms/RoomsPage.tsx', [/useFeedback\(\)/, /feedback\.(success|error)/]],
  ['apps/frontend/src/features/sections/SectionsPage.tsx', [/useFeedback\(\)/, /feedback\.(success|error)/]],
  ['apps/frontend/src/features/prospectus/ProspectusPage.tsx', [/useFeedback\(\)/, /feedback\.(success|error)/]],
];
for (const [path, patterns] of cases) {
  const source = read(path);
  for (const pattern of patterns) assert.match(source, pattern);
}

assert.doesNotMatch(read('apps/frontend/src/features/subjects/SubjectsPage.tsx'), /const \[alert, setAlert\]/);
assert.doesNotMatch(read('apps/frontend/src/features/programs/ProgramsPage.tsx'), /const \[success, setSuccess\]/);
assert.doesNotMatch(read('apps/frontend/src/features/rooms/RoomsPage.tsx'), /const \[success, setSuccess\]/);
assert.doesNotMatch(read('apps/frontend/src/features/sections/SectionsPage.tsx'), /const \[success, setSuccess\]/);
assert.match(read('apps/frontend/src/features/sections/SectionsPage.tsx'), /const \[errors, setErrors\]/);
assert.doesNotMatch(read('apps/frontend/src/features/prospectus/ProspectusPage.tsx'), /const \[success, setSuccess\]/);
assert.doesNotMatch(read('apps/frontend/src/features/subjects/components/SubjectFormModal.tsx'), /const \[formError, setFormError\]/);
```

Append this test file to the frontend `test` script.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend test`
Expected: FAIL on missing `useFeedback()` / remaining local state.

- [ ] **Step 3: Migrate the call sites**

In each listed file:
- Import `useFeedback` and call it once in the component.
- Replace transient success/error state and its `setTimeout` cleanup with `feedback.success(...)`, `feedback.error(...)`, or `feedback.failed(...)`.
- Pass `extractApiError(err, '<caller fallback>')` as the popup message.
- Delete the local red/green banner JSX that only displayed those states.
- Keep `errors`/field-level validation and per-input messages. In `SubjectFormModal`, keep `errors`; remove only `formError`.
- In `RoomFormModal`, delete the unused `formError` state and its dead banner JSX.

- [ ] **Step 4: Run the test and typecheck**

Run: `pnpm --filter @coe-nnect/frontend test` then `pnpm typecheck`
Expected: PASS.

---

### Task 6: Migrate approvals, timetable, and import feedback

**Files:**
- Modify: `apps/frontend/src/features/approvals/ApprovalsPage.tsx`
- Modify: `apps/frontend/src/features/approvals/components/RequestFormModal.tsx`
- Modify: `apps/frontend/src/features/dean/DeanApprovalsPage.tsx`
- Modify: `apps/frontend/src/features/dean/DeanDepartmentsManagePage.tsx`
- Modify: `apps/frontend/src/features/timetable/components/ScheduleDetailDrawer.tsx`
- Modify: `apps/frontend/src/features/timetable/components/MoveScheduleSheet.tsx`
- Modify: `apps/frontend/src/features/timetable/export/ExportToolbar.tsx`
- Modify: `apps/frontend/src/features/import/ProspectusPdfListPage.tsx`
- Modify: `apps/frontend/src/features/import/components/ImportProspectusDialog.tsx`
- Modify: `apps/frontend/src/features/import/components/AutoDetectDialog.tsx`
- Modify: `apps/frontend/src/features/import/ProspectusPdfEditorPage.tsx`
- Modify: `apps/frontend/src/features/plot-subject/PlotSubjectModal.tsx`
- Create: `apps/frontend/src/features/workflow-feedback-migration.test.ts`
- Modify: `apps/frontend/package.json:10`

**Interfaces:**
- Consumes: `useFeedback()` and `extractApiError()` from earlier tasks.
- Produces: no new exports.

- [ ] **Step 1: Write the failing migration test**

Create `apps/frontend/src/features/workflow-feedback-migration.test.ts` with the same four-level `read()` helper as Task 5. Assert every listed file contains `useFeedback()` and `feedback.`, that the old transient states are gone (`error`, `success`, `actionError`, `actionSuccess`, `decisionError`, `verifyError`, `remarksSaved`, `tableError`, `exportError` as named in each file), and that `ImportProspectusDialog.tsx` still contains `const [errors, setErrors]` or its equivalent field-level validation state. Also assert `ProspectusPdfEditorPage.tsx` and `PlotSubjectModal.tsx` contain no `alert(` calls.

Append the test to the frontend `test` script.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend test`
Expected: FAIL on missing popup calls / remaining local states or alerts.

- [ ] **Step 3: Migrate the call sites**

Apply the same migration rules as Task 5. Replace native `alert()` calls in `ProspectusPdfEditorPage.tsx` and `PlotSubjectModal.tsx` with `feedback.error(...)`. Keep `ImportProspectusDialog`’s field-level `errors` and its terminal `result` screen. Keep `TimetablePage`’s detailed conflict modal untouched because it is a validation workflow, not a transient message banner.

- [ ] **Step 4: Run the test and typecheck**

Run: `pnpm --filter @coe-nnect/frontend test` then `pnpm typecheck`
Expected: PASS.

---

### Task 7: Migrate settings, admin, faculty, auth, and remaining helpers

**Files:**
- Modify: `apps/frontend/src/features/admin/AdminUsersPage.tsx`
- Modify: `apps/frontend/src/features/admin/components/DeleteUserModal.tsx`
- Modify: `apps/frontend/src/features/admin/components/UserFormModal.tsx`
- Modify: `apps/frontend/src/features/dev-tools/DevToolsPage.tsx`
- Modify: `apps/frontend/src/features/settings/components/SecuritySection.tsx`
- Modify: `apps/frontend/src/features/settings/components/RecoveryEmailSection.tsx`
- Modify: `apps/frontend/src/features/settings/components/AppearanceSettingsTab.tsx`
- Modify: `apps/frontend/src/features/settings/components/NotificationSettingsTab.tsx`
- Modify: `apps/frontend/src/features/faculty/components/PreferencesModal.tsx`
- Modify: `apps/frontend/src/features/faculty/components/UnavailabilityModal.tsx`
- Modify: `apps/frontend/src/features/faculty/components/QualificationsModal.tsx`
- Modify: `apps/frontend/src/features/subjects/components/RestrictionsPanel.tsx`
- Modify: `apps/frontend/src/features/rooms/components/RoomPreferencesModal.tsx`
- Modify: `apps/frontend/src/features/prospectus/components/ProspectusFormModal.tsx`
- Modify: `apps/frontend/src/features/auth/LoginPage.tsx`
- Modify: `apps/frontend/src/features/auth/ResetPasswordPage.tsx`
- Modify: `apps/frontend/src/features/auth/MaintenancePage.tsx`
- Modify: `apps/frontend/src/features/auth/DepartmentDeactivatedPage.tsx`
- Modify: `apps/frontend/src/features/landing/StudentPlannerPanel.tsx`
- Modify: `apps/frontend/src/features/reports/export/ApprovalsExportToolbar.tsx`
- Modify: `apps/frontend/src/features/system-config/SystemConfigPage.tsx`
- Modify: `apps/frontend/src/features/system-config/components/TermsPanel.tsx`
- Modify: `apps/frontend/src/features/system-config/components/SemesterTypesPanel.tsx`
- Modify: `apps/frontend/src/features/idp/IdpChangeRequestsPage.tsx`
- Create: `apps/frontend/src/features/settings-feedback-migration.test.ts`
- Modify: `apps/frontend/package.json:10`

**Interfaces:**
- Consumes: `useFeedback()`, `extractApiError()`, and the Task 2 sound API.
- Produces: no new exports.

- [ ] **Step 1: Write the failing migration test**

Create `apps/frontend/src/features/settings-feedback-migration.test.ts` with the same four-level `read()` helper as Task 5. Assert:
- Every listed file that owns transient messages contains `useFeedback()` and `feedback.`.
- `LoginPage.tsx` still contains `capError` but no forgot-password `const [error, setError]` or main login `const [error, setError]`.
- `ResetPasswordPage.tsx` still contains its terminal `success` state.
- `RecoveryVerifyPage.tsx` is not in the migration list and keeps its terminal `state`.
- `NotificationSettingsTab.tsx` contains `feedback` and a wording match for feedback sounds.
- No listed file still defines local `function extractErrorMessage`, `function apiErrorMessage`, `function apiError`, `function extractMessage`, or `function normalizeLoginError`.

Append the test to the frontend `test` script.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend test`
Expected: FAIL on missing popup calls and remaining local helper definitions.

- [ ] **Step 3: Migrate the call sites**

Apply the Task 5 rules. Additional rules:
- Replace native `alert()` in `DevToolsPage.tsx` with `feedback.error(...)`.
- Keep field-level validation in `UserFormModal`, `RecoveryEmailSection`, `RequestFormModal`, and `ProspectusFormModal`.
- In `NotificationSettingsTab.tsx`, add a “Success/error feedback sounds” toggle bound to `SoundPreferences.feedback`, add success/error preview buttons, and update the section heading copy to cover notification, chat, and feedback sounds.
- Replace every listed local error helper with `extractApiError(err, fallback)`.

- [ ] **Step 4: Run the test and typecheck**

Run: `pnpm --filter @coe-nnect/frontend test` then `pnpm typecheck`
Expected: PASS.

---

### Task 8: Full verification and browser smoke

**Files:** No source changes.

- [ ] **Step 1: Run full automated verification**

Run from the repo root:

```bash
pnpm typecheck
pnpm test
```

Expected: both PASS, including backend Jest and all frontend Node tests.

- [ ] **Step 2: Confirm the working tree is uncommitted**

Run: `git status --short`
Expected: all design/plan/migration changes appear as modified/untracked; `git log -1` remains the pre-existing HEAD.

- [ ] **Step 3: Human browser smoke checklist**

Verify in a real browser:
1. Edit a subject to an existing code; the popup shows `Subject code "A&H 100" already exists` with the warning tone and countdown line.
2. Create a subject successfully; the popup shows the success chime and drains closed.
3. Save a prospectus change while the detail drawer is open; the popup appears above the drawer, not inside it or above the table.
4. Approve a request; the success popup appears once even if two approvals fire quickly.
5. With the popup visible, hover it; the countdown pauses, then resumes on leave.
6. Open Notification Settings and mute feedback sounds; repeat step 2 and confirm no tone plays while the popup still appears.
7. Submit a form with invalid fields; field-level messages still appear next to the fields while no duplicate global banner covers them.
