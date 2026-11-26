# Prospectus Sessions-per-Week Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make weekly lecture/lab session counts visible in the prospectus table and editable from the detail drawer without opening the full placement modal.

**Architecture:** Add two pure helpers for formatting and patch shape, add one compact `Sessions/wk` table column, let `ProspectusPage` own a `updateProspectus` mutation, and pass a save callback into `ProspectusDetailPanel`. The drawer keeps a local draft, resyncs it from the live row, and saves only `lectureSessionsPerWeek` and `labSessionsPerWeek`.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Node test runner, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-11-25-prospectus-sessions-per-week-design.md` (approved; binding).

## Global Constraints

- Do not commit, push, merge, or open a PR. All changes stay uncommitted.
- No backend, DTO, database migration, PDF-import, weekday field, minutes-per-session, units, or full Edit Placement modal changes.
- The only writable fields are `lectureSessionsPerWeek` and `labSessionsPerWeek`.
- Existing ranges are pinned by `validateProspectusForm`: lecture `1–5`, lab `1–3`.
- Saving stays explicit; no auto-save on stepper clicks.
- The drawer must stay open after save, and the table row plus Schedule readouts must refresh from the page cache.
- Users without write permission see the column and values but get disabled controls and no `Save changes` button.
- Append new test files to the existing frontend `test` script in `apps/frontend/package.json:10`; do not reorder or remove existing entries.
- Run frontend checks from `apps/frontend` with `pnpm typecheck` and `pnpm test`; run the full workspace gate from the repo root with `pnpm typecheck` and `pnpm test`.

## Implementation Refinement

The spec says to place `formatSessionsPerWeek(entry)` near `renderUnits` in `ProspectusPage.tsx`. The formatter will be **defined** in a pure `.ts` utility and **called** beside `renderUnits`, because Node cannot import TSX for the required behavior tests. This follows spec line 45, which anticipates a pure helper for behavior tests and reserves source-contract checks for TSX components only.

## Review Focus

- The formatter must show `3 lec · 1 lab`, handle one-sided/zero/missing values, and never invent weekday data.
- The patch must contain exactly the two editable keys.
- The table column must sit immediately after `Units` and use the same formatter on desktop and mobile cards.
- The drawer draft must resync when another entry is selected or when the live entry’s counts change after a save.
- The full placement modal and its validation must remain untouched.
- Test additions must be RED before implementation and GREEN after.

---

### Task 1: Pure formatter and patch helpers

**Files:**
- Create: `apps/frontend/src/features/prospectus/utils/sessions-per-week.ts`
- Create: `apps/frontend/src/features/prospectus/utils/sessions-per-week.test.ts`
- Modify: `apps/frontend/package.json:10`

**Interfaces:**
- `SESSION_LIMITS`: `{ lecture: { min: 1, max: 5 }, lab: { min: 1, max: 3 } } as const`
- `SessionsPerWeekPatch`: `{ lectureSessionsPerWeek: number; labSessionsPerWeek: number }`
- `formatSessionsPerWeek(value: SessionsPerWeekValue | null | undefined): string`
- `buildSessionsPerWeekPatch(draft: SessionsPerWeekPatch): SessionsPerWeekPatch`

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/features/prospectus/utils/sessions-per-week.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SESSION_LIMITS,
  buildSessionsPerWeekPatch,
  formatSessionsPerWeek,
} from './sessions-per-week.ts';

test('formats both session counts', () => {
  assert.equal(
    formatSessionsPerWeek({ lectureSessionsPerWeek: 3, labSessionsPerWeek: 1 }),
    '3 lec · 1 lab',
  );
});

test('formats one-sided counts', () => {
  assert.equal(
    formatSessionsPerWeek({ lectureSessionsPerWeek: 2, labSessionsPerWeek: 0 }),
    '2 lec',
  );
  assert.equal(
    formatSessionsPerWeek({ lectureSessionsPerWeek: 0, labSessionsPerWeek: 1 }),
    '1 lab',
  );
});

test('shows an em dash when both counts are missing or zero', () => {
  assert.equal(formatSessionsPerWeek(null), '—');
  assert.equal(formatSessionsPerWeek(undefined), '—');
  assert.equal(
    formatSessionsPerWeek({ lectureSessionsPerWeek: 0, labSessionsPerWeek: 0 }),
    '—',
  );
});

test('builds a patch containing only the two editable fields', () => {
  const patch = buildSessionsPerWeekPatch({
    lectureSessionsPerWeek: 3,
    labSessionsPerWeek: 1,
  });

  assert.deepEqual(patch, {
    lectureSessionsPerWeek: 3,
    labSessionsPerWeek: 1,
  });
  assert.deepEqual(Object.keys(patch).sort(), [
    'labSessionsPerWeek',
    'lectureSessionsPerWeek',
  ]);
});

test('shares the existing validation ranges', () => {
  assert.deepEqual(SESSION_LIMITS, {
    lecture: { min: 1, max: 5 },
    lab: { min: 1, max: 3 },
  });
});
```

- [ ] **Step 2: Append the test to the frontend test script**

In `apps/frontend/package.json:10`, append `src/features/prospectus/utils/sessions-per-week.test.ts` to the end of the `test` script list. Leave every existing entry untouched.

- [ ] **Step 3: Run the test to verify it fails**

Run from `apps/frontend`: `pnpm test`

Expected: FAIL because `./sessions-per-week.ts` does not exist.

- [ ] **Step 4: Implement the helpers**

Create `apps/frontend/src/features/prospectus/utils/sessions-per-week.ts`:

```ts
export interface SessionsPerWeekValue {
  lectureSessionsPerWeek?: number | null;
  labSessionsPerWeek?: number | null;
}

export interface SessionsPerWeekPatch {
  lectureSessionsPerWeek: number;
  labSessionsPerWeek: number;
}

export const SESSION_LIMITS = {
  lecture: { min: 1, max: 5 },
  lab: { min: 1, max: 3 },
} as const;

function positiveCount(value: number | null | undefined): number {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function formatSessionsPerWeek(
  value: SessionsPerWeekValue | null | undefined,
): string {
  const lecture = positiveCount(value?.lectureSessionsPerWeek);
  const lab = positiveCount(value?.labSessionsPerWeek);
  const parts: string[] = [];

  if (lecture > 0) parts.push(`${lecture} lec`);
  if (lab > 0) parts.push(`${lab} lab`);

  return parts.length > 0 ? parts.join(' · ') : '—';
}

export function buildSessionsPerWeekPatch(
  draft: SessionsPerWeekPatch,
): SessionsPerWeekPatch {
  return {
    lectureSessionsPerWeek: draft.lectureSessionsPerWeek,
    labSessionsPerWeek: draft.labSessionsPerWeek,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run from `apps/frontend`: `pnpm test`

Expected: PASS, including the new five tests.

---

### Task 2: Source-contract tests for page and drawer wiring

**Files:**
- Create: `apps/frontend/src/features/prospectus-sessions-per-week.test.ts`
- Modify: `apps/frontend/package.json:10`

**Interfaces:**
- Reads source only; imports no React modules.
- Pins the contract before TSX implementation in Tasks 3 and 4.

- [ ] **Step 1: Write the failing source-contract tests**

Create `apps/frontend/src/features/prospectus-sessions-per-week.test.ts` with the same four-up `read` helper used by `src/features/core-feedback-migration.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL('../../../../' + path, import.meta.url), 'utf8');

const page = read('apps/frontend/src/features/prospectus/ProspectusPage.tsx');
const panel = read(
  'apps/frontend/src/features/prospectus/components/ProspectusDetailPanel.tsx',
);

test('prospectus page renders one Sessions/wk column after Units', () => {
  assert.match(page, /formatSessionsPerWeek\(e\)/);

  const unitsAt = page.indexOf("key: 'units'");
  const sessionsAt = page.indexOf("key: 'sessionsPerWeek'");
  const typeAt = page.indexOf("key: 'type'");

  assert.ok(unitsAt >= 0 && sessionsAt > unitsAt && typeAt > sessionsAt);
  assert.match(page, /header: 'Sessions\/wk'/);
  assert.match(page, /cardVariant: 'mono'/);
});

test('prospectus page owns the two-field save mutation', () => {
  const start = page.indexOf('const updateSessionsMutation');
  const end = page.indexOf('// ── Bulk action');
  assert.ok(start >= 0 && end > start);
  const mutation = page.slice(start, end);

  assert.match(mutation, /updateProspectus\(id, patch\)/);
  assert.match(
    mutation,
    /feedback\.success\('Sessions per week updated\.'\)/,
  );
  assert.match(
    mutation,
    /feedback\.error\(\s*extractApiError\(err, 'Failed to update sessions per week'\),?\s*\)/,
  );
  assert.match(mutation, /invalidateAfterProspectusChange\(\)/);
  assert.match(page, /mutateAsync\(\{ id, patch \}\)/);
  assert.match(page, /onSaveSessions=/);
});

test('detail panel edits a local draft and never calls the API', () => {
  assert.match(panel, /onSaveSessions\?:/);
  assert.match(panel, /SESSION_LIMITS/);
  assert.match(panel, /useState<SessionsPerWeekPatch>/);
  assert.match(
    panel,
    /entry\.prospectusId,\s*entry\.lectureSessionsPerWeek,\s*entry\.labSessionsPerWeek/,
  );
  assert.match(panel, /buildSessionsPerWeekPatch\(draft\)/);
  assert.match(panel, /await onSaveSessions\(entry\.prospectusId/);
  assert.match(panel, /disabled=\{!dirty \|\| saving \|\| !onSaveSessions\}/);
  assert.match(panel, /Save changes/);
  assert.match(panel, /\{canWrite && \(/);
  assert.match(panel, /disabled=\{!canWrite/);
  assert.doesNotMatch(panel, /updateProspectus\(/);
});
```

- [ ] **Step 2: Append the test to the frontend test script**

In `apps/frontend/package.json:10`, append `src/features/prospectus-sessions-per-week.test.ts` to the end of the `test` script list. Leave every existing entry untouched.

- [ ] **Step 3: Run the tests to verify they fail**

Run from `apps/frontend`: `pnpm test`

Expected: the three new source-contract tests FAIL; Task 1’s helper tests remain PASS.

---

### Task 3: Page column, mutation, and callback wiring

**Files:**
- Modify: `apps/frontend/src/features/prospectus/ProspectusPage.tsx`

**Interfaces:**
- Consumes: `updateProspectus(id, input)` from `apps/frontend/src/api/prospectus.api.ts`.
- Consumes: `formatSessionsPerWeek`, `buildSessionsPerWeekPatch`, `SessionsPerWeekPatch` from `./utils/sessions-per-week`.
- Produces: `onSaveSessions(id: string, patch: SessionsPerWeekPatch) => Promise<void>` passed to `ProspectusDetailPanel`.

- [ ] **Step 1: Add imports**

In the existing `../../api/prospectus.api` import, add `updateProspectus` beside `fetchProspectus`.

Add this import after the existing feature imports:

```ts
import {
  buildSessionsPerWeekPatch,
  formatSessionsPerWeek,
  type SessionsPerWeekPatch,
} from './utils/sessions-per-week';
```

- [ ] **Step 2: Add the page-owned mutation**

Insert immediately after `duplicateSlotMutation` and before `// ── Bulk action`:

```ts
const updateSessionsMutation = useMutation({
  mutationFn: ({ id, patch }: { id: string; patch: SessionsPerWeekPatch }) =>
    updateProspectus(id, patch),
  onSuccess: () => {
    feedback.success('Sessions per week updated.');
    invalidateAfterProspectusChange();
  },
  onError: (err: unknown) =>
    feedback.error(
      extractApiError(err, 'Failed to update sessions per week'),
    ),
});
```

Do not close the drawer here. `detailId` is unchanged, so `detailLive` remains derived from the refreshed `allEntries`.

- [ ] **Step 3: Add the `Sessions/wk` column**

Immediately after the existing `units` column and before `type`, insert:

```ts
{
  key: 'sessionsPerWeek',
  header: 'Sessions/wk',
  cardVariant: 'mono',
  cellClassName: 'whitespace-nowrap text-xs text-on-surface-variant',
  render: (e) => formatSessionsPerWeek(e),
},
```

Do not add `hideOnMobile`; the same formatter must feed the mobile card.

- [ ] **Step 4: Pass the save callback to the drawer**

In the `<ProspectusDetailPanel ... />` block, after `onDelete={handleDeleteFromDetail}`, add:

```tsx
onSaveSessions={(id, patch) =>
  updateSessionsMutation.mutateAsync({ id, patch }).then(() => undefined)
}
```

The `.then(() => undefined)` makes the callback return `Promise<void>` while the mutation itself uses the API response for cache refresh.

- [ ] **Step 5: Verify the source-contract tests pass**

Run from `apps/frontend`: `pnpm test`

Expected: all tests pass except the drawer-specific test, which still fails until Task 4.

---

### Task 4: Drawer draft controls

**Files:**
- Modify: `apps/frontend/src/features/prospectus/components/ProspectusDetailPanel.tsx`

**Interfaces:**
- Adds optional prop `onSaveSessions?: (id: string, patch: SessionsPerWeekPatch) => Promise<void>`.
- Uses `SESSION_LIMITS` and `buildSessionsPerWeekPatch` from `../utils/sessions-per-week`.
- Must not import `updateProspectus` or any API client.

- [ ] **Step 1: Add imports and the prop**

Add near the existing imports:

```ts
import {
  SESSION_LIMITS,
  buildSessionsPerWeekPatch,
  type SessionsPerWeekPatch,
} from '../utils/sessions-per-week';
```

In `interface Props`, add after `onDelete: () => void;`:

```ts
onSaveSessions?: (id: string, patch: SessionsPerWeekPatch) => Promise<void>;
```

- [ ] **Step 2: Forward the prop into `ScheduleTab`**

Change the schedule render from `<ScheduleTab entry={entry} />` to:

```tsx
<ScheduleTab
  entry={entry}
  canWrite={canWrite}
  onSaveSessions={onSaveSessions}
/>
```

- [ ] **Step 3: Add local draft state and save handler**

At the top of `ScheduleTab`, before the `noPattern` early return, add:

```tsx
function ScheduleTab({
  entry,
  canWrite,
  onSaveSessions,
}: {
  entry: ProspectusRecord;
  canWrite: boolean;
  onSaveSessions?: (id: string, patch: SessionsPerWeekPatch) => Promise<void>;
}) {
  const [draft, setDraft] = useState<SessionsPerWeekPatch>({
    lectureSessionsPerWeek: entry.lectureSessionsPerWeek ?? 1,
    labSessionsPerWeek: entry.labSessionsPerWeek ?? 1,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      lectureSessionsPerWeek: entry.lectureSessionsPerWeek ?? 1,
      labSessionsPerWeek: entry.labSessionsPerWeek ?? 1,
    });
  }, [
    entry.prospectusId,
    entry.lectureSessionsPerWeek,
    entry.labSessionsPerWeek,
  ]);

  const dirty =
    draft.lectureSessionsPerWeek !== (entry.lectureSessionsPerWeek ?? 1) ||
    draft.labSessionsPerWeek !== (entry.labSessionsPerWeek ?? 1);

  const handleSave = async () => {
    if (!onSaveSessions || !dirty || saving) return;
    setSaving(true);
    try {
      await onSaveSessions(
        entry.prospectusId,
        buildSessionsPerWeekPatch(draft),
      );
    } catch {
      // ProspectusPage already reported the API error through feedback.error.
      // Keep the draft so the user can retry or close without saving.
    } finally {
      setSaving(false);
    }
  };
```

Keep the existing `hasLecture`, `hasLab`, minutes, hours, and `noPattern` calculations below these hooks. Replace the existing `lecSessions` and `labSessions` constants with the draft values so the contact-hour banner and `PatternCard` readouts reflect the draft immediately and the saved values after refetch.

- [ ] **Step 4: Render the two steppers and explicit save button**

Inside the normal `space-y-3` return, render one stepper above each existing `PatternCard` when its pattern exists:

```tsx
{hasLecture && (
  <SessionStepper
    label="Lecture sessions/week"
    value={draft.lectureSessionsPerWeek}
    min={SESSION_LIMITS.lecture.min}
    max={SESSION_LIMITS.lecture.max}
    disabled={!canWrite || saving}
    onChange={(next) =>
      setDraft((prev) => ({ ...prev, lectureSessionsPerWeek: next }))
    }
  />
)}
{hasLab && (
  <SessionStepper
    label="Laboratory sessions/week"
    value={draft.labSessionsPerWeek}
    min={SESSION_LIMITS.lab.min}
    max={SESSION_LIMITS.lab.max}
    disabled={!canWrite || saving}
    onChange={(next) =>
      setDraft((prev) => ({ ...prev, labSessionsPerWeek: next }))
    }
  />
)}
```

Append this after the last `PatternCard`:

```tsx
{canWrite && (
  <button
    type="button"
    onClick={handleSave}
    disabled={!dirty || saving || !onSaveSessions}
    className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-primary text-on-primary disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {saving ? 'Saving…' : 'Save changes'}
  </button>
)}
```

- [ ] **Step 5: Add the `SessionStepper` component**

Add below `ScheduleTab` and above `PatternCard`:

```tsx
function SessionStepper({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (next: number) => void;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2">
      <span className="text-xs font-semibold text-on-surface">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(clamp(value - 1))}
          className="w-7 h-7 rounded border border-outline-variant text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          −
        </button>
        <span className="min-w-6 text-center font-mono text-sm font-bold">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={disabled || value >= max}
          onClick={() => onChange(clamp(value + 1))}
          className="w-7 h-7 rounded border border-outline-variant text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>
    </div>
  );
}
```

No auto-save: clicks only change local draft state until `Save changes` is pressed.

- [ ] **Step 6: Verify the source-contract tests pass**

Run from `apps/frontend`: `pnpm test`

Expected: all frontend tests pass, including the three source-contract tests.

---

### Task 5: Full verification and human browser handoff

**Files:**
- No product source changes in this task.

- [ ] **Step 1: Frontend typecheck**

Run from `apps/frontend`: `pnpm typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Frontend tests**

Run from `apps/frontend`: `pnpm test`

Expected: PASS, including the five helper tests and three wiring source-contract tests.

- [ ] **Step 3: Full workspace gate**

Run from the repo root:

```sh
pnpm typecheck
pnpm test
```

Expected: PASS for frontend, backend, and constraint-rules.

- [ ] **Step 4: Controller check**

Run `git rev-parse HEAD` and `git status --short`.

Expected: HEAD is unchanged; only expected source/test/doc files are modified or untracked; no commits, pushes, merges, or PRs were created.

- [ ] **Step 5: Report the human browser check as pending unless the user performed it**

Manual checklist (human-only):

1. Table and mobile card show `3 lec · 1 lab` immediately after `Units`.
2. Schedule tab shows bounded lecture `1–5` and lab `1–3` steppers.
3. A writer changes counts and clicks `Save changes`; the global success popup appears, the drawer stays open, and the table row plus PatternCard/contact hours update.
4. Closing without saving discards the draft; reopening shows the saved values.
5. Selecting a different row while the drawer is open resyncs the draft and steppers.
6. A read-only user sees the column and steppers but cannot change or save values.
7. The full Edit Placement modal and its field-level validation are unchanged.

Do not claim this checklist as agent-verified unless a human reports the results.

---

## Completion Criteria

- Pure formatter and patch tests pass and pin the exact display/payload contract.
- One compact `Sessions/wk` column follows `Units` on desktop and mobile.
- The drawer exposes two bounded steppers and one explicit `Save changes` button for writers only.
- The page owns the API call, success/error popup, and cache invalidation; the drawer owns only draft UI state.
- The drawer stays open and refreshes from the live row after save.
- No backend, database, PDF, weekday, minutes, units, or full-modal behavior changed.
- All automated gates pass and the browser checklist is honestly reported as human-only or completed by the user.
