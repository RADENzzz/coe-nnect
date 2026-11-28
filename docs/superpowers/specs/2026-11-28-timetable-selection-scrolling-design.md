# Timetable selection and scrolling design

Date: 2026-11-28

## Intent

The timetable bulk-action bar already works, but three interactions still fight the user:

1. Wheel scrolling over the grid does not move the main page, so scrolling only works with the cursor outside the table.
2. There is no select mode. Checkboxes are permanently visible and clicking a class body always opens its detail drawer.
3. Selection allows mixed statuses and excludes published rows, which does not match how the user wants to batch workflow actions.

This change makes the existing full-page layout scroll naturally, adds a select mode that starts from the first checkbox tick, locks selection to one status, and adds a bulk Request unfinalize path for published rows.

## Goals

- Keep the current full-view layout. Wheel events over the timetable must be able to scroll the main app scroll container; do not introduce a second fixed-height viewport or change the page structure.
- After the first checkbox tick, body clicks on class blocks/cards toggle selection instead of opening the detail drawer. Checkboxes hide while in select mode. Clearing the selection exits select mode.
- The first selected row's status locks selection: draft with draft, review with review, finalized with finalized, published with published.
- Published rows are selectable. A published selection exposes bulk **Request unfinalize**, using one shared reason for every selected row.
- Keep selected rows visibly identifiable after checkboxes hide.

## Non-goals

- No backend, schema, migration, or endpoint work.
- No direct publish, no automatic Dean approval, no automatic IDP handoff.
- No new per-row action on published entries; the existing single-row unfinalize request remains the only API used.
- No changes to deep-link parameters, `data-tour` values, or the positions of Auto-Generate and Plot Subject.

## Constraints

- Fan out only over existing single-row APIs (`createUnfinalizeRequest` for published rows).
- All success/failure feedback goes through the global `useFeedback()`; no `alert`, `confirm`, `prompt`, local toast, or local success/failure state.
- The shared reason field stays within the existing 5–500 character validation used for Request change.
- CI Browser E2E remains authoritative; local browser E2E stays skipped because the local Supabase project is dead.

## Approaches considered

### Scrolling

1. **CSS scroll chaining (chosen):** remove `overscroll-contain` from the TimetableGrid scrollport so vertical wheel events can chain to the AppShell main scroll container once the grid reaches its edge. Keeps sticky day headers, horizontal scrolling, and the full-view layout. Tradeoff: the grid can still consume a wheel gesture until its own edge is reached.
2. **JS wheel forwarding:** intercept vertical wheel events on the grid and programmatically scroll the nearest scrollable ancestor. Gives immediate page movement but adds custom wheel math and risks breaking trackpad horizontal scrolling and drag interactions.
3. **Fixed-height grid:** bound the grid to the viewport so it owns all scrolling. Rejected because the user explicitly wants the current full-page layout to stay.

### Select mode

1. **Derived mode from selection state (chosen):** `selectionMode = selectedScheduleIds.size > 0`. Route the existing `onEntryClick` callbacks through a handler that toggles selection while the mode is active; hide the checkboxes while active. Matches the user's "starts after first checkbox tick" request without adding another control.
2. **Explicit Select toggle:** add a header button. Rejected; the user chose first-checkbox entry.
3. **Always select on body click:** rejected; the detail drawer would need a separate entry point.

### Status lock and published action

1. **Lock on first selected status (chosen):** store the locked status when the first row is selected and filter selectable IDs by it. Published becomes selectable; its contextual bulk action is Request unfinalize. This preserves the backend workflow, where published rows cannot take change requests.
2. **Allow mixed statuses with eligible subsets:** rejected by the user's new requirement.
3. **Allow published change requests:** rejected because the backend deliberately forbids them and the work must stay frontend-only.

## Decisions

The following are calls made here, not additional decisions requested from the user:

- A mismatched status click while select mode is active is ignored and reported once through global feedback (`Selection is locked to <status> rows. Clear the selection to switch.`). A body click on a row that is not selectable at all is ignored without feedback to avoid noise.
- Selected rows get a visible outline in select mode because their checkboxes are hidden.
- Request unfinalize uses the same shared-reason modal rules as Request change: 5–500 characters, one value sent to every selected row.
- After a successful bulk unfinalize, affected rows leave the selection; if the selection becomes empty, select mode exits.
- The singular per-entry unfinalize query key is invalidated for affected published IDs, matching the existing per-entry invalidation pattern for publish/change requests.

## Implementation notes for the builder

- `TimetablePage.tsx` owns `selectedScheduleIds`, `selectionStatus`, and the derived select-mode flag. Extend `handleToggleSelect` to apply the status lock, add a body-activation handler for grid/agenda clicks, and clear the lock whenever the selection empties.
- `selectableScheduleIds` should include published rows (still excluding foreign/read-only rows) and, when locked, only rows with the locked status.
- `onEntryClick` passed to `TimetableGrid`, `AgendaView`, and any other entry-card surface should use the body-activation handler, not the drawer handler.
- `ClassBlock` and `AgendaClassCard` should hide their checkbox when select mode is active; keep the card body clickable so the page handler can decide between selection and drawer.
- Add a selected-state outline without overriding conflict/diff rings.
- `bulk-actions.util.ts`: add `'request-unfinalize'` to `BulkRowAction`, mark `published` eligible, and add `published` to `BulkStatusCounts`.
- `useBulkScheduleActions.ts`: import `createUnfinalizeRequest`, add the fan-out case, invalidate `['schedule-unfinalize-request', id]` for affected IDs, and keep `Promise.allSettled`, skipped-count reporting, fulfilled-only `onSucceeded`, and pending-action behavior unchanged.
- `BulkActionConfirmModal.tsx`: add the unfinalize action with shared-reason validation and Dean-approval copy.
- `BulkActionBar.tsx`: show a published chip and the Request unfinalize button only when published rows are selected.
- Update the existing timetable source tests for the new source patterns and utility expectations. Do not add local browser tests; CI Browser E2E is the authority.

## Open questions

None. All behavior decisions were settled in conversation; the remaining details are implementation calls recorded above.
