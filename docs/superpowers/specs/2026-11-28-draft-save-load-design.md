# Draft timetable save and load design

Date: 2026-11-28

## Intent

Department heads need to save the live timetable they are still shaping and come back to it later. Today the only term-wide snapshot is `term_published_version`, which is published-only, rewritten in place, and has no user-facing folder. There is no way to keep several named working drafts for one term or restore one after the grid changes.

This adds named draft snapshots that belong to one term, are labeled with that term's school year and semester, and can be loaded back after a full validation pass. It is a working-copy feature, not a publication path: it never finalizes, publishes, or sends anything to the Dean or IDP.

## Goals

- Save a named snapshot of the current **draft and review** rows for the active term.
- Load that snapshot back into the **same** active term, restoring its draft and review rows.
- Label each snapshot with its term: school year, semester, and term name.
- Before loading, re-check subject, section, room, faculty, department, meeting time, and hard conflicts with the same rules used by plotting and reuse.
- Leave `finalized` and `published` rows untouched at all times.
- Use the global `useFeedback()` pattern for every success and failure message.

## Non-goals

- No changes to `term_published_version`, the published archive, or published reuse.
- No cross-term loading, no direct publish, no Dean approval, no IDP request, and no status-flow changes.
- No rename, delete, share, or compare action for saved drafts in this pass.
- No client-side/browser-only storage.

## Constraints

- New backend table, entity, DTOs, service, controller, and frontend API/UI are required; this is not a frontend-only change.
- Backend-only table: RLS enabled, no client policies, `anon`/`authenticated` revoked, `service_role` granted.
- Draft operations are restricted to `department_head` and `administrator`, matching reuse. A department head is always confined to their own department; an administrator supplies `deptId`.
- Saving and loading require an active term and a department id. The grid is only writable for an active term.
- Duplicate snapshot names are allowed; the list distinguishes them by saved timestamp.
- Commit subjects must not use `feat` or `chore`, must not end with `:`, and must include `Co-authored-by: trynotybort <trynotybort@gmail.com>`.
- CI Browser E2E is authoritative. Local browser E2E stays skipped because `e2e/.env.local` targets a dead Supabase project.

## Approaches considered

1. **Dedicated draft-snapshot table with its own preflight/apply (chosen).** Named rows per term, draft-aware validation, and full control over which statuses may be replaced. Costs one migration and a new service, but keeps published archive semantics intact.
2. **Replayable operation log through existing single-row plot APIs.** Fewer new backend types, but validation becomes chatty, partial failure is hard to unwind, and all-or-nothing load is weaker.
3. **Add a draft kind to `term_published_version`.** Reuses archive plumbing, but fights the one-row-per-term uniqueness and published lifecycle. Rejected as too risky.

## Decisions

- **Row scope:** snapshots contain only `draft` and `review` rows. Loading may replace those two statuses only; `finalized` and `published` rows are never overwritten, deleted, or created by this feature.
- **Load semantics:** load is a restoration of the saved draft set, not a merge. Snapshot entries become the authoritative draft/review rows for that term and department: matching rows are updated, missing rows are created, and current draft/review rows absent from the snapshot are removed. Non-draft rows are untouched and reported as kept as-is.
- **All-or-nothing apply:** any hard conflict, missing catalog item, inactive department, or malformed entry blocks the whole load. The preflight result is shown before confirmation; the confirm button is disabled while conflicts exist.
- **Statuses are preserved:** each snapshot entry keeps its `draft` or `review` status. The backend filters incoming snapshot entries to those two statuses before assessment, so a tampered snapshot cannot smuggle in a finalized or published row.
- **Term lock:** `preflight` and `load` reject a snapshot whose `termId` does not equal the target term, even if the UI never offers that choice.
- **Active term only:** both save and load require the term to be active. Deactivated terms keep their snapshots for later reactivation.
- **Roles:** all endpoints use `@Roles('department_head', 'administrator')`. Department heads are forced to their own `deptId`; administrators must pass `deptId`. The UI shows the new More-menu items only when the user is a department head with a department id and the grid is writable.
- **Catalog checks reuse existing behavior:** resolve subject, section, room, and faculty by id first and then by code/name, reject deactivated receiving or subject-owning departments, reject incomplete meeting times, and treat a subject no longer in the term's prospectus as a conflict. Cross-department faculty requests are created in apply mode and rolled back if validation fails or the load is blocked.
- **Conflict checks reuse the rule engine:** call `RuleContextBuilder.build()` then `ConstraintsService.evaluate()`. Hard conflicts block the load; soft warnings are shown but do not block. Because the whole draft/review set is being replaced, every current draft/review row in scope is passed via `excludeScheduleIds`; `finalized` and `published` rows remain obstacles. Accepted snapshot entries are also injected into later evaluations as synthetic `existingSchedule` rows (`scheduleId: 'snapshot:<index>'`), so conflicts *inside* the saved draft are caught too.
- **Match key:** an entry matches a live row by resolved subject id, resolved section id (falling back to section code), normalised `load_type`, and `session_index`. Status is deliberately not part of the key, so a row saved as draft but now in review is updated back to draft rather than duplicated. Unmatched snapshot entries are creates; unmatched live draft/review rows are removes.
- **Pending faculty requests:** a live draft/review row with `pendingFacultyRequestId` is a conflict and blocks the load, matching reuse. When a load removes a row, call `cancelOrphanedFacultyRequest()` the same way `SchedulingService.remove()` does. Gates newly created during apply are rolled back if validation or any write fails.
- **All-or-nothing includes writes:** use one TypeORM transaction for schedule inserts/updates/deletes where feasible. Supabase-backed faculty requests and notifications cannot join that transaction, so create gates only after preflight succeeds and compensate them on failure. A partial grid replacement is not acceptable.
- **Empty snapshots:** saving zero draft/review rows is rejected with a clear message. A tampered or empty snapshot fails preflight rather than acting as a request to clear the grid.

## Data shape

New table `term_draft_snapshot`:

- `term_draft_snapshot_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
- `term_id bigint NOT NULL REFERENCES term(term_id) ON UPDATE CASCADE ON DELETE CASCADE`
- `dept_id bigint NOT NULL REFERENCES department(dept_id) ON UPDATE CASCADE ON DELETE CASCADE`
- `name text NOT NULL`, trimmed, non-blank, max 120 characters in the DTO
- `term_name text NOT NULL`, `semester text`, `school_year text NOT NULL` — copied from the term at save time for the folder label
- `snapshot jsonb NOT NULL` — `{ "entries": DraftSnapshotEntry[] }`
- `created_by uuid REFERENCES users(user_id) ON DELETE SET NULL`
- `created_at timestamptz DEFAULT now()`
- `updated_at timestamptz DEFAULT now()` with the existing `set_updated_at()` trigger
- Indexes on `(term_id, dept_id)`, `(term_id, dept_id, created_at DESC)`, and `created_at DESC`
- RLS enabled; revoke from `anon`/`authenticated`; grant to `service_role`

`DraftSnapshotEntry` uses the same field set as `PublishedVersionEntry` (`schedule_id`, `subject_id`, `subject_code`, `subject_title`, `section_id`, `section_code`, `faculty_id`, `faculty_name`, `faculty_code`/`employee_id`/`wmsu_id` when available, `external_faculty_name`, `room_id`, `room_number`, `building`, `external_room_name`, `day_of_week`, `start_time`, `end_time`, `load_type`, `remarks`, `dept_id`, `session_index`), with `status` restricted to `draft` or `review`. Keeping the fallback codes and names is required so a stale id can still resolve against the current catalog. It deliberately does not restore original `schedule_id` values. Repeated `(subject, section, loadType)` sessions are numbered in the same stable order used by `TermPublishedVersionService.writeTerm()`.

## API

New controller registered before `SchedulingController` so the literal `draft-snapshots` prefix is not captured by `v1/schedules/:id`.

- `GET /v1/schedules/draft-snapshots?termId=&deptId=` — summaries only, newest first.
- `POST /v1/schedules/draft-snapshots` — body `{ termId, deptId, name }`; audited as `schedule.draft_save`.
- `POST /v1/schedules/draft-snapshots/:snapshotId/preflight` — body `{ termId, deptId }`; read-only.
- `POST /v1/schedules/draft-snapshots/:snapshotId/load` — body `{ termId, deptId, confirmed: true }`; audited as `schedule.draft_load`.

Preflight result shape:

```ts
type DraftLoadResult = {
  matched: number;
  ready: number;
  create: number;
  update: number;
  remove: number;
  keptAsIs: number;
  warnings: number;
  conflicts: DraftLoadConflict[];
  failed: boolean;
  summary: string;
};
```

`DraftLoadConflict` mirrors `ReuseConflict`: the source entry, optional target schedule id, `action: 'conflict'`, and a human-readable reason.

## Frontend

- Add API functions and types to `apps/frontend/src/api/schedule.api.ts`; use React Query key `['term-draft-snapshots', termId, deptId]`.
- Extend `moreMenuItems` in `TimetablePage.tsx` with **Save as draft…** and **Load drafts…**, gated by `writable && activeTerm && isDepartmentHead && myDeptId`. Keep all existing `data-tour` values, especially `tt-focus`, unchanged.
- Save dialog: a `Modal` showing the term folder label and count of draft/review rows, with a required name field. Empty/blank names and API errors use `feedback.error(...)`; success uses `feedback.success(...)`, closes the dialog, and invalidates the snapshot list.
- Load drawer: an `aside role="dialog"` labelled **Saved timetable drafts**, showing one folder header (`schoolYear · semester · termName`) and each snapshot with its name, saved timestamp, and entry count. An empty state explains that no drafts are saved for this term.
- Clicking a saved draft calls preflight and opens a summary modal with counts and conflicts. The **Load this draft** button is enabled only when `conflicts.length === 0 && !failed`. Applying invalidates `['schedules', termId]`, `['unscheduled', …]`, `['coverage', …]`, `['faculty-requests']`, and the snapshot list.
- No `alert`, `confirm`, `prompt`, local toast, or local success/failure state. Busy/disabled state for an in-flight request is fine.

## Implementation notes for the builder

- Migration: new file in `supabase/migrations/` using the existing `YYYYMMDDHHMMSS_snake_case.sql` convention and backend-only RLS pattern from `20261126040000_add_term_published_versions.sql`. Regenerate the DDL snapshot with `pnpm db:snapshot` and update `docs/DATABASE STRUCTURE/README.md`.
- Backend: `apps/backend/src/modules/scheduling/entities/term-draft-snapshot.entity.ts`, DTOs under `dto/`, service under `services/`, controller under `controllers/`, and registration in `scheduling.module.ts`.
- Catalog resolution: factor the id/code/name resolvers and time parsers currently private in `services/schedule-reuse.service.ts` into a shared helper used by both reuse and the new service if the existing contract tests remain green; otherwise duplicate the minimal logic rather than changing reuse behavior.
- Frontend: `TimetableMoreMenu.tsx` already supplies the More-menu roles used by E2E. Reuse `Modal` and the drawer pattern from `VersionHistoryDrawer.tsx`.
- Conflict validation: build each candidate context with `excludeScheduleIds` containing every current draft/review row in scope, then append synthetic `ScheduleEntryContext` rows for already-accepted snapshot entries before calling `ConstraintsService.evaluate()`. This is what catches snapshot-internal conflicts.
- Removal path: reuse `SchedulingService.remove()`'s orphan-request cleanup for rows the load deletes; never cancel a request that was already pending before the load starts, because that row blocks preflight.
- Tests: add backend contract/route specs, a frontend source-guard test for the new menu items and feedback usage, and `e2e/specs/draft-save-load.spec.ts` covering save, conflict-blocked load (including a snapshot-internal conflict), successful restoration, cross-term rejection, and a pending-faculty-request row. Existing feedback-migration guards may need the new dialog/drawer files added to their file lists.
- Verification: `pnpm typecheck && pnpm typecheck:e2e && pnpm test && pnpm test:e2e:list`, plus CI Browser E2E.

## Left to the builder

- Exact component splitting between dialog, drawer, and summary modal.
- Whether the shared catalog helper is extracted or duplicated, as long as reuse behavior and its contract tests stay unchanged.
- Whether the transaction is a single TypeORM `DataSource.transaction()` or repository-level calls plus explicit compensation, as long as a failed load leaves the grid and faculty requests unchanged.
- Precise copy for empty states, conflict reasons, and feedback messages, as long as they name the saved draft and the affected term.
- E2E fixture setup for producing a `review` row and a conflicting live row.
