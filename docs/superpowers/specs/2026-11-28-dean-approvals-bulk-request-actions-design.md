# Design — Dean Schedule Approvals bulk request actions

Date: 2026-11-28

## Intent

Make the dean **Schedule Approvals** page easier to manage when several requests need the same decision. The schedule tabs already support multi-select; the request tabs do not. Add multi-select to the three request tabs and expose bulk **Approve** / **Reject** there, while keeping the existing schedule bulk actions unchanged.

Bulk **Publish** means bulk-approving selected **Publish requests** through the existing publish-request endpoint. It does not bypass the publish-approval workflow. Bulk **cancelation** means rejecting selected requests, plus the existing **Return to Draft** / **Unfinalize** actions on schedule tabs. There is no cancel-without-decision action.

Also surface the existing **Department** filter on request tabs so a dean can narrow a batch by department before acting.

The separate request to add an appearance setting for a full-content, no-scroll sidebar is intentionally out of scope here and will be designed after this change.

## Size

Small feature: one page, shared table/feedback patterns, existing APIs, and frontend tests. No backend contract changes.

## Goals

- Request tabs (**Publish requests**, **Unfinalize requests**, **Change requests**) get checkboxes and select-all, limited to pending requests.
- A bulk action bar shows the selected count and offers **Approve**, **Reject**, and **Clear selection**.
- Bulk reject uses one shared remarks value, shown in an in-app confirmation dialog.
- Department filtering works on request rows as well as schedule rows and remains reflected in `?deptFilter=`.
- Decisions reuse `respondToPublishRequest`, `respondToUnfinalizeRequest`, and `respondToChangeRequest`.
- Existing schedule-tab bulk actions stay as they are: **Finalize**, **Return to Draft**, and **Unfinalize**.
- Feedback uses the global `useFeedback()` only.

## Non-goals

- No direct publish button and no publish that skips request approval. Approving selected Publish requests is the bulk publish path.
- No **Send to IDP** bulk action; IDP delivery stays a separate manual header action.
- No backend batch endpoints, new roles, or new permissions.
- No cancel-without-decision action for pending requests.
- No changes to the existing schedule-tab bulk actions or their confirmation copy.
- No changes to request deep links, drawer decisions, or `data-tour` attributes.
- No sidebar appearance setting in this design.

## Anti-goals

- A dean accidentally approving stale, resolved, or mixed-type requests.
- Losing selection state silently when filters or tabs change.
- Replacing the per-request drawer workflow; bulk actions are an addition, not a replacement.

## Constraints

- Each request type has its own response endpoint and side effects: publish approval publishes the entry, unfinalize/change approval return it to draft, and rejections keep the current status.
- Rejections require remarks for publish and change requests. This design requires remarks for all bulk rejections for consistency with the existing drawer UI.
- The existing schedule bulk flow uses `Promise.allSettled`, removes only successful IDs from selection, and reports partial failure. Bulk request actions will follow the same behavior.
- Request rows must be keyed with both kind and id, for example `publish:<requestId>`, so IDs from different request types cannot collide.
- Request rows are not term-scoped; the Department filter must not change that behavior.

## Approaches considered

1. **Extend the current page pattern (chosen).** Add selection to request rows, a request bulk bar, and a shared rejection-remarks dialog on the same page. Reuse `ResponsiveTable`, the existing confirmation pattern, and existing request APIs. This is the smallest change and matches the schedule tabs. Its cost is added state complexity on one already-large component.

2. **Bulk review drawer.** Keep rows non-selectable and open a panel where each selected request gets its own decision and remarks. This handles per-request notes better but is slower and does not give the requested checkbox multi-select.

3. **Backend batch endpoints.** Add atomic approve/reject APIs. This gives stronger consistency but changes backend contracts and stale-state handling well beyond what the page needs.

Choice: approach 1.

## Design

### Selection

- Extend the page’s selection state so it can hold either schedule keys or request keys, never both at once.
- Request keys are `${kind}:${requestId}`.
- Pass `selectable`, `selectedKeys`, `onSelectionChange`, and `isRowSelectable` to the request `ResponsiveTable`.
- `isRowSelectable` returns true only for `status === 'pending'`.
- Selection is cleared on tab change, as it is today, and pruned whenever request filters change.

### Filtering

- Move the Department dropdown out of the schedule-only branch so it renders on all six tabs.
- Extend `filterRequestRows` to accept `deptFilter` and apply it using the request’s schedule department, matching the schedule-tab department logic.
- Keep Request status on request tabs and Status / Section / Faculty on schedule tabs.
- Keep `Showing n of m` driven by the filtered request count on request tabs.

### Bulk actions

- On request tabs, render a toolbar labelled `Bulk request actions` when selection is non-empty.
- Buttons: `Approve (n)`, `Reject (n)`, `Clear selection`.
- Approve opens a confirmation describing the selected request kinds. Confirm sends `{ action: 'approve' }` to each selected request’s endpoint. On the Publish tab this is the bulk publish path.
- Reject opens the same dialog with a required `Remarks (required)` field, max 500 characters, and sends `{ action: 'reject', remarks }`.
- Successful request ids are removed from selection; failures remain selected so the dean can retry or clear them.
- Success and partial-failure messages go through `useFeedback()`.

### Safety and feedback

- Disable bulk buttons while a batch is in flight.
- If the selection contains more than one request kind, confirmation copy lists each kind and count.
- Preserve the drawer as the place for per-request remarks and decision history.
- Preserve all existing `data-tour` values and query parameters.

## Tests

- Frontend source-wiring tests: request tables are selectable; bulk approve/reject exist; no direct publish or bulk IDP action; six tabs and `data-tour` values unchanged.
- Unit tests for request-key creation, pending-only selectability, and department filtering of request rows.
- Component/state tests for select-all, pruning on filter change, successful-selection removal, and partial-failure feedback.
- CI Browser E2E remains authoritative; no local browser E2E run is required for this design.
