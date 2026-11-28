# Draft Snapshot Preview Compare And Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a department head inspect, compare, and delete saved timetable drafts without changing any live timetable row.

**Architecture:** Saved drafts become a read-only `draft:<snapshotId>` compare source backed by a dedicated entries endpoint. Preview and compare reuse the existing snapshot mapper, diff engine, and `VersionCompareModal`; deletion removes only the snapshot row behind an in-app confirmation.

**Tech Stack:** NestJS/TypeORM, React/TypeScript, TanStack Query, Node test runner, Jest, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-11-28-draft-snapshot-preview-and-compare-design.md`

## Global Constraints

- Saved/loadable rows are draft + review only; finalized/published rows are never written, deleted, or created.
- Preview and compare are read-only. Delete removes only `term_draft_snapshot`; it never touches `schedule`, faculty requests, approvals, or publish state.
- Require an active term and department id. Snapshots stay locked to their original term and department.
- Draft endpoints and draft compare sources are `department_head` / `administrator` only. The UI remains department-head-only.
- For a draft comparison, the live side contains only draft/review rows, and the other side must be `live:` or another `draft:` in the same term and department.
- Use global `useFeedback()` only; no `alert`, `confirm`, `prompt`, local toast, or local success/failure state. In-flight flags are allowed.
- Preserve existing More-menu labels, `data-tour` values (especially `tt-focus`), deep links, wheel scrolling, bulk selection, manual Dean approval, manual IDP via **Send to IDP**, and no-direct-publish behavior.
- Exact preserved labels: More menu `Save as draft…` / `Load drafts…`; dialogs `Save timetable draft`, `Saved timetable drafts`, `Load this draft`.
- Keep every existing `data-tour` value unchanged.
- CI Browser E2E is authoritative; do not run local browser E2E.
- No schema migration, environment variables, or new table.
- Commit subjects must not use `feat` or `chore`, must not end with `:`, and must include `Co-authored-by: trynotybort <trynotybort@gmail.com>`.
- Do not stage `.superpowers/`, `final-review.diff`, unrelated docs plans/specs, or `docs/integrations/idp-request-change-update.md`.

## Review Focus

- Cross-term or cross-department snapshot id: reject before returning entries, deleting, or diffing; pinned in Task 1 service tests and Task 2 compare-source tests.
- Finalized/published live rows and pending faculty requests: inspect/delete paths must not write or cancel them; pinned in Task 1 delete test and Task 6 browser E2E delete test.
- Repeated offering sessions: `session_index` must survive detail and pair correctly in compare; pinned in Task 1 detail test and Task 2 compare test.
- Snapshot with no remaining draft/review rows: preview shows an empty grid instead of crashing; pinned in Task 4 preview guard test and Task 1 filtered-detail test.
- Non-DH actor, missing term, or missing department: reject with clear errors and no data leak; pinned in Task 1 route/service tests and Task 2 guard tests.

## File Structure

- `apps/backend/src/modules/scheduling/services/term-draft-snapshot.service.ts` — snapshot detail/delete methods and shared guarded lookup.
- `apps/backend/src/modules/scheduling/controllers/draft-snapshot.controller.ts` — `GET .../entries` and `DELETE ...` routes.
- `apps/backend/src/modules/scheduling/services/schedule-version.service.ts` — optional compare summary labels/term ids.
- `apps/backend/src/modules/scheduling/services/version-compare.service.ts` — `draft:` source parsing, normalization, and term/dept/role guards.
- `apps/backend/src/modules/scheduling/controllers/published-version.controller.ts` — pass `termId` to the compare service.
- `apps/frontend/src/api/schedule.api.ts` — draft detail/delete clients and `draft` source support.
- `apps/frontend/src/features/timetable/components/DraftPreviewModal.tsx` — read-only single-grid preview.
- `apps/frontend/src/features/timetable/components/DraftComparePicker.tsx` — choose live or another saved draft.
- `apps/frontend/src/features/timetable/components/DeleteDraftModal.tsx` — in-app delete confirmation.
- `apps/frontend/src/features/timetable/components/SavedDraftDrawer.tsx` — new row actions.
- `apps/frontend/src/features/timetable/components/VersionCompareModal.tsx` — reuse for draft sources and global feedback.
- `apps/frontend/src/features/timetable/TimetablePage.tsx` — selection state, handlers, JSX wiring.
- `apps/frontend/src/features/timetable/draft-preview-compare.test.ts` — new source guard tests.
- `e2e/specs/draft-save-load.spec.ts` — reachable head-flow browser coverage.

---

### Task 1: Backend snapshot detail and delete routes

**Files:**
- Modify: `apps/backend/src/modules/scheduling/services/term-draft-snapshot.service.ts`
- Modify: `apps/backend/src/modules/scheduling/controllers/draft-snapshot.controller.ts`
- Test: `apps/backend/test/draft-snapshot-routes.spec.ts`
- Test: `apps/backend/test/term-draft-snapshot.service.spec.ts`

**Interfaces:**
- Consumes: existing `assertActor`, `assertActiveTerm`, `snapshotRepo`, `toSummary`, and `DraftSnapshotEntry` in `TermDraftSnapshotService`.
- Produces:
  - `export type DraftSnapshotDetail = DraftSnapshotSummary & { entries: DraftSnapshotEntry[] }`
  - `detail(snapshotId: string, termId: string, deptId: string, actor: any): Promise<DraftSnapshotDetail>`
  - `delete(snapshotId: string, termId: string, deptId: string, actor: any): Promise<void>`
  - `GET /v1/schedules/draft-snapshots/:snapshotId/entries?termId=&deptId=`
  - `DELETE /v1/schedules/draft-snapshots/:snapshotId?termId=&deptId=`

- [ ] **Step 1: Write the failing route-contract test**

In `apps/backend/test/draft-snapshot-routes.spec.ts`, change both role-count assertions from `4` to `6` and add assertions in the existing save/list test:

```ts
assert.match(controller, /@Get\('draft-snapshots\/:snapshotId\/entries'\)/);
assert.match(controller, /@Delete\('draft-snapshots\/:snapshotId'\)/);
assert.match(
  controller,
  /@Auditable\(\{ action: 'schedule\.draft_delete', source: 'Scheduling' \}\)/,
);
```

In the service-contract test, add:

```ts
assert.match(
  service,
  /async detail\(snapshotId: string, termId: string, deptId: string, actor: any\)/,
);
assert.match(
  service,
  /async delete\(snapshotId: string, termId: string, deptId: string, actor: any\)/,
);
assert.match(service, /item\?\.status === 'draft' \|\| item\?\.status === 'review'/);
```

- [ ] **Step 2: Write the failing service tests**

In `apps/backend/test/term-draft-snapshot.service.spec.ts`, reuse the existing fake-repository/fixture pattern. Seed one snapshot with a `draft` entry at `session_index: 0`, a `review` entry at `session_index: 1`, and a `published` entry that must not be returned. Add:

```ts
it('details only draft and review entries with their session indexes', async () => {
  const detail = await service.detail('snap-1', '1', '2', actor);

  assert.equal(detail.entryCount, 2);
  assert.deepEqual(detail.entries.map((entry) => entry.session_index), [0, 1]);
  assert.ok(detail.entries.every((entry) =>
    entry.status === 'draft' || entry.status === 'review',
  ));
  await assert.rejects(
    () => service.detail('snap-1', '2', '2', actor),
    /belongs to term/i,
  );
  await assert.rejects(
    () => service.detail('snap-1', '1', '3', actor),
    /not found/i,
  );
});

it('deletes only the snapshot row', async () => {
  const scheduleBefore = [...scheduleRepo.rows];

  await service.delete('snap-1', '1', '2', actor);

  assert.equal(snapshotRepo.rows.length, 0);
  assert.deepEqual(scheduleRepo.rows, scheduleBefore);
  assert.equal(facultyGate.cancelOrphanedFacultyRequest.mock.calls.length, 0);
  await assert.rejects(
    () => service.delete('snap-1', '1', '2', actor),
    /not found/i,
  );
});
```

Extract the existing service construction into a local `makeService(snapshotRows, scheduleRows = [])` helper if that keeps these tests readable; do not change the existing pending-request test's assertions.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @coe-nnect/backend exec jest --runInBand test/draft-snapshot-routes.spec.ts test/term-draft-snapshot.service.spec.ts`

Expected: FAIL because `detail`, `delete`, the routes, and the updated decorators do not exist.

- [ ] **Step 4: Implement the service methods**

In `term-draft-snapshot.service.ts`:

- Add `DraftSnapshotDetail` beside `DraftSnapshotSummary`.
- Add a private `requireSnapshotForInspection(snapshotId, termId, deptId, actor)` that calls `assertActor`, `assertActiveTerm`, `findOne({ where: { termDraftSnapshotId: snapshotId, deptId } })`, rejects a missing snapshot with `NotFoundException`, and rejects a term mismatch with `ConflictException`.
- Implement `detail()` by calling that helper, reading `(snapshot.snapshot as { entries?: unknown }).entries`, filtering to `status === 'draft' || status === 'review'`, sorting by `subject_code`, `section_code`, `load_type`, `session_index`, `day_of_week`, then `start_time`, and returning `{ ...this.toSummary(snapshot), entries, entryCount: entries.length }`.
- Implement `delete()` by calling that helper, then `snapshotRepo.delete({ termDraftSnapshotId: snapshotId, deptId })`, throwing `NotFoundException` when `affected === 0`.

- [ ] **Step 5: Implement the routes**

In `draft-snapshot.controller.ts`, import `Delete`; add `@Get('draft-snapshots/:snapshotId/entries')` with `@Roles('department_head', 'administrator')` calling `this.drafts.detail(snapshotId, termId, deptId, req.profile)`; add `@Delete('draft-snapshots/:snapshotId')` with the same role decorator, `@Auditable({ action: 'schedule.draft_delete', source: 'Scheduling' })`, and a call to `this.drafts.delete(...)`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @coe-nnect/backend exec jest --runInBand test/draft-snapshot-routes.spec.ts test/term-draft-snapshot.service.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/scheduling/services/term-draft-snapshot.service.ts apps/backend/src/modules/scheduling/controllers/draft-snapshot.controller.ts apps/backend/test/draft-snapshot-routes.spec.ts apps/backend/test/term-draft-snapshot.service.spec.ts
git commit -m "Add draft snapshot inspection and deletion routes" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 2: Saved drafts as a compare source

**Files:**
- Modify: `apps/backend/src/modules/scheduling/services/schedule-version.service.ts`
- Modify: `apps/backend/src/modules/scheduling/services/version-compare.service.ts`
- Modify: `apps/backend/src/modules/scheduling/controllers/published-version.controller.ts`
- Test: `apps/backend/test/version-compare.service.spec.ts`
- Test: `apps/backend/test/published-version-routes.spec.ts`

**Interfaces:**
- Consumes: `TermDraftSnapshotService.detail(snapshotId, termId, deptId, actor)` from Task 1.
- Produces:
  - `VersionSourceKind = 'published' | 'history' | 'live' | 'draft'`
  - `parseSource('draft:12')` returns `{ kind: 'draft', id: '12' }`
  - `compareSources(sourceA, sourceB, actor, requestedDeptId?, requestedTermId?)`
  - `ComparedVersionSummary` gains optional `label?: string | null` and `termId?: string | null`
  - compare query accepts `?termId=`

- [ ] **Step 1: Write the failing parse/guard tests**

In `apps/backend/test/version-compare.service.spec.ts`, replace the old `draft:`-is-unknown block at lines 229-238 with:

```ts
it('parses draft sources and still rejects unknown prefixes', () => {
  assert.deepEqual(parseSource('draft:1'), { kind: 'draft', id: '1' });
  assert.throws(() => parseSource('mystery:1'), /unknown source/i);
});
```

Add tests with a fake `drafts` dependency exposing `detail: jest.fn(...)`:

```ts
it('compares a draft with the editable live rows in the same term', async () => {
  // seed draft detail with one draft and one review entry; seed live rows with
  // draft, review, and published rows for term 1.
  const result = await service.compareSources(
    'draft:7', 'live:1', departmentHeadProfile, '2', '1',
  );

  assert.equal(result.versionA.label, 'Working A');
  assert.equal(result.versionB.label, 'Live timetable');
  assert.equal(result.entriesB.length, 2);
  assert.ok(result.entriesB.every((entry) =>
    entry.status === 'draft' || entry.status === 'review',
  ));
});

it('rejects invalid draft comparison guards', async () => {
  await assert.rejects(
    () => service.compareSources('draft:7', 'published:9', departmentHeadProfile, '2', '1'),
    /between draft and live or draft/i,
  );
  await assert.rejects(
    () => service.compareSources('draft:7', 'live:1', departmentHeadProfile, '2'),
    /termId is required/i,
  );
  await assert.rejects(
    () => service.compareSources('draft:7', 'live:2', departmentHeadProfile, '2', '1'),
    /same term/i,
  );
  await assert.rejects(
    () => service.compareSources('draft:7', 'live:1', deanProfile, '2', '1'),
    /department_head or administrator/i,
  );
  await assert.rejects(
    () => service.compareSources('draft:7', 'live:1', { role: 'administrator' }, null, '1'),
    /department id|department/i,
  );
});
```

Update the `beforeEach` constructor call to pass the fake drafts dependency as the fourth argument:

```ts
service = new VersionCompareService(
  published as any,
  versionService as any,
  scheduleRepo as any,
  drafts as any,
);
```

In `apps/backend/test/published-version-routes.spec.ts`, add assertions that the compare route still keeps its existing role list and now passes `termId`:

```ts
assert.match(controller, /@Query\('termId'\) termId\?: string/);
assert.match(
  controller,
  /compareSources\(a, b, req\.profile, deptId, termId\)/,
);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @coe-nnect/backend exec jest --runInBand test/version-compare.service.spec.ts test/published-version-routes.spec.ts`

Expected: FAIL because `draft:` is still unknown, the constructor has no drafts dependency, and the controller has no `termId`.

- [ ] **Step 3: Extend the compare summary type**

In `schedule-version.service.ts`, add optional `label` and `termId` to `ComparedVersionSummary`. Do not change any existing summary construction shape except through the optional fields.

- [ ] **Step 4: Implement the draft source and guards**

In `version-compare.service.ts`:

- Import `ForbiddenException` and `TermDraftSnapshotService`.
- Change `VersionSourceKind` and `SOURCE_KINDS` to include `draft`.
- Add the drafts service as the fourth constructor dependency.
- Add optional fifth `requestedTermId` parameter to `compareSources`.
- Parse both sources first. If either source is `draft:`: require an allowed actor role, require `deptId`, require `termId`, require the other kind to be `live` or `draft`, then normalize both with the requested term. Reject a `live:` source whose id is not the requested term.
- In `normalize()`, add a `draft` case calling `this.drafts.detail(source.id, termId, deptId, actor)` and building a summary with `label: detail.name`, `termId: detail.termId`, and `entryCount: detail.entryCount`.
- When normalizing a `live:` source during a draft comparison, filter rows to `status === 'draft' || status === 'review'` and set the summary label to `Live timetable` and `termId` to `source.id`.
- Leave published/history normalization and existing live comparisons unchanged when no draft source is present.

- [ ] **Step 5: Pass `termId` through the controller**

In `published-version.controller.ts`, add `@Query('termId') termId?: string` to `compareVersions()` and call `this.compare.compareSources(a, b, req.profile, deptId, termId)`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @coe-nnect/backend exec jest --runInBand test/version-compare.service.spec.ts test/published-version-routes.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/scheduling/services/schedule-version.service.ts apps/backend/src/modules/scheduling/services/version-compare.service.ts apps/backend/src/modules/scheduling/controllers/published-version.controller.ts apps/backend/test/version-compare.service.spec.ts apps/backend/test/published-version-routes.spec.ts
git commit -m "Add saved draft compare source" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 3: Frontend API client and source guards

**Files:**
- Modify: `apps/frontend/src/api/schedule.api.ts`
- Modify: `apps/frontend/src/api/published-version-api.test.ts`
- Create: `apps/frontend/src/features/timetable/draft-preview-compare.test.ts`
- Modify: `apps/frontend/package.json`

**Interfaces:**
- Consumes: backend routes from Tasks 1-2.
- Produces:
  - `VersionSource` includes `{ kind: 'draft'; id: string }`
  - `DraftSnapshotDetail = DraftSnapshotSummary & { entries: DraftSnapshotEntry[] }`
  - `fetchDraftSnapshot(snapshotId, termId, deptId): Promise<DraftSnapshotDetail>`
  - `deleteDraftSnapshot(snapshotId, termId, deptId): Promise<void>`
  - `compareVersionSources(a, b, deptId?, termId?)`
  - `VersionCompareResult` summary types include optional `label` and `termId`

- [ ] **Step 1: Write the failing API guard tests**

In `apps/frontend/src/api/published-version-api.test.ts`, change the exact `VersionSource` assertion to:

```ts
/export type VersionSource = \{ kind: 'published' \| 'history' \| 'live' \| 'draft'; id: string \}/,
```

Create `apps/frontend/src/features/timetable/draft-preview-compare.test.ts` with the existing `read()` helper pattern and:

```ts
test('draft snapshot API supports preview, compare, and delete', () => {
  const api = read('apps/frontend/src/api/schedule.api.ts');

  assert.match(api, /export type DraftSnapshotDetail/);
  assert.match(api, /export async function fetchDraftSnapshot/);
  assert.match(api, /draft-snapshots\/\$\{snapshotId\}\/entries/);
  assert.match(api, /export async function deleteDraftSnapshot/);
  assert.match(api, /method: 'DELETE'/);
  assert.match(api, /compareVersionSources[\s\S]*?termId\?: string/);
  assert.match(api, /params\.termId = termId/);
});
```

Add both `src/features/timetable/draft-save-load.test.ts` and `src/features/timetable/draft-preview-compare.test.ts` to the `test` script in `apps/frontend/package.json`, immediately after `multi-select-bulk-actions.test.ts`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/api/published-version-api.test.ts src/features/timetable/draft-preview-compare.test.ts`

Expected: FAIL on the old union and missing exports.

- [ ] **Step 3: Implement the API changes**

In `schedule.api.ts`:

- Extend `VersionSource` and both `VersionCompareResult` summary types with optional `label` and `termId`.
- Add `DraftSnapshotDetail`.
- Add `fetchDraftSnapshot()` using `api.get('/v1/schedules/draft-snapshots/${snapshotId}/entries', { params: { termId, deptId } })`.
- Add `deleteDraftSnapshot()` using `api.request({ method: 'DELETE', url: '/v1/schedules/draft-snapshots/${snapshotId}', params: { termId, deptId } })`.
- Add optional fourth `termId?: string | null` to `compareVersionSources()` and set `params.termId` when non-empty.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/api/published-version-api.test.ts src/features/timetable/draft-preview-compare.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/api/schedule.api.ts apps/frontend/src/api/published-version-api.test.ts apps/frontend/src/features/timetable/draft-preview-compare.test.ts apps/frontend/package.json
git commit -m "Extend frontend draft snapshot API client" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 4: Preview, compare picker, delete dialog, and drawer actions

**Files:**
- Create: `apps/frontend/src/features/timetable/components/DraftPreviewModal.tsx`
- Create: `apps/frontend/src/features/timetable/components/DraftComparePicker.tsx`
- Create: `apps/frontend/src/features/timetable/components/DeleteDraftModal.tsx`
- Modify: `apps/frontend/src/features/timetable/components/SavedDraftDrawer.tsx`
- Test: `apps/frontend/src/features/timetable/draft-preview-compare.test.ts`

**Interfaces:**
- Consumes: `DraftSnapshotSummary`, `DraftSnapshotDetail`, `fetchDraftSnapshot`, `VersionSource` from Task 3; `versionEntryToEntry` and `TimetableGrid`.
- Produces:
  - `DraftPreviewModal({ open, onClose, onCompareWithLive, snapshot, termId, deptId, termLabel })`
  - `DraftComparePicker({ open, source, snapshots, termId, onClose, onPick })`
  - `DeleteDraftModal({ open, snapshot, busy, onClose, onConfirm })`
  - `SavedDraftDrawer` gains `onPreview`, `onCompare`, and `onDelete` callbacks.

- [ ] **Step 1: Write the failing component guard tests**

Append to `draft-preview-compare.test.ts`:

```ts
test('saved draft preview compare picker and delete dialog are wired', () => {
  const preview = read('apps/frontend/src/features/timetable/components/DraftPreviewModal.tsx');
  const picker = read('apps/frontend/src/features/timetable/components/DraftComparePicker.tsx');
  const remove = read('apps/frontend/src/features/timetable/components/DeleteDraftModal.tsx');
  const drawer = read('apps/frontend/src/features/timetable/components/SavedDraftDrawer.tsx');

  assert.match(preview, /Saved draft preview/);
  assert.match(preview, /fetchDraftSnapshot/);
  assert.match(preview, /versionEntryToEntry/);
  assert.match(preview, /<TimetableGrid/);
  assert.match(preview, /readOnlyEntryIds/);
  assert.match(preview, /No draft or review rows in this saved draft/);
  assert.match(preview, /Compare with live/);
  assert.doesNotMatch(preview, /onEntryClick|onEntryMove|onExternalDrop/);

  assert.match(picker, /Choose a draft to compare/);
  assert.match(picker, /Live timetable/);
  assert.match(picker, /kind: 'draft'/);
  assert.match(picker, /kind: 'live'/);

  assert.match(remove, /Delete saved draft\?/);
  assert.match(remove, /Delete saved draft/);
  assert.match(remove, /Cancel/);
  assert.doesNotMatch(remove, /confirm\(/);

  assert.match(drawer, /View saved rows/);
  assert.match(drawer, /Compare/);
  assert.match(drawer, /Delete/);
  assert.match(drawer, /onPreview/);
  assert.match(drawer, /onCompare/);
  assert.match(drawer, /onDelete/);
  assert.match(drawer, /aria-label="Saved timetable drafts"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/draft-preview-compare.test.ts`

Expected: FAIL because the three components and drawer actions do not exist.

- [ ] **Step 3: Implement `DraftPreviewModal`**

Create the component with the props in Interfaces. Use `useQuery` keyed by `['draft-snapshot-preview', snapshot?.snapshotId, termId, deptId]`, enabled only when all ids exist. Map `detail.entries` with `versionEntryToEntry`, pass all ids through `readOnlyEntryIds`, and omit all edit/drop handlers. Show `Saved draft preview` as the Modal title, the snapshot name, term label, and `entryCount` in the body, and footer buttons `Close` and `Compare with live`. Route query failures through `feedback.failed(...)`; do not render an inline error block.

- [ ] **Step 4: Implement `DraftComparePicker`**

Create the component with the props in Interfaces. Use a `Modal` titled `Choose a draft to compare` with a `Live timetable` button that calls `onPick({ kind: 'live', id: termId })`, and one button per snapshot excluding `source.snapshotId` that calls `onPick({ kind: 'draft', id: snapshot.snapshotId })`. Add `Cancel` and disable empty-term picking.

- [ ] **Step 5: Implement `DeleteDraftModal`**

Create the component with the props in Interfaces. Use `Modal` with `size="sm"`, `title="Delete saved draft?"`, `busy={busy}`, a body naming `snapshot?.name` and warning that deletion cannot be undone, and footer buttons `Cancel` and `Delete saved draft`. Keep focus on `Cancel` initially via `initialFocusRef`.

- [ ] **Step 6: Extend `SavedDraftDrawer`**

Add `onPreview`, `onCompare`, and `onDelete` props. In each row, beneath the existing name/metadata, render buttons `View saved rows`, `Compare`, and `Delete` alongside the existing `Load` button. Disable all four while `busySnapshotId` matches the row. Do not change the drawer title or existing More-menu labels.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/draft-preview-compare.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/timetable/components/DraftPreviewModal.tsx apps/frontend/src/features/timetable/components/DraftComparePicker.tsx apps/frontend/src/features/timetable/components/DeleteDraftModal.tsx apps/frontend/src/features/timetable/components/SavedDraftDrawer.tsx apps/frontend/src/features/timetable/draft-preview-compare.test.ts
git commit -m "Build saved draft preview and delete dialogs" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 5: Reuse compare modal with global feedback

**Files:**
- Modify: `apps/frontend/src/features/timetable/components/VersionCompareModal.tsx`
- Test: `apps/frontend/src/features/timetable/draft-preview-compare.test.ts`
- Test: `apps/frontend/src/features/timetable/published-version-archive.test.ts`

**Interfaces:**
- Consumes: optional `label` / `termId` on `VersionCompareResult` summaries from Task 3.
- Produces: `VersionCompareModal` gains `termId?: string | null` and passes it to `compareVersionSources`; all compare failures emit `feedback.failed(...)`.

- [ ] **Step 1: Write the failing guard tests**

Append to `draft-preview-compare.test.ts`:

```ts
test('version compare modal reuses draft labels and global feedback', () => {
  const modal = read('apps/frontend/src/features/timetable/components/VersionCompareModal.tsx');

  assert.match(modal, /termId\?: string \| null/);
  assert.match(modal, /compareVersionSources\(sourceA!, sourceB!, deptId, termId/);
  assert.match(modal, /label \?\? sourceLabel/);
  assert.match(modal, /useFeedback\(\)/);
  assert.match(modal, /feedback\.failed/);
  assert.doesNotMatch(modal, /Failed to load comparison/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/draft-preview-compare.test.ts src/features/timetable/published-version-archive.test.ts`

Expected: FAIL on missing `termId`, label preference, and remaining inline error block.

- [ ] **Step 3: Implement the modal changes**

In `VersionCompareModal.tsx`:

- Add `termId?: string | null` to props and include it in both the React Query key and `queryFn` call to `compareVersionSources(sourceA!, sourceB!, deptId, termId ?? undefined)`.
- Add a `resolvedSourceLabel(source, summary)` helper returning `summary?.label ?? sourceLabel(source)` and use it for both Before and After chips.
- Render the `history` icon only for `history` sources, and render `by {finalizedByName ?? 'unknown'}` only for `published` or `history` sources.
- Import `useFeedback` and `extractApiError` from `../../../lib/api-error`, call `feedback.failed(extractApiError(error, 'Could not load comparison.'))` in an effect when the query errors, and delete the inline `Failed to load comparison` block.
- Keep exactly two `TimetableGrid` instances, the `'published-version-compare'` query-key prefix, the `compareVersionSources(sourceA!, sourceB!, deptId` prefix, the department selector, and the diff chips unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/draft-preview-compare.test.ts src/features/timetable/published-version-archive.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/timetable/components/VersionCompareModal.tsx apps/frontend/src/features/timetable/draft-preview-compare.test.ts
git commit -m "Route draft compare through global feedback" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 6: Wire timetable page and browser coverage

**Files:**
- Modify: `apps/frontend/src/features/timetable/TimetablePage.tsx`
- Test: `apps/frontend/src/features/timetable/draft-preview-compare.test.ts`
- Test: `e2e/specs/draft-save-load.spec.ts`

**Interfaces:**
- Consumes: all Task 3-5 components and API functions.
- Produces: page handlers `handlePreviewDraft`, `handleOpenDraftCompare`, `handlePickDraftCompare`, `handleOpenDeleteDraft`, and `handleDeleteDraft`.

- [ ] **Step 1: Write the failing page guard tests**

Append to `draft-preview-compare.test.ts`:

```ts
test('timetable page wires draft preview compare and delete', () => {
  const page = read('apps/frontend/src/features/timetable/TimetablePage.tsx');

  assert.match(page, /handlePreviewDraft/);
  assert.match(page, /handleOpenDraftCompare/);
  assert.match(page, /handlePickDraftCompare/);
  assert.match(page, /handleOpenDeleteDraft/);
  assert.match(page, /handleDeleteDraft/);
  assert.match(page, /deleteDraftSnapshot\(/);
  assert.match(page, /<DraftPreviewModal/);
  assert.match(page, /<DraftComparePicker/);
  assert.match(page, /<DeleteDraftModal/);
  assert.match(page, /termId=\{compareTermId \?\? undefined\}/);
  assert.match(page, /\['term-draft-snapshots', activeTerm\.termId, myDeptId\]/);
  assert.doesNotMatch(page, /alert\(|confirm\(|prompt\(/);
});
```

- [ ] **Step 2: Add the browser test helpers**

In `e2e/specs/draft-save-load.spec.ts`, add:

```ts
const draftPreview = (page: Page) =>
  page.getByRole('dialog', { name: 'Saved draft preview' });

async function clickDraftAction(
  drawer: ReturnType<typeof draftDrawer>,
  name: string,
  action: 'View saved rows' | 'Compare' | 'Delete',
) {
  const row = drawer.locator('li').filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: action, exact: true }).click();
  return row;
}

async function savedNames(
  drawer: ReturnType<typeof draftDrawer>,
): Promise<string[]> {
  return drawer.locator('li p.font-bold').allTextContents();
}
```

Keep the existing `More`/`Load drafts…`/`Load` helper behavior unchanged.

- [ ] **Step 3: Add the browser tests**

Append these tests to `e2e/specs/draft-save-load.spec.ts`:

```ts
test('views the full saved draft table', async ({ page }) => {
  await insertSchedule({ day: 'Monday', start: '10:00:00', end: '11:30:00', status: 'draft' });
  await insertSchedule({ day: 'Tuesday', start: '13:00:00', end: '14:30:00', status: 'review' });

  await loginAs(page, 'head');
  await openTimetable(page);
  await saveThroughUi(page, 'Preview Draft');

  const drawer = await openDrafts(page);
  await clickDraftAction(drawer, 'Preview Draft', 'View saved rows');
  const preview = draftPreview(page);
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('E2E 101');
  await expect(preview).toContainText('10:00 AM');
  await expect(preview).toContainText('1:00 PM');
});
```

```ts
test('compares a saved draft with the live timetable', async ({ page }) => {
  await insertSchedule({ day: 'Monday', start: '10:00:00', end: '11:30:00', status: 'draft' });
  await loginAs(page, 'head');
  await openTimetable(page);
  await saveThroughUi(page, 'Compare Live');

  const drawer = await openDrafts(page);
  await clickDraftAction(drawer, 'Compare Live', 'Compare');
  const picker = page.getByRole('dialog', { name: 'Choose a draft to compare' });
  await expect(picker).toBeVisible();

  const compareResponse = page.waitForResponse(
    (response) => /\/v1\/schedules\/version-compare/.test(response.url()),
    { timeout: 30_000 },
  );
  await picker.getByRole('button', { name: 'Live timetable', exact: true }).click();
  expect((await compareResponse).ok()).toBeTruthy();

  const compare = page.getByRole('dialog', { name: 'Compare sources' });
  await expect(compare).toContainText('Compare Live');
  await expect(compare).toContainText('Live timetable');
});
```

```ts
test('compares two saved drafts', async ({ page }) => {
  const scheduleId = await insertSchedule({
    day: 'Monday', start: '10:00:00', end: '11:30:00', status: 'draft',
  });
  await loginAs(page, 'head');
  await openTimetable(page);
  await saveThroughUi(page, 'Before Draft');

  await updateSchedule(scheduleId, {
    day_of_week: 'Tuesday', start_time: '13:00:00', end_time: '14:30:00',
  });
  await saveThroughUi(page, 'After Draft');

  const drawer = await openDrafts(page);
  await clickDraftAction(drawer, 'Before Draft', 'Compare');
  const picker = page.getByRole('dialog', { name: 'Choose a draft to compare' });
  await picker.getByRole('button', { name: 'After Draft', exact: true }).click();

  const compare = page.getByRole('dialog', { name: 'Compare sources' });
  await expect(compare).toContainText('Before Draft');
  await expect(compare).toContainText('After Draft');
  await expect(compare).toContainText('added');
  await expect(compare).toContainText('removed');
});
```

```ts
test('deletes only the selected saved draft and leaves live rows unchanged', async ({ page }) => {
  await insertSchedule({ day: 'Monday', start: '10:00:00', end: '11:30:00', status: 'draft' });
  await loginAs(page, 'head');
  await openTimetable(page);
  await saveThroughUi(page, 'Keep Me');
  await saveThroughUi(page, 'Remove Me');

  const liveBefore = await liveSchedules();
  const drawer = await openDrafts(page);
  await clickDraftAction(drawer, 'Remove Me', 'Delete');

  let dialog = page.getByRole('dialog', { name: 'Delete saved draft?' });
  await expect(dialog).toContainText('Remove Me');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await savedNames(drawer)).toContain('Remove Me');

  await clickDraftAction(drawer, 'Remove Me', 'Delete');
  dialog = page.getByRole('dialog', { name: 'Delete saved draft?' });
  const deleteResponse = page.waitForResponse(
    (response) =>
      /\/v1\/schedules\/draft-snapshots\/[^/]+/.test(response.url()) &&
      response.request().method() === 'DELETE',
    { timeout: 30_000 },
  );
  await dialog.getByRole('button', { name: 'Delete saved draft', exact: true }).click();
  expect((await deleteResponse).ok()).toBeTruthy();
  await expect(dialog).toBeHidden();

  expect(await savedNames(drawer)).not.toContain('Remove Me');
  expect(await savedNames(drawer)).toContain('Keep Me');
  expect(await liveSchedules()).toEqual(liveBefore);
});
```

- [ ] **Step 4: Run the page guard tests and E2E type/list checks**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/draft-preview-compare.test.ts && pnpm typecheck:e2e && pnpm test:e2e:list`

Expected: PASS. Do not run Playwright locally; CI Browser E2E is authoritative.

- [ ] **Step 5: Implement the page state and handlers**

In `TimetablePage.tsx`:

- Import `deleteDraftSnapshot` and the three new components.
- Add `buildVersionSource` case for `draft`.
- Add state: `previewDraft`, `compareDraft`, `compareTermId`, `deleteDraft`, `deletingSnapshotId`, `comparePickerOpen`.
- `handlePreviewDraft(snapshot)` sets `previewDraft`.
- `handleOpenDraftCompare(snapshot)` sets `compareDraft` and `comparePickerOpen`.
- `handlePickDraftCompare(target)` sets `compareA` to `{ kind: 'draft', id: compareDraft.snapshotId }`, `compareB` to `target`, `compareTermId` to `activeTerm?.termId ?? null`, clears the picker and `compareDraft`.
- `handleOpenDeleteDraft(snapshot)` sets `deleteDraft`.
- `handleDeleteDraft()` requires active term and department, calls `deleteDraftSnapshot`, invalidates `['term-draft-snapshots', activeTerm.termId, myDeptId]`, clears `previewDraft`/`compareA`/`compareB`/`compareTermId` when they reference the deleted snapshot, closes the dialog, and emits `feedback.success(...)` / `feedback.failed(...)`.
- Reset `compareTermId` to `null` in the existing published compare handler and both `VersionCompareModal` close handlers.
- Render the three new components and pass `onPreview`, `onCompare`, and `onDelete` to `SavedDraftDrawer`; pass `termId={compareTermId ?? undefined}` to `VersionCompareModal`.

- [ ] **Step 6: Run the page guard tests and E2E type/list checks again**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/draft-preview-compare.test.ts && pnpm typecheck:e2e && pnpm test:e2e:list`

Expected: PASS. Do not run Playwright locally.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/timetable/TimetablePage.tsx apps/frontend/src/features/timetable/draft-preview-compare.test.ts e2e/specs/draft-save-load.spec.ts
git commit -m "Wire draft preview compare and delete into timetable" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 7: Whole-branch verification

**Files:**
- No new source files. Fix any failure in the task that owns it.

**Interfaces:**
- Consumes: all tasks above.

- [ ] **Step 1: Run full verification**

Run: `pnpm typecheck && pnpm typecheck:e2e && pnpm test && pnpm test:e2e:list`

Expected: all commands PASS; `pnpm test:e2e:list` discovers the four new browser tests. Do not run `pnpm test:e2e` locally.

- [ ] **Step 2: Check commit scope**

Run: `git status --short && git diff --check && git log --oneline -7`

Expected: clean working tree, no whitespace errors, and six implementation commit subjects using allowed wording with the co-author trailer.

- [ ] **Step 3: Commit fixes if verification found any**

```bash
git add <only-the-files-that-failed>
git commit -m "Fix draft snapshot inspection verification" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

If no fixes were needed, make no commit.
