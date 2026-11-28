# Draft snapshot preview, compare, and delete design

## Intent

The saved-drafts drawer currently shows a name, saved time, row count, and term label. The load preflight shows counts and conflicts, but not the rows themselves. A department head cannot tell what is actually inside a saved draft, or what loading it would change, until after committing to the load. Stale saves also have no cleanup path.

Add a read-only way to inspect the whole saved table, compare it with the current live timetable or another saved draft in the same term and department, and delete saved drafts that are no longer needed.

## Goals

- Show every draft/review row in a saved snapshot in the existing read-only timetable grid.
- Compare a saved draft against the live grid for the same term, or against another saved draft for the same term and department.
- Reuse the existing compare engine, diff tones, change lists, and side-by-side grids instead of writing a second diff implementation.
- Delete a saved snapshot from the drawer after in-app confirmation.
- Keep preview and compare read-only: no rows written, deleted, finalized, published, or cancelled.
- Keep delete scoped to the saved snapshot record: it never changes timetable rows, faculty requests, approvals, or publish state.
- Keep department heads confined to their own department and keep snapshots locked to their original term.
- Preserve all existing timetable behavior, deep links, tours (including `tt-focus`), More-menu labels, and load semantics.

## Non-goals

- No editing rows inside preview or compare grids.
- No rename, share, compare across terms, or compare against published/history versions in this pass.
- No changes to save/load confirmation, conflict rules, or the existing `Load this draft` flow.
- No schema migration, backfill, or new table.
- No new admin UI path; admin API access remains available for back-office use.

## Constraints

- Saved snapshots live in `public.term_draft_snapshot` as JSON. The list route exposes only `DraftSnapshotSummary`; the full entries are not yet sent to the browser.
- The existing compare route accepts `published:<id>`, `history:<id>`, and `live:<termId>`. Its controller permits several roles; saved drafts are restricted to `department_head` and `administrator`.
- `compareEntries()` groups rows by subject + `section_id ?? section_code` + load type, sorts each group by `session_index`, then pairs by position. Status is intentionally not part of the diff.
- `versionEntryToEntry()` and `buildCompareToneMaps()` already map snapshot-shaped rows to read-only grid entries and diff tones.
- Snapshots can contain two sessions of the same offering; `session_index` must survive preview and compare.
- Existing source-guard tests assert the old `VersionSource` union, exactly four DH/admin decorators on the draft controller, and that `draft:` is an unknown source. They must be updated, not preserved.
- Existing E2E fixtures provide only `head` and `dean` roles and one department. Cross-role and cross-department rejections belong in backend tests; browser E2E covers the reachable head flow.
- `VersionCompareModal` currently renders an inline query error block. Since all new feedback must use global `useFeedback()`, that block is replaced with `useFeedback()` for both existing and draft sources.
- CI Browser E2E is authoritative. Local browser E2E is not run.

## Approaches

### A. Saved drafts as a real compare source (chosen)

Add a `draft:<snapshotId>` source kind to the compare service and a dedicated read-only entries endpoint. Preview uses the entries endpoint in a single grid; compare reuses `VersionCompareModal` with the new source kind. Pair it with a dedicated delete route that removes only the snapshot row.

Trade-off: touches backend routes, compare service, and frontend API/UI, but reuses the proven diff and grid rendering. It gives one consistent answer to “what is in it?”, “what would change?”, and “remove this save”.

### B. Client-side preview from extended preflight

Extend the load preflight payload with entries, then build a custom modal and local diff for the browser.

Trade-off: fewer backend surfaces, but duplicates the pairing/diff rules already in `compareEntries()` and `buildCompareToneMaps()`, risks divergence from live/published compare, and couples inspection to the preflight request. Rejected.

### C. Compare draft against an empty synthetic source

Reuse `VersionCompareModal` without adding a draft source by treating a snapshot as published/history data.

Trade-off: smallest change, but lies about source identity, bypasses term/department guards, and cannot reliably compare two saved drafts. Rejected.

## Design

### Backend

1. **Snapshot detail endpoint**

   Add to `DraftSnapshotController`:

   ```text
   GET /v1/schedules/draft-snapshots/:snapshotId/entries?termId=&deptId=
   ```

   Roles: `department_head`, `administrator`. Response:

   ```ts
   type DraftSnapshotDetail = DraftSnapshotSummary & {
     entries: DraftSnapshotEntry[];
   };
   ```

   Add `TermDraftSnapshotService.detail(snapshotId, termId, deptId, actor)`. It reuses the existing guards: actor/department authorization, active term, snapshot original-term lock, and snapshot department match. It returns only `draft`/`review` entries, preserves `session_index`, and sorts deterministically by subject code, section code, load type, session index, day, and start time. Because `toSummary()` counts raw JSON entries, detail overrides `entryCount` with the filtered draft/review count so the header matches the grid.

2. **Snapshot delete endpoint**

   Add to `DraftSnapshotController`:

   ```text
   DELETE /v1/schedules/draft-snapshots/:snapshotId?termId=&deptId=
   ```

   Roles: `department_head`, `administrator`, with `@Auditable({ action: 'schedule.draft_delete', source: 'Scheduling' })`.

   Add `TermDraftSnapshotService.delete(snapshotId, termId, deptId, actor)`. It reuses the same actor, active-term, department-match, and original-term guards as `detail()`. It deletes only the `term_draft_snapshot` row. It does not touch `schedule`, faculty gates, approval requests, or published versions. A missing snapshot is reported as not found rather than silently succeeding, so the UI can refresh accurate state.

3. **New compare source kind**

   Extend `VersionSourceKind` to `published | history | live | draft`. `parseSource()` accepts `draft:<snapshotId>`. The compare endpoint gains an optional `termId` query parameter:

   ```text
   GET /v1/schedules/version-compare?a=draft:12&b=live:7&termId=7&deptId=2
   ```

   `deptId` continues to be resolved by `resolveVersionDeptId()`. For any `draft:` source, the service additionally requires a resolved department and a `termId`, and rejects actors that are not `department_head` or `administrator`. Adding the draft dependency changes the `VersionCompareService` constructor; the backend unit fixture must be updated.

4. **Comparison pairing rules**

   `VersionCompareService.normalize()` delegates `draft:` sources to `TermDraftSnapshotService.detail()`. Each normalized source records its kind and term. When either side is a `draft:` source:

   - The other side must be `live:` or another `draft:` source.
   - Both sides must resolve to the same `termId`.
   - Both sides must resolve to the same department.
   - A `live:` side is limited to `draft`/`review` rows, because those are the only rows a load can replace. Published and finalized rows do not appear as false removals.
   - For two drafts, the clicked draft is `a`/Before and the picked target is `b`/After.
   - A mismatch is rejected before diffing; no rows are read from the other source beyond normalization.

   Published/history comparisons are unchanged when no `draft:` source is involved. Existing `live:` comparisons are unchanged when no `draft:` source is involved.

5. **Compare summary labels**

   Extend `ComparedVersionSummary` with optional `label` and `termId`. Draft sources use the saved draft name as `label`; live sources use `Live timetable`. Existing published/history summaries remain unchanged, so this is non-breaking. The modal hides the `by {finalizedByName ?? 'unknown'}` line for draft and live sources and uses a neutral source icon instead of the history-only icon.

6. **No writes on inspect paths**

   The entries endpoint and compare path only read the snapshot row and the live rows. They do not call faculty-gate, preflight, apply, rollback, or delete code.

### Frontend

1. **API client**

   - Extend `VersionSource` with `kind: 'draft'`.
   - Add `fetchDraftSnapshot(snapshotId, termId, deptId): Promise<DraftSnapshotDetail>`.
   - Add `deleteDraftSnapshot(snapshotId, termId, deptId): Promise<void>`.
   - Extend `compareVersionSources(a, b, deptId, termId?)` to send `termId` when supplied.
   - Extend `VersionCompareResult` summary types with optional `label`.

2. **Saved drafts drawer**

   Each saved draft row keeps its existing `Load` button and gains:

   - `View saved rows` — opens a read-only preview modal.
   - `Compare` — opens a small target picker with `Live timetable` and the other saved drafts for the same term as options, then opens the existing compare modal.
   - `Delete` — opens the delete confirmation modal.

   Proposed row sketch:

   ```text
   Working A                                  3 rows · saved Nov 28, 4:22 PM
   [View saved rows] [Compare] [Delete]        [Load]
   2026-2027 · 1st · First Semester
   ```

3. **Preview modal**

   Add `DraftPreviewModal`: a `Modal` containing the saved snapshot name, term label, row count, and one read-only `TimetableGrid` built from `DraftSnapshotEntry[]` via `versionEntryToEntry()`. It omits `onEntryClick`, `onEntryMove`, and `onExternalDrop`, and passes every rendered id through `readOnlyEntryIds`. It has `Close` and `Compare with live` actions. It never calls preflight or load.

   If the snapshot has no remaining draft/review rows, the modal shows an empty grid with `No draft or review rows in this saved draft`. This is a valid preview, not an error.

4. **Delete confirmation**

   Add `DeleteDraftModal`: a `Modal` titled `Delete saved draft?`, naming the snapshot and warning that deletion cannot be undone. Footer actions are `Cancel` and `Delete saved draft`. No native `confirm()` is used. The in-flight flag only disables buttons; it is not a success/failure state.

   On success, `TimetablePage` closes the modal, invalidates/refreshes the saved-draft list, calls `feedback.success(...)`, and clears any preview or compare selection that referenced the deleted snapshot. On failure it calls `feedback.failed(...)` and keeps the modal open.

5. **Compare modal reuse**

   `VersionCompareModal` gains an optional `termId`, includes it in the React Query key and `queryFn`, and passes it to `compareVersionSources()`. Source labels prefer the optional summary `label`; otherwise they keep today's `Published source` / `History source` / `Live source` text. Draft sources render in the existing Before/After grids with `added`, `removed`, and `changed` tones and the existing change lists.

   The existing inline query error block is replaced with `useFeedback()` so all compare failures use the global path. The `All departments` option remains available for existing published/history/live compares; when a draft source is present, an unresolved department is rejected by the backend and surfaced through `useFeedback()`.

6. **State and feedback**

   `TimetablePage` owns preview, compare, delete, and target-picker selection state. All success and failure messages use global `useFeedback()`. There is no local toast, `alert`, `confirm`, `prompt`, or local success/failure state. Read-only queries use existing query client defaults; delete invalidates the draft-list query.

7. **Preserved behavior**

   More-menu labels, `Saved timetable drafts`, `Load this draft`, `data-tour` values, deep links, manual approval flows, bulk selection, wheel scrolling, and no-direct-publish rules remain untouched. The compare modal keeps two `TimetableGrid` instances and the existing `published-version-compare` query-key substring.

### UX flow sketch

```text
More → Load drafts…
  Saved timetable drafts · 2026-2027 · 1st · First Semester

  Working A                      3 rows
  [View saved rows] [Compare] [Delete]    [Load]
  Working B                      3 rows
  [View saved rows] [Compare] [Delete]    [Load]

View saved rows
  ┌──────────────────────────────┐
  │ Working A — 3 rows           │
  │ [read-only timetable grid]   │
  │ [Close] [Compare with live]  │
  └──────────────────────────────┘

Compare
  Before: Working A      After: Live timetable
  +added  −removed  =unchanged
  [side-by-side grids with diff tones]

Delete saved draft?
  Delete "Working A"? This cannot be undone.
  [Cancel] [Delete saved draft]
```

## Testing

- Backend route/source guard: replace the old assertions that `draft:` is unknown; assert it parses. Update the draft controller decorator-count assertion to six DH/admin routes, including entries and delete, and update the `VersionCompareService` unit fixture for the new dependency. Compare with a draft rejects dean/secretary, missing `termId`, missing `deptId`, cross-term live, cross-term draft, and cross-department draft.
- Backend service tests: detail returns only draft/review rows, overrides `entryCount` with the filtered count, preserves `session_index`, and applies term/department lock. Compare pairs repeated sessions correctly and limits a draft comparison's live side to draft/review rows. Delete removes only the snapshot row, respects term/department locks, and reports a missing snapshot.
- Frontend source guards: update the exact `VersionSource` union assertion. Assert the API client exports `fetchDraftSnapshot` and `deleteDraftSnapshot`, `VersionSource` includes `draft`, `compareVersionSources` sends `termId`, the drawer exposes `View saved rows`, `Compare`, and `Delete`, the preview uses a read-only `TimetableGrid`, and compare failures use `useFeedback()`.
- Browser E2E additions using the existing `head` fixture: view the full saved table; compare a saved draft with live; compare two saved drafts; cancel delete keeps the row; confirm delete removes the row and leaves timetable rows unchanged. Use the existing More-menu helper pattern and CI Browser E2E as the authority. Cross-term, cross-department, and non-DH rejections stay in backend tests because the current E2E fixtures cannot exercise them.
- Preserve the existing published-version guard tests: two compare grids, the `published-version-compare` query-key substring, and the More-menu selector pattern.

## Deployment and rollback

- No migration and no environment variables.
- Rollback is a code revert. Snapshot data is unchanged except for deletes explicitly confirmed by users.
- Existing saved drafts remain valid because the JSON shape is unchanged.

## Builder latitude

- Exact component file naming and small prop shapes are the implementer's call.
- Whether the Compare target picker is a modal, popover, or inline drawer section is the implementer's call, provided the two targets remain clear and keyboard accessible.
- The delete confirmation styling and exact feedback copy are the implementer's call, provided the title/actions above are used and no native dialog is used.
- Existing labels named in the prior design (`Save as draft…`, `Load drafts…`, `Save timetable draft`, `Saved timetable drafts`, `Load this draft`) must not be renamed.
