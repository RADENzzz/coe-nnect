# Multi-select bulk actions for timetable — design

Status: proposed (awaiting approval)

## Intent and why

A department head currently publishes and manages plotted schedules one entry at a time through the detail drawer. With many subjects in a term, that means repeated open → finalize → request → close cycles.

This design adds multi-select to the timetable so a head can clear, delete, move to `review`, finalize, and request publication for several plotted entries at once. Publication still requires Dean approval, and sending to IDP remains a separate manual Dean-page action.

## Goals

- Add a leading checkbox to each selectable timetable row in both grid and agenda views.
- Show a floating bulk-action bar when one or more rows are selected.
- Support bulk **Delete**, **Review**, **Finalize**, and **Request publish**.
- Keep **Clear auto-drafts** available in the timetable header without a selection.
- Fan out through the existing single-row APIs with `Promise.allSettled`; no backend changes.
- Report successes and failures through global `useFeedback()` only.
- Preserve all existing timetable deep-link query parameters.
- Remove the fixed amber “sessions need manual plotting” notice from the timetable.

## Non-goals

- No new array endpoints, schema changes, or migrations.
- No direct publish from the timetable; no automatic IDP queueing.
- No Dean-side batch approval changes.
- No changes to the `finalized`/`published` lock rules or to which rows may be edited or overwritten.
- No native `alert`, `confirm`, or `prompt`; no local toast or local success/failure state.
- No changes to `?request=`, `?publishRequest=`, `?changeRequest=`, `?newTerm=1`, or `?termId=…` handling.

## Constraints

- Approach A is fixed: frontend fan-out over the existing `deleteSchedule(id)`, `updateScheduleStatus(id, status)`, `createPublishRequest(id, note?)`, and `clearAutoDrafts(termId, deptId)` APIs.
- `updateScheduleStatus` accepts `draft | review | finalized` only. A direct attempt to set `published` is rejected by `SchedulingService.updateStatus()`.
- `deleteSchedule` rejects `finalized` and `published` rows; `draft` and `review` rows may be deleted.
- `createPublishRequest` requires `finalized` status, department-head role, ownership, an active department, and no existing pending request. It does not publish and does not touch IDP.
- Finalizing a row with a pending cross-department faculty approval is rejected by the backend.
- Leaving `finalized` cancels any pending publish request; the fan-out must rely on existing server guards rather than duplicating them in the client.
- Only `draft` rows remain editable/overwrite candidates. This feature does not change that rule.
- Global `useFeedback()` is the only user-facing result channel.

## Decided design

### UI — option B

- Each selectable row card gets a checkbox at its leading edge, in both `ClassBlock` (grid) and `AgendaClassCard` (agenda).
- Toggling a checkbox calls `stopPropagation()` so the row click does not open the detail drawer.
- Selectable rows are owned, non-read-only rows whose status is not `published`. `finalized` rows stay selectable so they can be sent for publication. Non-selectable rows show no checkbox.
- Selection is a `Set<string>` of schedule IDs in `TimetablePage`, following the `DeanApprovalsPage` pattern.
- Selection survives grid/agenda view switches. It is cleared when the term or department changes, when **Clear selection** is clicked, and for each row that a bulk action successfully changes.
- A fixed bar appears above the bottom nav when `selectedIds.size > 0`. It shows the count and the buttons **Delete**, **Review**, **Finalize**, **Request publish**, and **Clear selection**. Buttons wrap on narrow screens.
- **Clear auto-drafts** stays in the header as a separate, always-available action. It is not part of the selected-row bar.
- **Send to IDP** is not added to this bar; it remains the Dean approval page's manual, term-wide action.

### Action behavior

| Action | Eligible selected rows | API fan-out | Confirmation |
| --- | --- | --- | --- |
| Delete | `draft`, `review` | `deleteSchedule(id)` | Custom modal |
| Review | `draft` | `updateScheduleStatus(id, 'review')` | None |
| Finalize | `draft`, `review` | `updateScheduleStatus(id, 'finalized')` | None |
| Request publish | `finalized` | `createPublishRequest(id, sharedNote?)` | Custom modal with one optional note for the whole batch |
| Clear auto-drafts | None | `clearAutoDrafts(termId, deptId)` | Custom modal |

- Ineligible selected rows are skipped locally and counted in feedback; the backend remains authoritative for ownership, active-department, duplicate-request, and lock guards.
- If no selected row is eligible for the clicked action, show a global error explaining why and keep the selection unchanged.
- Finalize and Request publish remain separate clicks so the head reviews the finalized set before asking the Dean.

### Feedback and refresh

- Use `Promise.allSettled` over the eligible IDs, as `DeanApprovalsPage` does.
- Remove only successful IDs from `selectedIds`; keep failed IDs selected so they can be retried.
- Invalidate `['schedules', termId]`, `['faculty-requests']`, `['flagged']`, `['unplotted-minors']`, `['schedule-versions']`, `['coverage']`, `['schedule-unfinalize-requests']`, `['schedule-publish-requests']`, and `['schedule-change-requests']`. Also invalidate per-entry publish/change-request queries touched by the affected rows.
- All successes: `feedback.success(...)` with a pluralized count.
- Any failure: `feedback.failed(...)` with succeeded/failed counts and the first extracted API error.
- No native dialogs and no local toast or success/failure state.

### Deep links

- Bulk handlers do not navigate and do not read or write search params.
- Existing `?request=`, `?publishRequest=`, `?changeRequest=`, `?newTerm=1`, and `?termId=…` behavior is untouched.
- Opening or closing a bulk confirmation modal is local state only.

### Manual plotting notice removal

- Remove the fixed amber details panel at the end of `TimetablePage.tsx` that renders “N sessions need manual plotting” and its per-session **Plot manually →** links.
- Remove the `useQuery` that exists only to feed that panel. Keep the `fetchUnscheduled` import because the auto-generate flow still calls it directly.
- This also removes the only fixed element that could compete with the new bottom bar for the same screen corner.

## Tests

- Frontend source/unit tests: checkbox `stopPropagation`, selection Set updates, eligible-row filtering, `Promise.allSettled` fan-out through the existing APIs, global feedback calls, no native dialogs, and no search-param writes from bulk handlers.
- Confirm `pnpm typecheck`, `pnpm typecheck:e2e`, `pnpm test`, and `pnpm test:e2e:list` pass. CI Browser E2E remains authoritative; local browser E2E stays skipped because `e2e/.env.local` targets the dead Supabase project.
- Manual browser check: grid and agenda selection, mobile bar wrapping, mixed eligible/ineligible selection, partial failure feedback, and that the amber notice is gone.
