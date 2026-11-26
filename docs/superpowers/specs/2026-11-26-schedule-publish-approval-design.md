# Schedule publish approval — design

Status: proposed (awaiting approval)

## Intent and why

A published schedule entry is visible on the public planner and is eligible for the IDP feed. Today a department head can set an entry straight to `published` from the timetable detail drawer, and the Dean approval page also has a direct batch-publish action. That makes publication a local editing decision instead of a reviewed one.

This design makes publication a Dean-reviewed decision for **each schedule entry individually**:

1. The head finishes and finalizes the entry.
2. The head requests publish approval.
3. The Dean approves, which publishes the entry, or rejects, which returns the entry to `draft` and records a reason.
4. The head sees the pending request and the Dean's note in the schedule detail drawer.

This is phase 0 of the larger version-scheduling work. It must land before reusable published versions, because version reuse assumes an unambiguous boundary between editable drafts and protected published entries.

## Goals

- Remove direct `draft/finalized → published` status changes from the plotting/timetable UI.
- Remove the Dean approval page's direct batch-publish action; the only valid publish path is an approved publish request.
- Keep `finalize` as a direct head action, with the existing finalize snapshot behavior unchanged.
- Give each schedule entry one pending publish request at a time.
- On rejection, return the entry to `draft` and persist the Dean's note for display in the detail drawer.
- Notify the Dean when a request is filed and the head when it is approved or rejected.
- Preserve the existing unfinalize flow for `published → draft`.

## Non-goals

- Archived/reusable published versions, conflict reuse, overwrite preflight, and the drag-and-drop conflict resolution workspace.
- Multi-version auto-generation.
- Changing how the public planner or IDP feed reads schedule rows.
- Batch publish approval.
- Allowing any reuse/edit flow to modify a `published`, `finalized`, or `review` row. Those statuses stay fixed; only `draft` rows are editable or overwrite candidates in later phases.

## Anti-goals

- Silent publication without a Dean decision.
- Losing the reason a request was rejected.
- Letting a head bypass approval through a direct status call or a Dean-page batch button.
- Reusing the unfinalize request for the opposite direction and inheriting its "rejection keeps published" semantics.

## Constraints

- Status enum is `draft | review | finalized | published`; the database status-flow trigger allows `finalized → published` and `finalized → draft`.
- `SchedulingService.updateStatus()` currently permits a head to set `published`, and only blocks a head from taking a published row back to draft.
- `ScheduleDetailDrawer` currently exposes all four statuses in a select.
- `DeanApprovalsPage` currently has a batch `publish` action that calls `updateScheduleStatus(id, 'published')`.
- `schedule_unfinalize_request` already models a per-entry Dean decision, but its approve path is `published → draft` and its reject path leaves the row published. It cannot represent this new flow without changing meaning.
- Published rows are the source for the public planner and IDP publish payload; no snapshot table should become authoritative in this phase.
- Global `useFeedback` is required; no native `alert`, `confirm`, or `prompt`, and no local toast state.
- Migrations are append-only, use `YYYYMMDDHHMMSS_snake_case.sql`, and must have a timestamp later than `20261126010000`.

## Approaches considered

### A. New `schedule_publish_request` table and service — chosen

Mirror `schedule_unfinalize_request` with a separate entity, service, controller, and dean inbox section. The new request's approve path is `finalized → published`; its reject path is `finalized → draft`.

This keeps each direction's semantics obvious, preserves the existing unfinalize flow untouched, and fits the per-entry detail-drawer model the panel asked for. Cost: one migration and a second request queue in the dean approval page.

### B. Generalize unfinalize into `schedule_status_request` with a direction flag

One table and one dean queue for both publish and unfinalize. Lower duplication, but rejection means different things in each direction (`draft` for publish rejection, `published` for unfinalize rejection), and the migration/refactor would touch the existing working flow.

### C. Reuse the faculty-request approval module

Would reuse an existing approval surface, but faculty requests are a separate domain with IDP status publishing. Schedule entries would be second-class and the rejection note would not naturally belong to the schedule detail drawer.

## Decided design

### Data model

Add `schedule_publish_request`, modeled on `schedule_unfinalize_request`:

- `request_id` bigint primary key.
- `schedule_id` bigint, not null, FK to `schedule` with `ON DELETE CASCADE`.
- `dept_id` bigint, nullable, copied from the schedule when filed.
- `requested_by` uuid, nullable, FK to `users` with `SET NULL`.
- `note` text, nullable — optional context from the head when filing.
- `status` enum `pending | approved | rejected | cancelled`, default `pending`.
- `responded_by` uuid, nullable, FK to `users` with `SET NULL`.
- `responded_at` timestamptz, nullable.
- `response_remarks` text, nullable — required on rejection.
- `created_at`, `updated_at` timestamptz.
- Partial unique index: one `pending` request per `schedule_id`.
- Indexes on `status`, `term` lookup through `schedule`, and `requested_by`.
- RLS enabled with no anon/authenticated client policies, like `schedule_unfinalize_request`; the NestJS service connection owns all reads and writes.

Do not add a `term_id` column to the request. Term, subject, section, and department are read through the schedule relation, so a request cannot drift from its entry.

### Status rules

- A request may be filed only when `schedule.status === 'finalized'`.
- Only a `department_head` may file, and only for a schedule in their department. `college_dean` and `administrator` do not file publish requests.
- The active-department guard still applies.
- `approve` is allowed only from `pending` and only when the schedule is still `finalized`. It sets the schedule to `published` and the request to `approved`.
- `reject` is allowed only from `pending` and only when the schedule is still `finalized`. It sets the schedule to `draft`, stores `response_remarks`, and sets the request to `rejected`.
- If the schedule leaves `finalized` while a request is pending — for example, it is returned to draft directly — the service cancels the pending request so it cannot be approved later.
- Dean and administrator may decide requests. All other roles are denied.
- Existing finalization behavior is unchanged: `updateStatus(..., 'finalized')` still writes a term snapshot.

### API

Add a dedicated controller, mirroring `ScheduleUnfinalizeController`, under `v1/schedules`:

- `GET /v1/schedules/publish-requests?status=&termId=` — Dean/admin inbox.
- `PATCH /v1/schedules/publish-requests/:requestId` — Dean/admin approve or reject, with optional approve remarks and required rejection remarks.
- `GET /v1/schedules/:id/publish-request` — open or latest request for one schedule entry, used by the drawer.
- `POST /v1/schedules/:id/publish-request` — head files a request from a finalized entry.

DTOs:

- `CreateSchedulePublishRequestDto` with optional `note` (max 1000 chars).
- `RespondSchedulePublishRequestDto` with `action: 'approve' | 'reject'` and `remarks?: string`; service requires non-empty `remarks` for rejection.

Audit decorators should be used for filing and responding, matching the unfinalize controller.

### Direct publish removal

- `ScheduleDetailDrawer`: remove `published` from the head's status options. When the entry is `finalized`, show `Request publish approval` instead.
- `SchedulingService.updateStatus()`: reject direct attempts to set `published` through the normal status endpoint, including from the Dean. Publication happens only inside the publish-request service.
- `DeanApprovalsPage`: remove the direct batch `publish` action and its IDP publish side effect from the status toolbar. The page gains a publish-request section instead.
- The approval service owns the status transition and calls the existing status-change notification path with `previousStatus: 'finalized'` and `newStatus: 'published'` or `'draft'`. It must not route through the public `updateStatus()` endpoint.

### Dean approval page

Add a `Publish requests` section beside the existing published-unfinalize requests section:

- Pending list with subject, section, term, department, requester, filed time, and optional head note.
- Approve/reject buttons open a decision modal using global feedback.
- Reject requires remarks; approve may include remarks.
- Support `?request=<requestId>` deep links from notifications, opening the decision modal for that request. Clear only `request` with `replace: true`, matching the existing unfinalize deep-link pattern.
- Invalidate `['schedule-publish-requests']`, `['schedule-publish-request', scheduleId]`, `['schedules']`, `['coverage']`, `['flagged']`, and `['schedule-unfinalize-requests']` after a decision.

### Detail drawer

- Show status and a `Request publish approval` action when `finalized`.
- While a request is pending, show `Publish approval pending` and disable duplicate filing.
- After rejection, show a clear `Dean note` block with `responseRemarks` and the decision time; the entry is `draft`.
- Keep the existing published-entry unfinalize request flow unchanged.
- Use global `useFeedback` for file/decision results.

### Notifications and deep links

Add three trigger keys:

- `schedule.publish_requested` → Dean and administrators, destination `/approvals?request=<requestId>`.
- `schedule.publish_approved` → department heads of the schedule and requester, destination `/timetable?focus=<scheduleId>`.
- `schedule.publish_rejected` → department heads of the schedule and requester, destination `/timetable?focus=<scheduleId>`.

Payloads should include `requestId`, `scheduleId`, `subjectId`, `subjectCode`, `subjectTitle`, `sectionCode`, `termName`, `deptId`, `note`, `responseRemarks`, `decidedByName`, `previousStatus`, and `newStatus`. `notification-target.ts` must resolve the new request entity type and triggers shell-aware for both `/timetable` and `/dean/timetable`.

### Tests

- Backend service specs: file only from finalized; one pending per entry; approve publishes; reject drafts with remarks; cancel stale pending; role guards; active-department guard.
- Controller/contract spec: routes and DTO validation.
- Notification payload spec: all three trigger keys and their deep-link data.
- Frontend source-wiring tests for the drawer status options, dean publish-request section, and notification-target resolver, following the repo's existing test style.
- Existing unfinalize tests must still pass unchanged.

## Relationship to later phases

After this lands, the protected statuses are unambiguous: only `draft` rows may be overwritten by version reuse. Publication is an approved, auditable event. The next design can then define a per-term published version, archive labels, stale behavior, and reuse preflight without revisiting who is allowed to publish.

## Left to the builder

- Exact file/component names, following existing `ScheduleUnfinalize*` naming.
- Migration timestamp and index names.
- Exact notification copy and icon choices.
- Whether the head's optional `note` is shown in the Dean list or only on the request detail modal. My call: show it in both, truncated in the list.

## Acceptance criteria

1. A head cannot publish from the timetable drawer or any direct status endpoint.
2. A head can finalize an entry and file one publish request.
3. The Dean sees that request and can approve or reject it individually.
4. Approval makes the entry `published` and notifies the head.
5. Rejection makes the entry `draft`, stores the Dean's remarks, notifies the head, and shows the note in the detail drawer.
6. A published entry still requires the existing unfinalize request to return to draft.
7. Public planner and IDP behavior is unchanged except that publication can only occur through the approval path.
