# Subject Edit Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show all subjects by default and add an owner-approved cross-department subject edit-request workflow with MINOR shared editing and ownership transfer on unlabel.

**Architecture:** Backend gains a `subject_edit_request` table/service/controller; `SubjectsService` gains a shared edit-access check used by update/toggle/delete and an unlabel ownership transfer. Frontend removes the department-head default filter, derives read-only state from MINOR/approved-grant data, and exposes request actions in the subject detail drawer.

**Tech Stack:** NestJS, TypeORM, PostgreSQL/Supabase SQL migrations, Jest, React/TypeScript, TanStack Query, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-26-subject-edit-requests-design.md`

## Global Constraints

- Do **not** commit, push, merge, or open a PR unless explicitly asked. Every task ends with verification, not a commit.
- All existing popup/prospectus work stays uncommitted; use scoped diffs and do not reset the working tree.
- All subjects are shown by default for every role; explicit `dept` URL filtering still works.
- `college_secretary`, `college_dean`, and `administrator` bypass the edit-request requirement and may respond to requests.
- Approval is a standing grant until revoked or until subject ownership changes, including unlabeling a MINOR.
- MINOR subjects are editable by every department head without a request.
- Unlabeling a MINOR transfers ownership to the acting department when the actor has a `deptId`; otherwise the owner is unchanged.
- One pending request per subject at a time.
- Use `String(...)` comparisons for bigint IDs, matching existing code.
- Use the global feedback popup (`useFeedback`) for request action success/failure messages; no native alerts or local toast state.

## Review Focus

- **Foreign non-MINOR without an approved grant:** must be denied by API and shown read-only in the UI — pinned by Task 4 and Task 6 tests.
- **Approved grant after reload / after ownership change:** must remain active until revoked or ownership changes, then stop working — pinned by Task 3 and Task 4 tests.
- **MINOR cross-dept edit and unlabel:** must allow editing and transfer ownership to the actor's department, including secretary with a dept and actors without one — pinned by Task 4 and Task 8 tests.
- **One pending request / stale request:** duplicate pending requests, inactive departments, or ownership changes before respond must not create conflicting grants — pinned by Task 3 tests.
- **Role bypass consistency:** secretary/dean/admin can edit directly and can respond, while department heads cannot approve their own foreign request — pinned by Task 3, Task 4, and Task 5 tests.

---

### Task 1: Default subject catalog view

**Files:**
- Modify: `apps/frontend/src/features/subjects/subjects-department-default.ts`
- Modify: `apps/frontend/src/features/subjects/subjects-department-default.test.ts`
- Modify: `apps/frontend/src/features/subjects/SubjectsPage.tsx`
- Modify: `apps/frontend/package.json`
- Test: `apps/frontend/src/features/subjects/subjects-department-default.test.ts`

**Interfaces:**
- Consumes: existing `profile.role`, `myDeptId`, URL `dept` param.
- Produces: `getSubjectsDefaultDepartment()` returning `''` when no explicit department; `restoreSubjectsDepartmentFilter()` clearing `dept`; `SubjectsPage.tsx` with no default-dept URL effect and no scoped stats.

- [ ] **Step 1: Write the failing helper tests**

Replace the department-head assertions in `subjects-department-default.test.ts` with:

```ts
assert.equal(
  getSubjectsDefaultDepartment('department_head', 'dept-a', ''),
  '',
);
assert.equal(
  getSubjectsDefaultDepartment('department_head', 'dept-a', 'dept-b'),
  'dept-b',
);

const headParams = restoreSubjectsDepartmentFilter(
  'department_head',
  'dept-a',
  new URLSearchParams('q=math&dept=dept-b&minor=minor'),
);
assert.equal(headParams.get('q'), null);
assert.equal(headParams.get('dept'), null);
assert.equal(headParams.get('minor'), null);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd apps/frontend && pnpm exec node --test src/features/subjects/subjects-department-default.test.ts`
Expected: FAIL because the helper still returns `'dept-a'` and re-sets `dept`.

- [ ] **Step 3: Implement the helper change**

In `subjects-department-default.ts`, make `getSubjectsDefaultDepartment()` return `explicitDepartment ?? ''`, and make `restoreSubjectsDepartmentFilter()` delete every key in `SUBJECT_FILTER_PARAMS` without adding `dept` back. Keep the exported names and parameter order unchanged.

- [ ] **Step 4: Remove page-level default scoping**

In `SubjectsPage.tsx`, delete the effect at lines 145-163 that calls `set('dept', defaultDepartment)`, keep `clearAll()` calling `restoreSubjectsDepartmentFilter()`, remove the `scopedSubjects` memo and use `subjects` for stats, and update the filter-panel copy so it does not imply department heads are pre-scoped. Leave `deptFilter` reading/filtering and `SubjectFiltersPanel` untouched.

- [ ] **Step 5: Add the test file to the frontend test script**

Add `src/features/subjects/subjects-department-default.test.ts` to the `test` script argument list in `apps/frontend/package.json`.

- [ ] **Step 6: Verify**

Run: `cd apps/frontend && pnpm exec node --test src/features/subjects/subjects-department-default.test.ts && pnpm typecheck && pnpm test`
Expected: all tests pass, including the newly registered helper tests.

---

### Task 2: Subject edit-request persistence contract

**Files:**
- Create: `supabase/migrations/20261126010000_add_subject_edit_requests.sql`
- Create: `apps/backend/src/modules/subjects/entities/subject-edit-request.entity.ts`
- Create: `apps/backend/test/subject-edit-request-contract.spec.ts`
- Modify: `apps/backend/src/modules/subjects/subjects.module.ts`
- Modify: `apps/backend/src/modules/notifications/triggers.ts`

**Interfaces:**
- Consumes: Supabase migration conventions and existing trigger registry.
- Produces: `SubjectEditRequest`TypeORM entity with fields `requestId`, `subjectId`, `requestingDeptId`, `owningDeptId`, `reason`, `status`, `createdBy`, `respondedBy`, `respondedAt`, `responseRemarks`, `createdAt`, `updatedAt`; status union `pending|approved|rejected|cancelled|revoked`; five notification triggers under category `approvals`.

- [ ] **Step 1: Write the failing contract test**

Create `subject-edit-request-contract.spec.ts` using `readFileSync` source assertions:

```ts
assert.match(entity, /export type SubjectEditRequestStatus =[\s\S]*?'revoked'/);
assert.match(entity, /@Entity\('subject_edit_request'\)/);
assert.match(entity, /owningDeptId/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.subject_edit_request/);
assert.match(migration, /WHERE status = 'pending'/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(triggers, /'subject_edit_request\.submitted'/);
assert.match(triggers, /'subject_edit_request\.revoked'/);
assert.match(moduleSource, /SubjectEditRequest,/);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd apps/backend && pnpm exec jest test/subject-edit-request-contract.spec.ts --runInBand`
Expected: FAIL because the files do not exist.

- [ ] **Step 3: Create the SQL migration**

Create the migration with: enum `public.subject_edit_request_status`; table `public.subject_edit_request`; identity PK `request_id`; FKs to `public.subject(subject_id) ON DELETE CASCADE`; `requesting_dept_id`, `owning_dept_id`, `reason TEXT NOT NULL`; status default `pending`; audit fields; `created_at`/`updated_at`; partial unique index on `(subject_id) WHERE status = 'pending'`; index on `(status, created_at DESC)`; `updated_at` trigger; RLS enabled with `REVOKE ALL` from `anon, authenticated` and `GRANT ALL` to `service_role`.

- [ ] **Step 4: Create the entity and register it**

Create `SubjectEditRequest` with TypeORM decorators matching the SQL column names and camelCase TypeScript properties. Add it to `TypeOrmModule.forFeature([...])` in `subjects.module.ts`.

- [ ] **Step 5: Add notification triggers**

Add `subject_edit_request.submitted`, `.approved`, `.rejected`, `.cancelled`, and `.revoked` to `TRIGGERS` with category `approvals`, labels mirroring the existing `request.*` triggers, and `defaultEnabled: true`.

- [ ] **Step 6: Verify**

Run: `cd apps/backend && pnpm exec jest test/subject-edit-request-contract.spec.ts --runInBand && pnpm typecheck`
Expected: PASS.

---

### Task 3: Subject edit-request service

**Files:**
- Create: `apps/backend/src/modules/subjects/dto/create-subject-edit-request.dto.ts`
- Create: `apps/backend/src/modules/subjects/dto/respond-subject-edit-request.dto.ts`
- Create: `apps/backend/src/modules/subjects/subject-edit-requests.service.ts`
- Create: `apps/backend/test/subject-edit-requests.service.spec.ts`
- Modify: `apps/backend/src/modules/subjects/subjects.module.ts`

**Interfaces:**
- Consumes: `SubjectEditRequest`, `Subject`, `User`, `DepartmentsService`, `NotificationDispatcherService`, `RecipientsService`.
- Produces: `SubjectEditRequestsService` with:
  - `hasActiveGrant(subjectId: string, deptId: string): Promise<boolean>`
  - `revokeGrantsForOwner(subjectId: string, owningDeptId: string): Promise<void>`
  - `findVisible(input: { status?: SubjectEditRequestStatus; subjectId?: string }, profile: User): Promise<SubjectEditRequest[]>`
  - `findCurrentForSubject(subjectId: string, profile: User): Promise<SubjectEditRequest | null>` (pending first, then active approved grant)
  - `create(subjectId: string, dto: CreateSubjectEditRequestDto, profile: User): Promise<SubjectEditRequest>`
  - `cancel(requestId: string, profile: User): Promise<SubjectEditRequest>`
  - `respond(requestId: string, dto: RespondSubjectEditRequestDto, profile: User): Promise<SubjectEditRequest>`

- [ ] **Step 1: Write failing service tests**

Create `subject-edit-requests.service.spec.ts` with a fake request repo, subject repo, departments stub, dispatcher stub, and recipients stub. Cover:

```ts
it('allows one pending request per subject', async () => { /* second create rejects */ });
it('denies create for a college-wide role, own department, MINOR subject, or inactive department', async () => { /* 403/400 with exact messages from the spec */ });
it('lets only the owning head or college-wide role approve/reject, and requires remarks to reject', async () => { /* assertions */ });
it('lets only the requesting head or college-wide role cancel a pending request', async () => { /* assertions */ });
it('returns the pending request before any approved grant for the drawer', async () => { /* assertions */ });
it('cancels a stale pending request when ownership changed before respond', async () => { /* status becomes cancelled, no grant */ });
it('marks a revoke action as revoked and stops hasActiveGrant', async () => { /* assertions */ });
it('reports an approved grant only while status is approved and ownership is unchanged', async () => { /* hasActiveGrant true then false after revoke */ });
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd apps/backend && pnpm exec jest test/subject-edit-requests.service.spec.ts --runInBand`
Expected: FAIL from missing module/class.

- [ ] **Step 3: Implement DTOs**

`CreateSubjectEditRequestDto` uses `@IsString()`, `@MaxLength(1000)` on `reason`. `RespondSubjectEditRequestDto` uses `@IsIn(['approve','reject','revoke'])` on `action` and optional `@MaxLength(1000)` on `remarks`.

- [ ] **Step 4: Implement the service**

Implement the signatures above with constructor order `(requestRepo, subjectRepo, departments, dispatcher, recipients)`. Use `this.subjectRepo.findOne()` for current subject state, `departments.assertDepartmentActive()` for requester/owner/target departments, `repo.findOne({ where: { subjectId, status: 'pending' } })` for dedupe, `status: 'approved'` as the active grant, and `revokeGrantsForOwner()` to mark approved requests for the old owner as `revoked`. Dispatch `subject_edit_request.submitted/.approved/.rejected/.cancelled/.revoked` for the matching action. Wrap all dispatcher calls in `try/catch` that logs and does not throw.

- [ ] **Step 5: Register the provider and imports**

Add `SubjectEditRequestsService` to `providers` and `exports`, and import `NotificationsModule` into `subjects.module.ts` if not already present.

- [ ] **Step 6: Verify**

Run: `cd apps/backend && pnpm exec jest test/subject-edit-requests.service.spec.ts --runInBand && pnpm typecheck`
Expected: PASS.

---

### Task 4: SubjectsService shared edit access and unlabel transfer

**Files:**
- Modify: `apps/backend/src/modules/subjects/subjects.service.ts`
- Modify: `apps/backend/test/subjects.service.spec.ts`
- Modify: `apps/backend/src/modules/subjects/subjects.module.ts`

**Interfaces:**
- Consumes: `SubjectEditRequestsService.hasActiveGrant()` and `.revokeGrantsForOwner()`.
- Produces: `SubjectsService` where `update`, `toggleActive`, and `remove` all use one private `assertCanEdit(subject, profile)`; unlabeling sets `deptId` to actor dept and revokes old grants.

- [ ] **Step 1: Write failing service tests**

Append `SubjectEditRequestsService` as the final constructor dependency of `SubjectsService`, then add cases to `test/subjects.service.spec.ts` using its existing `createFakeRepository()`/`subjectRow()` helpers and an injected stub:

```ts
it('allows the owning head and college-wide roles to update', async () => {});
it('allows another head to update a MINOR subject without changing its deptId', async () => {});
it('allows another head to update only when hasActiveGrant resolves true', async () => {});
it('rejects another head on a non-MINOR subject with no grant before repo.save', async () => {});
it('transfers ownership to the acting dept on unlabel and revokes the old owner grants', async () => {});
it('keeps the current owner when the actor has no dept on unlabel', async () => {});
it('revokes grants whenever a college-wide role changes deptId', async () => {});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd apps/backend && pnpm exec jest test/subjects.service.spec.ts --runInBand`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement `assertCanEdit`**

Add a private `assertCanEdit(subject: Subject, profile: User | undefined): Promise<void>` using this order: unauthenticated → 403; `administrator|college_dean|college_secretary` → allow; non-`department_head` → 403; `isMinor` or matching `deptId` → allow; `await this.editRequests.hasActiveGrant(String(subject.subjectId), String(profile.deptId))` → allow or throw `ForbiddenException('Request edit access from the owning department before modifying this subject.')`.

- [ ] **Step 4: Wire the check into write paths**

Use `assertCanEdit()` in `update`, `toggleActive`, and `remove` in place of `assertOwnership()`. Keep the duplicate-code, units, elective, and department-active validations intact.

- [ ] **Step 5: Implement unlabel transfer**

In `update`, capture `oldDeptId = String(found.deptId ?? '')` before changes. Compute `wasMinor = found.isMinor`, `actorDeptId = profile.deptId ? String(profile.deptId) : null`, and `nextDeptId = wasMinor && dto.isMinor === false ? actorDeptId ?? oldDeptId : dto.deptId !== undefined ? String(dto.deptId) : oldDeptId`. Validate `nextDeptId` with `departments.assertDepartmentActive()`. Allow a department-head `deptId` change only for the unlabel transition. If `nextDeptId !== oldDeptId`, await `editRequests.revokeGrantsForOwner(String(found.subjectId), oldDeptId)`. Assign `found.deptId = nextDeptId` and `found.isMinor = dto.isMinor ?? found.isMinor`, then save once.

- [ ] **Step 6: Verify**

Run: `cd apps/backend && pnpm exec jest test/subjects.service.spec.ts --runInBand && pnpm typecheck`
Expected: PASS.

---

### Task 5: Subject edit-request HTTP endpoints

**Files:**
- Create: `apps/backend/src/modules/subjects/subject-edit-requests.controller.ts`
- Create: `apps/backend/test/subject-edit-request-routes.spec.ts`
- Modify: `apps/backend/src/modules/subjects/subjects.module.ts`

**Interfaces:**
- Consumes: `SubjectEditRequestsService` from Task 3.
- Produces: `GET /v1/subjects/edit-requests`, `GET /v1/subjects/:subjectId/edit-request`, `POST /v1/subjects/:subjectId/edit-request`, `PATCH /v1/subjects/edit-requests/:requestId`, `DELETE /v1/subjects/edit-requests/:requestId`, all returning `{ data }`.

- [ ] **Step 1: Write the failing route contract test**

Create a source-level Jest test asserting the controller contains each decorator/path literal above, every route uses `@Roles('administrator', 'college_dean', 'college_secretary', 'department_head')`, and create/respond/cancel carry `@Auditable()`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd apps/backend && pnpm exec jest test/subject-edit-request-routes.spec.ts --runInBand`
Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the controller**

Use `JwtAuthGuard`, `RolesGuard`, `@Controller('v1/subjects')`, and `req.profile`. Register `SubjectEditRequestsController` **before** `SubjectsController` in the module `controllers` array so its `edit-requests` static routes win over existing `:id` routes; do not add new `:id` routes to `SubjectsController`. Parse `status` and `subjectId` query values before passing to `findVisible()`.

- [ ] **Step 4: Register the controller**

Add `SubjectEditRequestsController` to `controllers` in `subjects.module.ts`.

- [ ] **Step 5: Verify**

Run: `cd apps/backend && pnpm exec jest test/subject-edit-request-routes.spec.ts --runInBand && pnpm typecheck`
Expected: PASS.

---

### Task 6: Frontend API client and editable-state derivation

**Files:**
- Create: `apps/frontend/src/api/subject-edit-requests.api.ts`
- Create: `apps/frontend/src/features/subjects/subject-edit-access.test.ts`
- Modify: `apps/frontend/src/features/subjects/SubjectsPage.tsx`
- Modify: `apps/frontend/src/features/subjects/components/SubjectDetailPanel.tsx` (props only)

**Interfaces:**
- Consumes: backend endpoints from Task 5; `SubjectRecord`; `useAuthStore`.
- Produces: API functions `fetchSubjectEditRequests`, `fetchSubjectEditRequestForSubject`, `createSubjectEditRequest`, `respondToSubjectEditRequest`, `cancelSubjectEditRequest`; type `SubjectEditAction = 'approve'|'reject'|'revoke'`; `isForeign` that checks MINOR and approved grants; detail-panel props for request data/callbacks.

- [ ] **Step 1: Write failing source tests**

Create `subject-edit-access.test.ts` with assertions:

```ts
assert.match(api, /fetchSubjectEditRequests/);
assert.match(api, /\/v1\/subjects\/edit-requests/);
assert.match(api, /fetchSubjectEditRequestForSubject/);
assert.match(api, /createSubjectEditRequest/);
assert.match(api, /respondToSubjectEditRequest/);
assert.match(api, /cancelSubjectEditRequest/);

const isForeign = page.slice(page.indexOf('const isForeign'), page.indexOf('// ── Detail panel'));
assert.match(isForeign, /s\.isMinor/);
assert.match(isForeign, /approvedSubjectIds/);
assert.match(page, /owningDeptId/);
assert.match(page, /requestingDeptId/);
assert.doesNotMatch(page, /next\.set\('dept'/);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd apps/frontend && pnpm exec node --test src/features/subjects/subject-edit-access.test.ts`
Expected: FAIL because the API client and `isForeign` changes do not exist.

- [ ] **Step 3: Implement the API client**

Create the client following `schedule-unfinalize.api.ts`: types `SubjectEditRequestStatus`, `SubjectEditRequest`, `SubjectEditAction`, functions named above, `api.get/post/patch/delete`, and `return data.data`. `respondToSubjectEditRequest` sends `{ action, remarks }`; `createSubjectEditRequest` sends `{ reason }`.

- [ ] **Step 4: Derive approved grants in `SubjectsPage.tsx`**

Add a `useQuery` with key `['subject-edit-requests', { status: 'approved' }]`, build `approvedSubjectIds` from requests whose `requestingDeptId === myDeptId`, pass it into `isForeign`, and add a second query keyed `['subject-edit-request', detailEntry?.subjectId]` for the drawer. Derive `canRespond` as college-wide role or department head whose dept equals `editRequest.owningDeptId`; derive `canCancel` as college-wide role or department head whose dept equals `editRequest.requestingDeptId`. Keep `isForeign` as the single permission helper used by row actions, selection, pruning, deep links, detail props, and `isRowSelectable`.

- [ ] **Step 5: Extend detail-panel props**

Add `editRequest: SubjectEditRequest | null`, `canRespond: boolean`, `canCancel: boolean`, `onRequestEdit: (reason: string) => void`, `onCancelRequest: () => void`, and `onRespond: (action: SubjectEditAction, remarks: string) => void` to `SubjectDetailPanelProps`. Do not implement the UI yet.

- [ ] **Step 6: Verify**

Run: `cd apps/frontend && pnpm exec node --test src/features/subjects/subject-edit-access.test.ts && pnpm typecheck && pnpm test`
Expected: PASS after the prop wiring compiles.

---

### Task 7: Detail drawer request UI and feedback

**Files:**
- Modify: `apps/frontend/src/features/subjects/components/SubjectDetailPanel.tsx`
- Modify: `apps/frontend/src/features/subjects/SubjectsPage.tsx`
- Create: `apps/frontend/src/features/subjects/subject-detail-requests.test.ts`

**Interfaces:**
- Consumes: props from Task 6; `useFeedback` from `FeedbackToast.tsx`; `extractApiError`.
- Produces: drawer status section, request/cancel/approve/reject/revoke buttons, reason/remarks modal, parent mutation handlers with feedback and cache invalidation.

- [ ] **Step 1: Write failing source tests**

Create `subject-detail-requests.test.ts` asserting:

```ts
assert.match(panel, /Edit access/);
assert.match(panel, /Request edit/);
assert.match(panel, /Cancel request/);
assert.match(panel, /Approve/);
assert.match(panel, /Reject/);
assert.match(panel, /Revoke/);
assert.match(panel, /Shared subject/);
assert.match(page, /feedback\.success\('Edit access requested\.'\)/);
assert.match(page, /feedback\.failed\(extractApiError\(err/);
assert.match(page, /invalidateQueries\(\{ queryKey: \['subject-edit-requests'\] \}\)/);
assert.match(page, /invalidateQueries\(\{ queryKey: \['subjects'\] \}\)/);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd apps/frontend && pnpm exec node --test src/features/subjects/subject-detail-requests.test.ts`
Expected: FAIL because the drawer UI and mutations do not exist.

- [ ] **Step 3: Implement drawer presentation**

Add an "Edit access" section in the Details tab. Render the status badge and reason/remarks; for MINOR render "Shared subject — all departments may edit"; for foreign non-MINOR without a grant render the request/cancel actions; for owner/college-wide render approve/reject/revoke actions; disable the normal Edit button while a request is pending. Keep local reason/remarks modal state and reset it when `subject?.subjectId` or `editRequest?.requestId/status` changes.

- [ ] **Step 4: Implement page mutations**

In `SubjectsPage.tsx`, add mutations calling the Task 6 API functions. On success emit `feedback.success('Edit access requested.' | 'Edit request cancelled.' | 'Edit request approved.' | 'Edit request rejected.' | 'Edit access revoked.')`; on error emit `feedback.failed(extractApiError(err, fallback))`. Invalidate `['subjects']`, `['subject-edit-requests']`, and `['subject-edit-request', subjectId]` after every successful action.

- [ ] **Step 5: Verify**

Run: `cd apps/frontend && pnpm exec node --test src/features/subjects/subject-detail-requests.test.ts && pnpm typecheck && pnpm test`
Expected: PASS.

---

### Task 8: Subject form ownership and deep link

**Files:**
- Modify: `apps/frontend/src/features/subjects/components/SubjectFormModal.tsx`
- Modify: `apps/frontend/src/features/subjects/SubjectsPage.tsx`
- Create: `apps/frontend/src/features/subjects/subject-form-ownership.test.ts`

**Interfaces:**
- Consumes: `SubjectRecord`, `myDeptId`, `isMinor` form state, `?edit=` URL param.
- Produces: effective department derivation on submit/validation, locked owner display for foreign MINOR, deep link opening the drawer for foreign non-MINOR subjects.

- [ ] **Step 1: Write failing source tests**

Create `subject-form-ownership.test.ts`:

```ts
const payload = modal.slice(modal.indexOf('const payload: CreateSubjectInput'), modal.indexOf('if (mode === \'create\')'));
assert.match(payload, /subject\.isMinor && !form\.isMinor/);
assert.match(payload, /myDeptId/);
assert.match(payload, /deptId: effectiveDeptId/);
assert.match(modal, /Locked to owning department/);

const deepLink = page.slice(
  page.indexOf('if (isForeign(target)) {'),
  page.indexOf('if (isForeign(target)) {') + 500,
);
assert.match(deepLink, /setDetailEntry\(target\)/);
assert.doesNotMatch(deepLink, /feedback\.error\(/);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `cd apps/frontend && pnpm exec node --test src/features/subjects/subject-form-ownership.test.ts`
Expected: FAIL because effective dept and deep-link behavior are unchanged.

- [ ] **Step 3: Implement effective department**

In `SubjectFormModal.tsx`, define `effectiveDeptId` before validation and submit: when `mode === 'edit' && subject?.isMinor && !form.isMinor`, use `myDeptId || form.deptId`; otherwise use `form.deptId`. Use `effectiveDeptId` for the duplicate-code check, `isDirty()` comparison, and `payload.deptId`. For a foreign MINOR edit, render the owning department as locked text instead of an empty disabled select.

- [ ] **Step 4: Update deep-link handling**

In `SubjectsPage.tsx`, when `?edit=<id>` resolves to a foreign non-MINOR subject, open the detail panel with that subject and focus/expand the Edit access section instead of showing the current `feedback.error(...)`. Leave `?edit` behavior for editable subjects unchanged.

- [ ] **Step 5: Verify**

Run: `cd apps/frontend && pnpm exec node --test src/features/subjects/subject-form-ownership.test.ts && pnpm typecheck && pnpm test`
Expected: PASS.

---

### Task 9: Whole-workspace verification

**Files:**
- No source files; verification only.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified working tree with no commits.

- [ ] **Step 1: Confirm the checkout is still uncommitted**

Run: `git rev-parse HEAD && git status --short`
Expected: HEAD is still `9e6739f443cea6783f8d8cc9a59bcf888e65907a`; no commit has been created.

- [ ] **Step 2: Run backend verification**

Run: `cd apps/backend && pnpm typecheck && pnpm test`
Expected: typecheck passes; all Jest suites pass.

- [ ] **Step 3: Run frontend verification**

Run: `cd apps/frontend && pnpm typecheck && pnpm test && pnpm build`
Expected: typecheck passes; 120+ tests pass; production build succeeds with no new CSS/Tailwind warnings.

- [ ] **Step 4: Run workspace verification**

Run: `pnpm typecheck && pnpm test`
Expected: all workspace typechecks and tests pass.

- [ ] **Step 5: Human browser check**

Ask the human to verify: all subjects visible by default; explicit dept filter still works; request/approve/reject/cancel/revoke in drawer; approved grant allows cross-dept edit until revoked/ownership change; MINOR cross-dept edit and unlabel ownership transfer; secretary/dean/admin bypass; popup countdown line visible and hover pause/resume still works.
