# Subject catalog default view and cross-department edit requests

- Date: 2026-11-26
- Status: Draft — awaiting approval
- Scope: frontend subject catalog, backend subject ownership, new subject edit-request persistence

## Problem

The subject page currently auto-scopes department heads to their own department and treats every other department's subject as read-only. That blocks legitimate cross-department maintenance, and it gives no way for a department to ask for edit access or for the owning department to see/approve that request. MINOR subjects are shared in practice, but the code does not treat them as editable by every department, and unlabeling a MINOR does not transfer ownership.

## Decisions

Confirmed with the user:

1. **All subjects are shown by default.** Department heads no longer get an automatic `dept` filter. The explicit Department filter and Clear all still work.
2. **Owning department head approves cross-department edits.** A department head editing a foreign, non-MINOR subject must first create a request. The request appears in the subject detail drawer. The owning department head approves or rejects it before any edit is allowed.
3. **Approval is a standing grant.** Approved access lasts until the owning head revokes it or the subject's ownership changes, including when a MINOR is unlabeled. The drawer shows the current status and the revoke action.
4. **MINOR subjects are editable by every department.** A department head never needs a request for a MINOR subject.
5. **Unlabeling transfers ownership.** When a MINOR is unlabeled, the acting department becomes the owner. If the actor has no department, ownership is unchanged.
6. **`college_secretary` needs no approval.** College-wide roles (`college_dean`, `college_secretary`, `administrator`) keep direct edit access and may also respond to requests. A secretary unlabeling a MINOR transfers ownership to the secretary's department when one exists.
7. **No commit, push, merge, or PR** unless explicitly requested.

## Goals

- Remove the department-head default filter without breaking explicit department filtering.
- Add a persistent, auditable subject edit-request workflow visible in the detail drawer.
- Make backend authorization match the frontend gating for update, activate/deactivate, and delete.
- Treat MINOR subjects as shared and implement ownership transfer on unlabel.
- Keep all existing popup/prospectus changes uncommitted and untouched except where they share test wiring.

## Non-goals

- No IDP integration for these requests.
- No "propose exact field changes" workflow; approval grants access and the requester edits through the normal subject form.
- No ownership rule changes in the prospectus PDF import. Import-generated `isMinor` values remain system data, not an actor-driven unlabel.
- No redesign of the global feedback popup or prospectus page.

## Backend design

### New entity and migration

Add `subject_edit_request` (separate from `faculty_request`, whose `termId`/faculty coupling does not fit):

| Field | Purpose |
| --- | --- |
| `request_id` | Identity primary key |
| `subject_id` | FK to `subject`, `ON DELETE CASCADE` |
| `requesting_dept_id` | Department asking for access |
| `owning_dept_id` | Department that owned the subject when the request was created |
| `reason` | Requester explanation, required |
| `status` | `pending`, `approved`, `rejected`, `cancelled`, or `revoked` |
| `created_by`, `responded_by`, `responded_at`, `response_remarks` | Audit trail fields |
| `created_at`, `updated_at` | Timestamps |

Follow the existing Supabase SQL migration conventions: `supabase/migrations/<timestamp>_add_subject_edit_requests.sql`, identity PK, enum type, FKs/indexes, `updated_at` trigger, RLS enabled with service-role grants. Add a partial unique index on `(subject_id) WHERE status = 'pending'` so only one open request exists per subject at a time.

### Endpoints

All routes use the existing JWT/role guards and live under `/api/v1`:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/subjects/edit-requests?status=&subjectId=` | List requests visible to the current user |
| `GET` | `/subjects/:subjectId/edit-request` | Current pending/active request for the drawer |
| `POST` | `/subjects/:subjectId/edit-request` | Create request with `{ reason }` |
| `PATCH` | `/subjects/edit-requests/:requestId` | `{ action: 'approve'|'reject'|'revoke', remarks }` |
| `DELETE` | `/subjects/edit-requests/:requestId` | Cancel a pending request |

Static `edit-requests` routes are declared before the existing `:id` subject routes. Create/cancel/respond routes carry `@Auditable()` like the approvals module.

Visibility:

- Department heads see requests where they are the requester or the owning department.
- College-wide roles see all requests.
- The per-subject endpoint returns the pending request first, then the active approved grant relevant to the drawer.

### Authorization rules

Replace the current single `assertOwnership()` gate with an edit-access check used by update, toggle-active, and remove:

- `administrator`, `college_dean`, `college_secretary`: allowed.
- Department head whose `deptId` matches `subject.deptId`: allowed.
- Department head on a `isMinor === true` subject: allowed.
- Department head on a foreign non-MINOR subject: allowed only when an approved, non-revoked request grant exists for that department and the subject has not changed ownership since approval.
- Everyone else: forbidden, with a message that points to the edit request flow.

Request rules:

- Only a department head with a department may create a request.
- The subject must be non-MINOR, active, and owned by a different active department.
- One pending request per subject; a resolved request allows a new one.
- Approval/rejection is allowed for the owning department head and college-wide roles. Rejection requires remarks.
- Revocation is allowed for the owning department head and college-wide roles, and only applies to an approved grant.
- Cancellation is allowed for the requesting department head and college-wide roles, and only applies while pending.
- Responding to a stale request (ownership changed, subject inactive, or subject deleted) closes it as `cancelled` instead of applying a grant.

### Unlabeling a MINOR

In `SubjectsService.update()`:

- Detect `found.isMinor === true && dto.isMinor === false`.
- Resolve the new owner as the actor's `deptId` when present; otherwise keep the current `deptId`.
- Allow the department move for this transition only, bypassing the current "department heads cannot move subjects" rule.
- Validate that the new owner department is active.
- Set `isMinor = false` and `deptId = actorDeptId` in the same save.
- Revoke any approved grants for the previous owner because ownership changed.

Labeling a regular subject as MINOR does not transfer ownership. Prospectus import is unchanged.

### Notifications and failures

Follow the non-fatal notification pattern used by `ScheduleUnfinalizeService`: notify on submit, approve, reject, cancel, and revoke, but never roll back the business write if notification delivery fails. Reuse `RecipientsService` for owning/requesting department heads and college-wide recipients.

## Frontend design

### Default catalog view

- `getSubjectsDefaultDepartment()` returns `''` when no explicit `dept` is present, for every role.
- `restoreSubjectsDepartmentFilter()` clears `dept` along with the other filters; Clear all no longer restores the department head's department.
- The effect in `SubjectsPage.tsx` no longer writes `dept` into the URL.
- Existing `deptFilter` reading, filtering, pills, and `SubjectFiltersPanel` options remain unchanged.
- Page copy changes from "narrow the list" language to explicit filter language.
- Catalog statistics/counts follow the same visible catalog as the table instead of being hard-scoped to the department head's department.

### Permission derivation

Add a query for approved grants and build a set of subject IDs the current department may manage. `isForeign` becomes:

- `false` for college-wide roles.
- `false` when `subject.isMinor === true`.
- `false` when the subject ID is in the approved-grant set for the current department.
- Otherwise `true` for a department head viewing another department's subject.

All existing gates (row actions, selection, pruning, detail drawer, deep link `?edit=`) use this same helper. Deep-linking to a foreign non-MINOR subject opens the detail drawer on the request section instead of showing a generic read-only error.

### Detail drawer

Add an "Edit access" section to `SubjectDetailPanel.tsx` with a status badge and reason/remarks:

- Foreign non-MINOR, no request: **Request edit** button opens a small reason modal.
- Pending: show pending state; requester sees **Cancel request**; owner/college-wide sees **Approve** and **Reject**.
- Approved: show the granted department; owner/college-wide sees **Revoke**; requester sees full manage actions.
- Rejected/cancelled/revoked: show the decision remarks and allow a new request.
- MINOR: show "Shared subject — all departments may edit" and no request button.

Keep the panel presentational where practical: pass request data and callbacks from `SubjectsPage.tsx`, and emit `feedback.success`/`feedback.failed` from the parent. Invalidate `['subjects']`, `['subject-edit-requests']`, and `['subject-edit-request', subjectId]` after create/cancel/respond so the table, stats, and open drawer stay in sync.

### Subject form

`SubjectFormModal.tsx` computes an effective department at submit and validation time:

- Normal edits use `subject.deptId`/form state as today.
- Editing a MINOR from another department keeps the owner's `deptId`.
- If the original subject was MINOR and the form unchecks MINOR, send the actor's `deptId` as the new owner.
- Foreign MINOR department selects display the owning department as locked text rather than a blank value.

## Verification plan

- Backend Jest tests for: default catalog read, owner edit, MINOR foreign edit, foreign non-MINOR denial without grant, approve/reject/cancel/revoke, one pending request per subject, stale request cancellation, unlabel ownership transfer (including secretary with/without dept), deactivated departments, and delete cascade behavior.
- Frontend source-level tests for: default filter change, `isForeign` MINOR/grant bypass, form effective-dept logic, API client endpoints, drawer request status/actions, and feedback calls. Add `subjects-department-default.test.ts` to the frontend `package.json` test list so its assertions actually run.
- Run `pnpm test` and `pnpm typecheck` in `apps/frontend`, `pnpm test` and `pnpm typecheck` in `apps/backend`, then root `pnpm test`/`pnpm typecheck` and a frontend production build.
- Human browser check: all subjects visible by default, request/approve/reject/revoke flow in drawer, MINOR cross-department edit and unlabel ownership transfer, and the popup countdown line/hover pause from the previous task.

## Risks and mitigations

- **Concurrent requests/grants:** the partial unique index prevents multiple pending rows; stale-state checks before responding prevent grants on changed subjects.
- **Existing uncommitted work:** all changes stay in the current checkout with no commits; scoped diffs are used for review.
- **Other `isMinor` writers:** prospectus import is intentionally out of scope and will not transfer ownership; this is documented rather than silently changed.
- **Role mismatch:** subject write routes currently exclude `administrator`; the new request routes will explicitly include the college-wide roles named in the decisions so backend and UI agree.
