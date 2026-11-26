# Schedule Publish Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct schedule publishing with a per-entry Dean approval workflow where approval publishes and rejection returns the entry to draft with a visible note.

**Architecture:** Add a backend-only `schedule_publish_request` table and a `SchedulePublishService` mirroring the existing unfinalize-request service, but with opposite rejection semantics. Remove direct publish from the normal status endpoint and both current UI surfaces, then add a parallel Dean inbox section, drawer request controls, and dedicated notifications/deep links. The existing manual **Send to IDP** button stays unchanged; approval itself never queues IDP.

**Tech Stack:** NestJS + TypeORM + Supabase SQL migrations + React Query + React Router + global `useFeedback`, Jest/Node test runners.

**Spec:** `docs/superpowers/specs/2026-11-26-schedule-publish-approval-design.md`

## Global Constraints

- Commit subjects must not use `feat`, `chore`, or end with `:`. Every authored commit must include `Co-authored-by: trynotybort <trynotybort@gmail.com>`.
- Use global `useFeedback`. Do not use native `alert`, `confirm`, or `prompt`, and do not add local toast/success/error state.
- Migrations are append-only, use `YYYYMMDDHHMMSS_snake_case.sql`, and must sort after `20261126010000`. Supabase SQL owns the schema; TypeORM `synchronize` stays `false`.
- Only `draft` rows are editable or overwrite candidates. `review`, `finalized`, and `published` rows stay fixed.
- Publication is valid only through an approved publish request. `SchedulingService.updateStatus()` must reject `published` for all roles.
- IDP remains a separate manual Dean action. Publish-approval code must not call `publishIdpSchedule`.
- Publish requests use `?publishRequest=<id>`. The `?request=<id>` param stays reserved for unfinalize/faculty/subject requests so bigint IDs cannot collide.
- Pending request notifications use dedicated triggers. Do not dispatch `schedule.status_changed` from the publish-request service.

## Review Focus

- A request decided after its schedule left `finalized` must be cancelled with an error, never published or drafted — pinned in Task 3 stale-decision tests.
- A direct `PATCH /v1/schedules/:id/status` with `{ status: 'published' }` must fail even when called by the Dean — pinned in Task 3 direct-publish guard test.
- A rejection with blank remarks must fail and leave the schedule `finalized` — pinned in Task 3 rejection-validation test.
- Notification dispatch failure must not roll back request creation or a Dean decision — pinned in Task 2 and Task 3 notification-isolation tests.
- `?publishRequest=5` and `?request=5` must open independently because request IDs can collide — pinned in Task 7 source-wiring test and Task 8 resolver test.

---

### Task 1: Schema and entity contract

**Files:**
- Create: `supabase/migrations/20261126020000_add_schedule_publish_requests.sql`
- Create: `apps/backend/src/modules/scheduling/entities/schedule-publish-request.entity.ts`
- Modify: `apps/backend/src/modules/scheduling/scheduling.module.ts`
- Test: `apps/backend/test/schedule-publish-request-contract.spec.ts`

**Interfaces:**
- Consumes: existing `Schedule`, `User`, and `scheduling.module.ts` registration arrays.
- Produces: `SchedulePublishRequest` entity with fields `requestId: string`, `scheduleId: string`, `deptId: string | null`, `requestedBy: string | null`, `note: string | null`, `status: SchedulePublishRequestStatus`, `respondedBy: string | null`, `respondedAt: Date | null`, `responseRemarks: string | null`, `createdAt: Date`, `updatedAt: Date`, and relations `schedule`, `requestedByUser`, `respondedByUser`. Status union is `'pending' | 'approved' | 'rejected' | 'cancelled'`.

- [ ] **Step 1: Write the failing contract test**

Create `apps/backend/test/schedule-publish-request-contract.spec.ts` using Jest globals (`describe`/`it`), `strict as assert` from `node:assert`, `readFileSync`, and the repo-root `read()` helper from `apps/backend/test/subject-edit-request-contract.spec.ts`:

```ts
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const read = (...segments: string[]) =>
  readFileSync(join(repoRoot, ...segments), 'utf8');

const migration = read('supabase/migrations/20261126020000_add_schedule_publish_requests.sql');
assert.match(migration, /CREATE TYPE public\.schedule_publish_request_status AS ENUM/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.schedule_publish_request/);
assert.match(migration, /note text/);
assert.match(migration, /CREATE UNIQUE INDEX uq_schedule_publish_request_pending[\s\S]*WHERE status = 'pending'/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /REVOKE ALL ON TABLE public\.schedule_publish_request FROM anon, authenticated/);

const entity = read('apps/backend/src/modules/scheduling/entities/schedule-publish-request.entity.ts');
assert.match(entity, /@Entity\('schedule_publish_request'\)/);
assert.match(entity, /note: string \| null/);

const moduleSource = read('apps/backend/src/modules/scheduling/scheduling.module.ts');
assert.match(moduleSource, /SchedulePublishRequest,/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/backend exec jest test/schedule-publish-request-contract.spec.ts --runInBand`

Expected: FAIL because the migration and entity do not exist.

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20261126020000_add_schedule_publish_requests.sql` with:

- Enum `public.schedule_publish_request_status` with `pending`, `approved`, `rejected`, `cancelled`.
- Table `public.schedule_publish_request` with `request_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, `schedule_id bigint NOT NULL REFERENCES public.schedule(schedule_id) ON DELETE CASCADE`, `dept_id bigint REFERENCES public.department(dept_id) ON DELETE SET NULL`, `requested_by uuid REFERENCES public.users(user_id) ON DELETE SET NULL`, nullable `note text`, status enum default `pending`, nullable `responded_by uuid`, `responded_at timestamp with time zone`, `response_remarks text`, non-null `created_at`/`updated_at` defaulting to `now()`.
- Partial unique index `uq_schedule_publish_request_pending` on `(schedule_id)` where `status = 'pending'`.
- Indexes `idx_schedule_publish_request_status_created`, `idx_schedule_publish_request_dept`, `idx_schedule_publish_request_requested_by`.
- Trigger `trg_schedule_publish_request_updated_at` calling `public.set_updated_at()`.
- `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL ... FROM anon, authenticated`, `GRANT ALL ... TO service_role`, and no client policies.
- Do not add a status-flow trigger change; `finalized → published` and `finalized → draft` already exist.

- [ ] **Step 4: Create the entity and register it**

Create `apps/backend/src/modules/scheduling/entities/schedule-publish-request.entity.ts` mirroring the unfinalize entity decorators, replacing `reason` with nullable `note`, adding `@Index()` to `requestedBy`, and keeping `status` without an explicit `enumName`. In `scheduling.module.ts`, import `SchedulePublishRequest` and add it immediately after `ScheduleUnfinalizeRequest` in `TypeOrmModule.forFeature([...])`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/backend exec jest test/schedule-publish-request-contract.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261126020000_add_schedule_publish_requests.sql apps/backend/src/modules/scheduling/entities/schedule-publish-request.entity.ts apps/backend/src/modules/scheduling/scheduling.module.ts apps/backend/test/schedule-publish-request-contract.spec.ts
git commit -m "Add schedule publish request schema" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 2: Publish request creation, lookup, and filing notification

**Files:**
- Create: `apps/backend/src/modules/scheduling/dto/create-schedule-publish-request.dto.ts`
- Create: `apps/backend/src/modules/scheduling/dto/respond-schedule-publish-request.dto.ts`
- Create: `apps/backend/src/modules/scheduling/services/schedule-publish.service.ts`
- Test: `apps/backend/test/schedule-publish.service.spec.ts`

**Interfaces:**
- Consumes: `SchedulePublishRequest`, `Schedule`, `CreateSchedulePublishRequestDto`, `RespondSchedulePublishRequestDto`, `ScheduleFacultyService.assertOwnership(scheduleId, user)`, `DepartmentsService.assertDepartmentActive(deptId)`, `NotificationDispatcherService.dispatch(triggerKey, input)`, `RecipientsService`, `SupabaseService`, `loadDeptLabel`.
- Produces:

```ts
export class SchedulePublishService {
  constructor(
    @InjectRepository(SchedulePublishRequest) requestRepo: Repository<SchedulePublishRequest>,
    @InjectRepository(Schedule) scheduleRepo: Repository<Schedule>,
    scheduleFaculty: ScheduleFacultyService,
    departments: DepartmentsService,
    dispatcher: NotificationDispatcherService,
    recipients: RecipientsService,
    supabase: SupabaseService,
  );

  async create(scheduleId: string, dto: CreateSchedulePublishRequestDto, user: any): Promise<SchedulePublishRequest>;
  async findForSchedule(scheduleId: string, user: any): Promise<SchedulePublishRequest | null>;
  async findRequests(input: { status?: string; termId?: string }): Promise<SchedulePublishRequest[]>;
  private parseStatus(value?: string): SchedulePublishRequestStatus | undefined;
  private async notifyRequested(request: SchedulePublishRequest, schedule: Schedule, user: any): Promise<void>;
}
```

- [ ] **Step 1: Write the failing service tests**

Create `apps/backend/test/schedule-publish.service.spec.ts` with `import 'reflect-metadata'`, `createFakeRepository`, `deanProfile`, `departmentHeadProfile`, `otherDepartmentHeadProfile`, and direct service construction with `as any` mocks. Add these tests:

```ts
test('only a department head files a publish request', async () => {
  await assert.rejects(
    () => service.create('s1', {}, deanProfile),
    /Only department heads can request publication/,
  );
});

test('a publish request requires a finalized entry', async () => {
  scheduleRepo.findOne.mockResolvedValue({ ...schedule, status: 'draft' });
  await assert.rejects(
    () => service.create('s1', {}, departmentHeadProfile),
    /Only finalized entries can be submitted for publication/,
  );
});

test('create saves a trimmed optional note and one pending request', async () => {
  const saved = await service.create('s1', { note: '  ready for dean  ' }, departmentHeadProfile);
  assert.equal(saved.status, 'pending');
  assert.equal(saved.note, 'ready for dean');
  assert.equal(saved.scheduleId, 's1');
});

test('create rejects a second pending request for the same entry', async () => {
  requestRepo.rows.push({ requestId: 'r1', scheduleId: 's1', status: 'pending' });
  await assert.rejects(
    () => service.create('s1', {}, departmentHeadProfile),
    /A publish request for this entry is already waiting for the Dean/,
  );
});

test('findForSchedule returns the pending request before older resolved ones', async () => {
  const found = await service.findForSchedule('s1', departmentHeadProfile);
  assert.equal(found?.status, 'pending');
});

test('findRequests rejects an unknown status', async () => {
  await assert.rejects(
    () => service.findRequests({ status: 'waiting' }),
    /Unknown publish request status/,
  );
});

test('a notification dispatch failure does not fail create', async () => {
  dispatcher.dispatch.mockRejectedValueOnce(new Error('down'));
  const saved = await service.create('s1', {}, departmentHeadProfile);
  assert.equal(saved.status, 'pending');
});

test('create dispatches schedule.publish_requested with the request entity', async () => {
  await service.create('s1', { note: 'ready' }, departmentHeadProfile);
  const call = dispatcher.dispatch.mock.calls[0];
  assert.equal(call[0], 'schedule.publish_requested');
  assert.equal(call[1].entityType, 'schedule_publish_request');
  assert.equal(call[1].payload.note, 'ready');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @coe-nnect/backend exec jest test/schedule-publish.service.spec.ts --runInBand`

Expected: FAIL because the service and DTOs do not exist.

- [ ] **Step 3: Implement the DTOs**

Create `CreateSchedulePublishRequestDto` with an optional `note` decorated `@IsOptional()`, `@IsString()`, and `@MaxLength(1000, { message: 'Note must be at most 1000 characters.' })`.

Create `RespondSchedulePublishRequestDto` with `action: 'approve' | 'reject'` decorated `@IsIn(['approve', 'reject'])` and optional `remarks?: string` decorated `@IsOptional()`, `@IsString()`, `@MaxLength(500, { message: 'Remarks must be at most 500 characters.' })`.

- [ ] **Step 4: Implement the service methods**

Implement the constructor and methods in `schedule-publish.service.ts` with the exact signatures above. Use the same dependency imports as `schedule-unfinalize.service.ts`, swapping the request entity/DTO names. `create()` must:

1. Throw `ForbiddenException('Only department heads can request publication.')` unless `user?.role === 'department_head'`.
2. Call `scheduleFaculty.assertOwnership(scheduleId, user)` and `departments.assertDepartmentActive(schedule.deptId)`.
3. Throw `BadRequestException('Only finalized entries can be submitted for publication.')` unless `schedule.status === 'finalized'`.
4. Reject an existing pending request with `BadRequestException('A publish request for this entry is already waiting for the Dean.')`.
5. Save `{ scheduleId, deptId: schedule.deptId, requestedBy: user?.userId ?? null, note: dto.note?.trim() || null, status: 'pending' }`.
6. Call `notifyRequested()` inside `try/catch`; log `Publish request notification failed: ...` on error.

`findForSchedule()` must call `assertOwnership()` and return the pending request first, otherwise the newest resolved request. `findRequests()` must mirror the unfinalize query joins, filter by `status` and `s.term_id`, order by `r.created_at DESC`, `.take(200)`, and throw `BadRequestException('Unknown publish request status.')` for an invalid status. `notifyRequested()` must dispatch `schedule.publish_requested` with `entityType: 'schedule_publish_request'`, `entityId: request.requestId`, recipients from `recipients.collegeDean()` + `recipients.administrators()`, and payload keys `requestId`, `scheduleId`, `subjectId`, `subjectCode`, `subjectTitle`, `sectionCode`, `termName`, `deptId`, `deptCode`, `note`, `previousStatus: 'finalized'`, `newStatus: 'finalized'`, `requestedByName`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @coe-nnect/backend exec jest test/schedule-publish.service.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/scheduling/dto/create-schedule-publish-request.dto.ts apps/backend/src/modules/scheduling/dto/respond-schedule-publish-request.dto.ts apps/backend/src/modules/scheduling/services/schedule-publish.service.ts apps/backend/test/schedule-publish.service.spec.ts
git commit -m "Add publish request filing service" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 3: Dean decisions, stale cancellation, direct-publish guard, and triggers

**Files:**
- Modify: `apps/backend/src/modules/scheduling/services/schedule-publish.service.ts`
- Modify: `apps/backend/src/modules/scheduling/scheduling.service.ts`
- Modify: `apps/backend/src/modules/notifications/triggers.ts`
- Modify: `apps/backend/test/schedule-publish.service.spec.ts`
- Modify: `apps/backend/test/schedule-notification-payloads.spec.ts`
- Modify: `apps/backend/test/schedule-publish-request-contract.spec.ts`

**Interfaces:**
- Consumes: `SchedulePublishService.create/findForSchedule/findRequests` from Task 2.
- Produces:

```ts
async respond(requestId: string, dto: RespondSchedulePublishRequestDto, user: any): Promise<SchedulePublishRequest>;
async cancelPendingForSchedule(scheduleId: string, userId: string | null = null): Promise<void>;
private async notifyResponded(request: SchedulePublishRequest, schedule: Schedule, action: 'approve' | 'reject', user: any): Promise<void>;
```

- [ ] **Step 1: Write the failing decision tests**

Extend `apps/backend/test/schedule-publish.service.spec.ts` with:

```ts
test('approve publishes the entry and records approved', async () => {
  const saved = await service.respond('r1', { action: 'approve' }, deanProfile);
  assert.equal(saved.status, 'approved');
  assert.equal(scheduleRepo.update.mock.calls[0][1].status, 'published');
});

test('reject requires remarks and drafts the entry', async () => {
  await assert.rejects(
    () => service.respond('r1', { action: 'reject', remarks: '   ' }, deanProfile),
    /Rejection remarks are required/,
  );
  const saved = await service.respond('r1', { action: 'reject', remarks: 'Room conflict.' }, deanProfile);
  assert.equal(saved.status, 'rejected');
  assert.equal(saved.responseRemarks, 'Room conflict.');
  assert.equal(scheduleRepo.update.mock.calls[0][1].status, 'draft');
});

test('a stale approve request is cancelled without publishing', async () => {
  schedule.status = 'draft';
  await assert.rejects(
    () => service.respond('r1', { action: 'approve' }, deanProfile),
    /This entry is no longer finalized; the request was closed/,
  );
  assert.equal(requestRepo.rows[0].status, 'cancelled');
  assert.equal(scheduleRepo.update.mock.calls.length, 0);
});

test('a stale reject request is cancelled without drafting', async () => {
  schedule.status = 'review';
  await assert.rejects(
    () => service.respond('r1', { action: 'reject', remarks: 'Too late.' }, deanProfile),
    /This entry is no longer finalized; the request was closed/,
  );
  assert.equal(requestRepo.rows[0].status, 'cancelled');
  assert.equal(scheduleRepo.update.mock.calls.length, 0);
});

test('a decision notification failure does not fail respond', async () => {
  dispatcher.dispatch.mockRejectedValueOnce(new Error('down'));
  const saved = await service.respond('r1', { action: 'approve' }, deanProfile);
  assert.equal(saved.status, 'approved');
});

test('respond dispatches only the dedicated publish outcome trigger', async () => {
  await service.respond('r1', { action: 'reject', remarks: 'Retry next term.' }, deanProfile);
  const keys = dispatcher.dispatch.mock.calls.map((c) => c[0]);
  assert.deepEqual(keys, ['schedule.publish_rejected']);
});
```

Extend `apps/backend/test/schedule-notification-payloads.spec.ts` with a test using its existing `SchedulingService` harness:

```ts
test('blocks direct publish through updateStatus for the Dean', async () => {
  await assert.rejects(
    () => service.updateStatus('s1', 'published', deanProfile),
    /Publishing requires Dean approval/,
  );
});
```

Extend `apps/backend/test/schedule-publish-request-contract.spec.ts` with:

```ts
const triggers = read('apps/backend/src/modules/notifications/triggers.ts');
const statusService = read('apps/backend/src/modules/scheduling/scheduling.service.ts');
assert.match(triggers, /schedule\.publish_requested/);
assert.match(triggers, /schedule\.publish_approved/);
assert.match(triggers, /schedule\.publish_rejected/);
assert.match(statusService, /if \(status === 'published'\)/);
assert.match(statusService, /schedulePublish\.cancelPendingForSchedule/);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @coe-nnect/backend exec jest test/schedule-publish.service.spec.ts test/schedule-notification-payloads.spec.ts test/schedule-publish-request-contract.spec.ts --runInBand`

Expected: FAIL because `respond`, `cancelPendingForSchedule`, triggers, and the status guard are missing.

- [ ] **Step 3: Implement `respond`, cancellation, and outcome notifications**

In `schedule-publish.service.ts`, load the request with relations `schedule`, `schedule.subject`, `schedule.faculty`, `schedule.room`, `schedule.timeSlot`, `schedule.term`, `schedule.sectionRef`, and `requestedBy`. Require `pending` or throw `BadRequestException('This publish request has already been resolved.')`.

For both actions, if `schedule.status !== 'finalized'`, set request to `cancelled`, set `respondedBy`/`respondedAt`, set `responseRemarks = 'Schedule was no longer finalized when the request was reviewed.'`, save, then throw `BadRequestException('This entry is no longer finalized; the request was closed.')`. Do not change the schedule in that case.

For `reject`, require `dto.remarks?.trim()` or throw `BadRequestException('Rejection remarks are required.')`. For `approve`, update the schedule to `published`; for `reject`, update it to `draft`. Set request status `approved`/`rejected`, `responseRemarks = dto.remarks?.trim() || null`, `respondedBy`, and `respondedAt`, then save. Dispatch only `schedule.publish_approved` or `schedule.publish_rejected` with `entityType: 'schedule'`, `entityId: schedule.scheduleId`, and payload keys `requestId`, `scheduleId`, `subjectId`, `subjectCode`, `subjectTitle`, `sectionCode`, `termName`, `deptId`, `note`, `responseRemarks`, `decidedByName`, `previousStatus: 'finalized'`, `newStatus: published|draft`. Wrap notification dispatch in `try/catch` and log `Publish response notification failed: ...`.

Implement `cancelPendingForSchedule()` by marking every pending request for the schedule `cancelled` with `responseRemarks = 'Schedule status changed outside this publish request.'`, matching the unfinalize helper.

- [ ] **Step 4: Add the status endpoint guard and cancellation hook**

In `SchedulingService.updateStatus()`, after `const previousStatus = found.status;`, throw `BadRequestException('Publishing requires Dean approval. Finalize the entry and submit a publish request instead.')` when `status === 'published'`. Inject `SchedulePublishService` into the constructor. After `scheduleRepo.save(found)`, if `previousStatus === 'finalized' && status !== 'finalized'`, call `schedulePublish.cancelPendingForSchedule(id, user?.userId ?? null)` in a `try/catch` that logs `Cancelling pending publish requests failed for schedule=${id}: ...`. Preserve all existing unfinalize and `schedule.status_changed` behavior.

- [ ] **Step 5: Register the three triggers**

In `apps/backend/src/modules/notifications/triggers.ts`, add `schedule.publish_requested`, `schedule.publish_approved`, and `schedule.publish_rejected` to the Schedule block with `category: 'schedule'` and `defaultEnabled: true`. Use labels/descriptions consistent with the neighboring unfinalize entries.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @coe-nnect/backend exec jest test/schedule-publish.service.spec.ts test/schedule-notification-payloads.spec.ts test/schedule-publish-request-contract.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/scheduling/services/schedule-publish.service.ts apps/backend/src/modules/scheduling/scheduling.service.ts apps/backend/src/modules/notifications/triggers.ts apps/backend/test/schedule-publish.service.spec.ts apps/backend/test/schedule-notification-payloads.spec.ts apps/backend/test/schedule-publish-request-contract.spec.ts
git commit -m "Add publish request decisions and guard direct publishing" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 4: Publish request controller and module wiring

**Files:**
- Create: `apps/backend/src/modules/scheduling/schedule-publish.controller.ts`
- Modify: `apps/backend/src/modules/scheduling/scheduling.module.ts`
- Test: `apps/backend/test/schedule-publish-request-routes.spec.ts`

**Interfaces:**
- Consumes: `SchedulePublishService` methods from Tasks 2–3.
- Produces:
  - `GET /v1/schedules/publish-requests?status=&termId=`
  - `PATCH /v1/schedules/publish-requests/:requestId`
  - `GET /v1/schedules/:id/publish-request`
  - `POST /v1/schedules/:id/publish-request`

- [ ] **Step 1: Write the failing route/DTO contract test**

Create `apps/backend/test/schedule-publish-request-routes.spec.ts` in the style of `subject-edit-request-routes.spec.ts`. Assert:

```ts
assert.match(controller, /@Get\('publish-requests'\)/);
assert.match(controller, /@Patch\('publish-requests\/:requestId'\)/);
assert.match(controller, /@Get\(':id\/publish-request'\)/);
assert.match(controller, /@Post\(':id\/publish-request'\)/);
assert.match(controller, /@Roles\('college_dean', 'administrator'\)[\s\S]*findRequests/);
assert.match(controller, /@Roles\('college_dean', 'administrator'\)[\s\S]*respond/);
assert.match(controller, /@Roles\('college_dean', 'department_head', 'administrator'\)[\s\S]*findForSchedule/);
assert.match(controller, /@Roles\('department_head'\)[\s\S]*create/);
assert.match(controller, /action: 'schedule\.publish_request'/);
assert.match(controller, /action: 'schedule\.publish_respond'/);

const dto = read('apps/backend/src/modules/scheduling/dto/create-schedule-publish-request.dto.ts');
assert.match(dto, /@MaxLength\(1000/);

const moduleSource = read('apps/backend/src/modules/scheduling/scheduling.module.ts');
assert.ok(moduleSource.indexOf('SchedulePublishController') < moduleSource.indexOf('SchedulingController'));
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/backend exec jest test/schedule-publish-request-routes.spec.ts --runInBand`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the controller**

Create `SchedulePublishController` mirroring `ScheduleUnfinalizeController`: same class decorators, `{ data: ... }` envelope, `req.profile`, and audit decorators `schedule.publish_request` / `schedule.publish_respond` with `source: 'Scheduling'`. Use the roles specified in the test. Do not add a query DTO; pass `status` and `termId` strings directly to `findRequests()`.

- [ ] **Step 4: Register the controller and service**

In `scheduling.module.ts`, import `SchedulePublishController` and `SchedulePublishService`, place `SchedulePublishController` in `controllers` immediately before `SchedulingController`, and add `SchedulePublishService` to both `providers` and `exports`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/backend exec jest test/schedule-publish-request-routes.spec.ts --runInBand`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/scheduling/schedule-publish.controller.ts apps/backend/src/modules/scheduling/scheduling.module.ts apps/backend/test/schedule-publish-request-routes.spec.ts
git commit -m "Add publish request routes" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 5: Frontend publish request API client

**Files:**
- Create: `apps/frontend/src/api/schedule-publish-request.api.ts`
- Modify: `apps/frontend/package.json`
- Test: `apps/frontend/src/features/timetable/schedule-publish-request-api.test.ts`

**Interfaces:**
- Consumes: backend routes from Task 4 and `api` client from `apps/frontend/src/api/client.ts`.
- Produces:

```ts
export type PublishRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface SchedulePublishRequest { /* mirrors unfinalize request with note instead of reason */ }
export async function fetchPublishRequests(params?: { status?: PublishRequestStatus; termId?: string }): Promise<SchedulePublishRequest[]>;
export async function fetchSchedulePublishRequest(scheduleId: string): Promise<SchedulePublishRequest | null>;
export async function createPublishRequest(scheduleId: string, note?: string): Promise<SchedulePublishRequest>;
export async function respondToPublishRequest(requestId: string, action: 'approve' | 'reject', remarks?: string): Promise<SchedulePublishRequest>;
export function publishRequestLabel(request: SchedulePublishRequest): string;
export function publishRequesterName(request: SchedulePublishRequest): string;
```

- [ ] **Step 1: Write the failing source-wiring test**

Create `apps/frontend/src/features/timetable/schedule-publish-request-api.test.ts` using `node:test` and the repo-root read helper from `apps/frontend/src/features/subjects/subject-edit-access.test.ts`: `read(path)` resolves `new URL('../../../../../' + path, import.meta.url)`. Assert:

```ts
const source = read('apps/frontend/src/api/schedule-publish-request.api.ts');
assert.match(source, /api\.get\('\/v1\/schedules\/publish-requests', \{ params \}\)/);
assert.match(source, /api\.patch\(`\/v1\/schedules\/publish-requests\/\$\{requestId\}`/);
assert.match(source, /api\.get\(`\/v1\/schedules\/\$\{scheduleId\}\/publish-request`\)/);
assert.match(source, /api\.post\(`\/v1\/schedules\/\$\{scheduleId\}\/publish-request`/);
assert.match(source, /return data\.data/);
assert.doesNotMatch(source, /alert\(|confirm\(|prompt\(|toast/);
```

Add the new test path to the explicit `test` script array in `apps/frontend/package.json`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/schedule-publish-request-api.test.ts`

Expected: FAIL because the API module does not exist.

- [ ] **Step 3: Implement the API module**

Mirror `apps/frontend/src/api/schedule-unfinalize.api.ts` exactly, replacing `reason` with `note`, using the route strings above, and keeping `extractApiError` at call sites rather than inside the API module. `publishRequestLabel()` and `publishRequesterName()` mirror the unfinalize helpers.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/schedule-publish-request-api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/api/schedule-publish-request.api.ts apps/frontend/package.json apps/frontend/src/features/timetable/schedule-publish-request-api.test.ts
git commit -m "Add publish request API client" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 6: Detail drawer publish request controls and Dean note

**Files:**
- Modify: `apps/frontend/src/features/timetable/components/ScheduleDetailDrawer.tsx`
- Modify: `apps/frontend/package.json`
- Test: `apps/frontend/src/features/timetable/schedule-publish-drawer.test.ts`

**Interfaces:**
- Consumes: `fetchSchedulePublishRequest`, `createPublishRequest`, and `publishRequestLabel` from Task 5.
- Produces: drawer state and UI for filing one publish request, showing pending status, and displaying rejection remarks.

- [ ] **Step 1: Write the failing source-wiring test**

Create `apps/frontend/src/features/timetable/schedule-publish-drawer.test.ts` following `subject-request-visibility.test.ts`, using the same repo-root `read()` helper (`../../../../../` from this directory). Assert:

```ts
const source = read('apps/frontend/src/features/timetable/components/ScheduleDetailDrawer.tsx');
assert.match(source, /const STATUS_OPTIONS = \['draft', 'review', 'finalized'\] as const/);
assert.match(source, /published: 'Published'/);
assert.match(source, /entry\.status !== 'published'/);
assert.match(source, /fetchSchedulePublishRequest/);
assert.match(source, /createPublishRequest/);
assert.match(source, /Request publish approval/);
assert.match(source, /Publish approval pending/);
assert.match(source, /Dean note/);
assert.match(source, /\['schedule-publish-request', entry\?\.id\]/);
assert.match(source, /feedback\.success\(/);
assert.doesNotMatch(source, /alert\(|confirm\(|prompt\(/);
assert.doesNotMatch(source, /const \[publishError, setPublishError\]/);
```

Add the test path to `apps/frontend/package.json` test script.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/schedule-publish-drawer.test.ts`

Expected: FAIL because the drawer lacks publish-request UI.

- [ ] **Step 3: Modify drawer state, query, and mutation**

In `ScheduleDetailDrawer.tsx`:

1. Remove `'published'` from `STATUS_OPTIONS`; keep it in `STATUS_LABELS` and `STATUS_STYLES` for display. Render the status select only when `entry.status !== 'published'` so a published entry never shows a draft-looking selected value.
2. Add `publishOpen`/`publishNote` state; reset them with the existing per-entry reset effect; add `publishOpen` to the Escape guard.
3. Add a query using `fetchSchedulePublishRequest(entry!.id)` with key `['schedule-publish-request', entry?.id]`, enabled when `entry?.status === 'finalized' || entry?.status === 'draft'` for heads.
4. Add a mutation calling `createPublishRequest(entry!.id, publishNote.trim() || undefined)`, invalidating `['schedule-publish-requests']`, `['schedule-publish-request', entry!.id]`, `['schedules', termId]`, `['coverage']`, and `['flagged']`, then closing the modal, clearing the note, and calling `feedback.success('Publish request sent to the Dean.')`. Errors use `feedback.failed(extractApiError(err, 'Publish request failed'))`.
5. For a finalized entry owned by a head, make the lock button read `Request publish approval` and open the new modal when no request is pending. Do not open the unfinalize modal from `finalized`.
6. Show `Publish approval pending` with the submitted note/time when the returned request is `pending`.
7. When the returned request is `rejected` and the entry is `draft`, show a rose `Dean note` block with `responseRemarks` and `respondedAt`.
8. Add a `Modal` modeled on the unfinalize request modal with optional note `maxLength={1000}`, no native dialogs, and global feedback only.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/schedule-publish-drawer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/timetable/components/ScheduleDetailDrawer.tsx apps/frontend/package.json apps/frontend/src/features/timetable/schedule-publish-drawer.test.ts
git commit -m "Add publish request controls to schedule drawer" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 7: Dean publish request queue and direct publish removal

**Files:**
- Modify: `apps/frontend/src/features/dean/DeanApprovalsPage.tsx`
- Modify: `apps/frontend/package.json`
- Test: `apps/frontend/src/features/dean/schedule-publish-approvals.test.ts`

**Interfaces:**
- Consumes: `fetchPublishRequests`, `respondToPublishRequest`, `publishRequestLabel`, `publishRequesterName` from Task 5.
- Produces: Dean inbox section, decision modal, and removal of direct publish controls while keeping the manual **Send to IDP** button.

- [ ] **Step 1: Write the failing source-wiring test**

Create `apps/frontend/src/features/dean/schedule-publish-approvals.test.ts`, using the same repo-root `read()` helper (`../../../../../` from this directory). Assert:

```ts
const source = read('apps/frontend/src/features/dean/DeanApprovalsPage.tsx');
assert.match(source, /type BatchAction = 'finalize' \| 'unfinalize-published'/);
assert.doesNotMatch(source, /BatchAction[^;]*'publish'/);
assert.doesNotMatch(source, /action === 'publish'/);
assert.doesNotMatch(source, /Publish \{selectedFinalizedCount\}/);
assert.match(source, /searchParams\.get\('publishRequest'\)/);
assert.match(source, /next\.delete\('publishRequest'\)/);
assert.match(source, /publishDeepLinkHandledRef/);
assert.match(source, /fetchPublishRequests/);
assert.match(source, /respondToPublishRequest/);
assert.match(source, /\['schedule-publish-requests'\]/);
assert.match(source, /\['schedule-publish-request', saved\.scheduleId\]/);
assert.match(source, /sendActiveTermToIdp/);
assert.match(source, /feedback\.success\(/);
assert.doesNotMatch(source, /const \[publishDecisionError, setPublishDecisionError\]/);
```

Add the test path to `apps/frontend/package.json` test script.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/dean/schedule-publish-approvals.test.ts`

Expected: FAIL because the Dean page still has direct publish and no publish queue.

- [ ] **Step 3: Remove direct publish controls**

In `DeanApprovalsPage.tsx`:

1. Remove `'publish'` from `BatchAction`.
2. Remove the finalized-row `Publish` action, the bulk `Publish {selectedFinalizedCount}` button, the `case 'publish'` confirm copy, the `performAction` mapping branch that returns `'published'`, and the `action === 'publish'` IDP side-effect block.
3. Keep `sendActiveTermToIdp`, the header **Send to IDP** button, `StatusFilter` `'published'`, published-row `Unfinalize`, and the `unfinalize-published` batch action.

- [ ] **Step 4: Add the publish queue and deep link**

Add `['schedule-publish-requests']` query using `fetchPublishRequests()` with `staleTime: 15_000` and no term filter. Add `pendingPublishRequests` memo, separate `publishDecision`/`publishDecisionRemarks` state, `publishDeepLinkHandledRef`, and `deepLinkPublishRequestId = searchParams.get('publishRequest')`. Add an effect mirroring the unfinalize deep link but matching publish requests and clearing only `publishRequest` with `{ replace: true }`. Add a `Publish requests` section immediately after the unfinalize section, showing label, department, term, requester, filed time, and truncated note with `Approve`/`Reject` buttons.

- [ ] **Step 5: Add the decision mutation and modal**

Add a mutation calling `respondToPublishRequest(requestId, action, remarks)`, invalidating `['schedule-publish-requests']`, `['schedule-publish-request', saved.scheduleId]`, `['schedules']`, `['coverage']`, `['flagged']`, and `['schedule-unfinalize-requests']`. Use `feedback.success(...)` and `feedback.error(extractApiError(...))`. Add a modal modeled on the unfinalize decision modal with `id="publish-decision-remarks"`, `maxLength={500}`, required remarks for rejection, and action labels `Approve & publish` / `Reject request`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/dean/schedule-publish-approvals.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/dean/DeanApprovalsPage.tsx apps/frontend/package.json apps/frontend/src/features/dean/schedule-publish-approvals.test.ts
git commit -m "Add Dean publish approvals and remove direct publishing" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 8: Notification deep links and icons

**Files:**
- Modify: `apps/frontend/src/lib/notification-target.ts`
- Modify: `apps/frontend/src/lib/notification-target.test.ts`

**Interfaces:**
- Consumes: trigger keys registered in Task 3 and payload keys emitted in Tasks 2–3.
- Produces: `notificationHref()` cases for the three publish triggers and the `schedule_publish_request` entity fallback, plus `notificationIcon()` cases.

- [ ] **Step 1: Write the failing tests**

Add to `apps/frontend/src/lib/notification-target.test.ts`:

```ts
test('publish request notifications use the publishRequest param', () => {
  for (const shell of ['', '/dean'] as ShellBase[]) {
    assert.equal(
      notificationHref(
        scheduleNotification({
          triggerKey: 'schedule.publish_requested',
          entityType: 'schedule_publish_request',
          entityId: 'p1',
        }),
        shell,
      ),
      `${shell}/approvals?publishRequest=p1`,
    );
  }
});

test('publish outcomes link to the timetable even with a subjectId', () => {
  for (const triggerKey of ['schedule.publish_approved', 'schedule.publish_rejected']) {
    assert.equal(
      notificationHref(scheduleNotification({ triggerKey, entityId: 's1' }), ''),
      '/timetable?focus=s1',
    );
  }
});

test('publishRequest and request deep links stay independent', () => {
  assert.equal(
    notificationHref(
      notification({
        triggerKey: 'schedule.publish_requested',
        entityType: 'schedule_publish_request',
        entityId: '5',
      }),
      '',
    ),
    '/approvals?publishRequest=5',
  );
  assert.equal(
    notificationHref(
      notification({
        triggerKey: 'schedule.unfinalize_requested',
        entityType: 'schedule_unfinalize_request',
        entityId: '5',
      }),
      '',
    ),
    '/approvals?request=5&status=published',
  );
});
```

Also assert icons for the three new triggers are non-empty and distinct from each other. Do not add publish outcomes to the existing subject-bearing schedule trigger list.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/lib/notification-target.test.ts`

Expected: FAIL because the resolver returns the fallback destination.

- [ ] **Step 3: Implement the resolver cases**

In `notificationHref()` add `case 'schedule.publish_requested'` returning `href(shell, '/approvals', { publishRequest: id })`, and grouped cases `schedule.publish_approved` / `schedule.publish_rejected` returning `href(shell, '/timetable', { focus: id })` directly without calling `subjectHref()`. In the entity fallback switch add `case 'schedule_publish_request'` mapping to the same `/approvals?publishRequest=` URL. In `notificationIcon()` add `schedule.publish_requested → 'pending_actions'`, `schedule.publish_approved → 'task_alt'`, and `schedule.publish_rejected → 'cancel'`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/lib/notification-target.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/notification-target.ts apps/frontend/src/lib/notification-target.test.ts
git commit -m "Resolve publish approval notification links" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

---

### Task 9: Schema snapshot and full verification

**Files:**
- Modify if generated: `docs/DATABASE STRUCTURE/coe-nnect-database-structure.sql`
- Modify if counts/diagrams change: `docs/DATABASE STRUCTURE/README.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: regenerated schema snapshot and a verified branch.

- [ ] **Step 1: Regenerate the schema snapshot**

Run: `pnpm db:snapshot`

Expected: the snapshot contains `schedule_publish_request_status` and `public.schedule_publish_request`. Update `docs/DATABASE STRUCTURE/README.md` only if its table/enum counts or diagrams changed. Do not hand-edit the generated SQL.

- [ ] **Step 2: Run full verification**

Run each command separately and require a clean result:

```bash
pnpm --filter @coe-nnect/backend test:ci
pnpm --filter @coe-nnect/backend typecheck
pnpm --filter @coe-nnect/backend test:e2e
pnpm --filter @coe-nnect/frontend test
pnpm --filter @coe-nnect/frontend typecheck
pnpm --filter @coe-nnect/frontend lint
git diff --check
```

Expected: backend and frontend tests pass, typechecks clean, frontend lint has no new errors, and `git diff --check` is clean. Existing pre-existing frontend warnings are acceptable only if the lint command exits successfully.

- [ ] **Step 3: Commit generated documentation changes**

```bash
git add "docs/DATABASE STRUCTURE/coe-nnect-database-structure.sql" "docs/DATABASE STRUCTURE/README.md"
git commit -m "Update database snapshot for publish requests" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

If `pnpm db:snapshot` could not run because database access is unavailable, do not fabricate snapshot changes; report that in the handoff instead.
