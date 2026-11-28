# Draft Timetable Save and Load Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add term-scoped, named draft snapshots of live draft/review timetable rows that department heads can save and load back after full catalog and conflict validation.

**Architecture:** A new backend-only `term_draft_snapshot` table stores JSONB snapshots beside denormalized term labels. A dedicated service reuses the existing catalog resolvers and constraint-rule engine to preflight and atomically replace the draft/review set for one term and department. The frontend exposes Save/Load through the existing More menu, a save dialog, a saved-drafts drawer, and a preflight summary modal.

**Tech Stack:** NestJS + TypeORM + Supabase Postgres migrations, React Query + TypeScript frontend, class-validator DTOs, Playwright E2E, node:test/Jest source-contract guards.

**Spec:** `docs/superpowers/specs/2026-11-28-draft-save-load-design.md`

## Global Constraints

- Snapshots contain only `draft` and `review` rows; `finalized` and `published` rows are never written, deleted, or created.
- Load replaces the draft/review set for `(termId, deptId)`; it is all-or-nothing on any conflict or write failure.
- Saving and loading require an active term and a department id. Snapshots are locked to their original term.
- Endpoints use `@Roles('department_head', 'administrator')`; department heads are confined to their own `deptId`.
- UI More-menu items appear only when `writable && activeTerm && isDepartmentHead && myDeptId`.
- Use global `useFeedback()` only; no `alert`, `confirm`, `prompt`, local toast, or local success/failure state. Busy/disabled state is allowed.
- Keep every existing `data-tour` value unchanged, especially `tt-focus`.
- Commit subjects must not use `feat` or `chore`, must not end with `:`, and must include `Co-authored-by: trynotybort <trynotybort@gmail.com>`.
- CI Browser E2E is authoritative; local browser E2E stays skipped because `e2e/.env.local` targets a dead Supabase project.
- Source-regex contract tests are required by the project ruling; computed pixels are not locally pinned.

## Review Focus

- **A saved snapshot itself contains overlapping faculty/room/section rows.** Expected: preflight reports conflicts and disables load. Pinned in Task 4 Step 1 and Task 8 Step 1.
- **A row saved as draft/review becomes finalized or published before load.** Expected: that entry is a conflict; the finalized/published row is untouched. Pinned in Task 4 Step 1 and Task 8 Step 1.
- **A live draft/review row has a pending cross-department faculty request.** Expected: load is blocked and the request is not cancelled. Pinned in Task 4 Step 1 and Task 8 Step 1.
- **A subject, room, section, or faculty member is deactivated after save.** Expected: id-then-code/name resolution is attempted, then a conflict if still invalid. Pinned in Task 2 Step 1 and Task 8 Step 1.
- **A cross-term load, inactive term, or tampered snapshot with a `published` entry is requested.** Expected: rejected before any write. Pinned in Task 3 Step 1, Task 4 Step 1, and Task 8 Step 1.

---

### Task 1: Snapshot persistence contract

**Files:**
- Create: `supabase/migrations/20261128000000_add_term_draft_snapshots.sql`
- Create: `apps/backend/src/modules/scheduling/entities/term-draft-snapshot.entity.ts`
- Create: `apps/backend/test/term-draft-snapshot-contract.spec.ts`
- Modify: `apps/backend/src/modules/scheduling/scheduling.module.ts`
- Modify: `docs/DATABASE STRUCTURE/README.md`

**Interfaces:**
- Consumes: existing `set_updated_at()` trigger and backend-only RLS pattern from `20261126040000_add_term_published_versions.sql`.
- Produces: `TermDraftSnapshot` entity registered with TypeORM; a `term_draft_snapshot` table usable by later tasks.

- [ ] **Step 1: Write the failing contract test**

Create `term-draft-snapshot-contract.spec.ts` using the `readFileSync`/`join(__dirname, '..', '..', '..')` pattern from `term-published-version-contract.spec.ts`. Assert:

```ts
const migrationPath =
  'supabase/migrations/20261128000000_add_term_draft_snapshots.sql';
const entityPath =
  'apps/backend/src/modules/scheduling/entities/term-draft-snapshot.entity.ts';

assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.term_draft_snapshot/);
assert.match(sql, /term_id bigint[\s\S]*?ON DELETE CASCADE/);
assert.match(sql, /dept_id bigint[\s\S]*?ON DELETE CASCADE/);
assert.match(sql, /snapshot jsonb NOT NULL/);
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(
  sql,
  /REVOKE ALL ON TABLE public\.term_draft_snapshot FROM anon, authenticated/,
);
assert.match(
  sql,
  /GRANT ALL ON TABLE public\.term_draft_snapshot TO service_role/,
);
assert.match(entity, /@Entity\('term_draft_snapshot'\)/);
for (const field of [
  'termDraftSnapshotId!: string',
  'termId!: string',
  'deptId!: string',
  'name!: string',
  'termName!: string',
  'semester!: string | null',
  'schoolYear!: string',
  'snapshot!: Record<string, unknown>',
  'createdBy!: string | null',
  'createdAt!: Date',
  'updatedAt!: Date',
]) {
  assert.ok(entity.includes(field), `entity is missing ${field}`);
}
assert.match(read('apps/backend/src/modules/scheduling/scheduling.module.ts'), /TermDraftSnapshot,/);
```

Also assert the migration contains indexes on `(term_id, dept_id)`, `(term_id, dept_id, created_at DESC)`, and `(created_at DESC)`, an `updated_at` trigger, and no unique index on `name` (duplicate names are allowed).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/backend exec jest --runTestsByPath test/term-draft-snapshot-contract.spec.ts`
Expected: FAIL because the migration and entity do not exist.

- [ ] **Step 3: Add the migration and entity**

Create the migration with the exact columns from the spec's **Data shape** section. Use `CREATE TABLE IF NOT EXISTS`, `bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, `ON UPDATE CASCADE ON DELETE CASCADE` for `term_id` and `dept_id`, the `set_updated_at()` trigger, RLS enable, revoke from `anon, authenticated`, grant to `service_role`, and the three named indexes. Do not add a unique constraint on `name`.

Create `TermDraftSnapshot` with matching TypeORM column names and the field names asserted in Step 1. Add it to `TypeOrmModule.forFeature([...])` in `scheduling.module.ts`.

- [ ] **Step 4: Update the database documentation**

Add `term_draft_snapshot` to `docs/DATABASE STRUCTURE/README.md` using the existing table-entry format, including its term/department FKs, JSONB snapshot column, and backend-only access note. If a local database is available, run `pnpm db:snapshot`; otherwise leave regeneration to the migration CI job and keep the hand-written README row.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/backend exec jest --runTestsByPath test/term-draft-snapshot-contract.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261128000000_add_term_draft_snapshots.sql apps/backend/src/modules/scheduling/entities/term-draft-snapshot.entity.ts apps/backend/src/modules/scheduling/scheduling.module.ts apps/backend/test/term-draft-snapshot-contract.spec.ts "docs/DATABASE STRUCTURE/README.md"
git commit -m "Add term draft snapshot persistence" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 2: Shared catalog resolver and DTOs

**Files:**
- Create: `apps/backend/src/modules/scheduling/services/schedule-catalog-resolver.service.ts`
- Create: `apps/backend/src/modules/scheduling/dto/draft-snapshot.dto.ts`
- Create: `apps/backend/test/schedule-catalog-resolver-contract.spec.ts`
- Modify: `apps/backend/src/modules/scheduling/services/schedule-reuse.service.ts`
- Modify: `apps/backend/src/modules/scheduling/scheduling.module.ts`

**Interfaces:**
- Consumes: `PublishedVersionEntry` from `services/term-published-version.service.ts`; existing `Subject`, `Section`, `Room`, `Faculty` repositories.
- Produces:

```ts
export type CatalogResult<T> = { value?: T; reason?: string; missing?: boolean };
export type ResolvedSubject = { id: string; code: string; deptId: string | null };
export type ResolvedSection = { section: string | null; sectionId: string | null };
export type ResolvedRoom = { roomId: string | null; externalName: string | null };
export type ResolvedFaculty = { facultyId: string | null; externalName: string | null };

@Injectable()
export class ScheduleCatalogResolver {
  resolveSubject(source: PublishedVersionEntry): Promise<CatalogResult<ResolvedSubject>>;
  resolveSection(source: PublishedVersionEntry): Promise<CatalogResult<ResolvedSection>>;
  resolveRoom(source: PublishedVersionEntry): Promise<CatalogResult<ResolvedRoom>>;
  resolveFaculty(source: PublishedVersionEntry): Promise<CatalogResult<ResolvedFaculty>>;
  dayOfWeek(value: unknown): string | null;
  clockTime(value: unknown): string | null;
  baseKey(subjectId: unknown, sectionId: unknown, loadType: unknown): string;
}

export class SaveDraftSnapshotDto {
  termId: string;      // @IsNumberString()
  deptId: string;      // @IsNumberString()
  name: string;        // @IsString(), @Length(1, 120)
}
export class DraftSnapshotTargetDto {
  termId: string;      // @IsNumberString()
  deptId: string;      // @IsNumberString()
}
export class ApplyDraftSnapshotDto extends DraftSnapshotTargetDto {
  confirmed: boolean;  // @Equals(true)
}
```

- [ ] **Step 1: Write the failing contract test**

Create `schedule-catalog-resolver-contract.spec.ts` asserting:

```ts
const resolver = read('apps/backend/src/modules/scheduling/services/schedule-catalog-resolver.service.ts');
const reuse = read('apps/backend/src/modules/scheduling/services/schedule-reuse.service.ts');

assert.match(resolver, /export class ScheduleCatalogResolver/);
for (const method of [
  'resolveSubject',
  'resolveSection',
  'resolveRoom',
  'resolveFaculty',
  'dayOfWeek',
  'clockTime',
  'baseKey',
]) {
  assert.match(resolver, new RegExp(`\\b${method}\\(`, 'g'));
}
assert.match(resolver, /employeeId[\s\S]*?wmsuId[\s\S]*?faculty_name/);
assert.match(resolver, /room_number/);
assert.match(resolver, /subject_code/);
assert.match(reuse, /private readonly catalog: ScheduleCatalogResolver/);
assert.doesNotMatch(reuse, /private async resolveSubject\(/);
assert.doesNotMatch(reuse, /private async resolveFaculty\(/);

const dto = read('apps/backend/src/modules/scheduling/dto/draft-snapshot.dto.ts');
assert.match(dto, /class SaveDraftSnapshotDto/);
assert.match(dto, /@Length\(1, 120\)/);
assert.match(dto, /class DraftSnapshotTargetDto/);
assert.match(dto, /class ApplyDraftSnapshotDto extends DraftSnapshotTargetDto/);
assert.match(dto, /@Equals\(true\)/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/backend exec jest --runTestsByPath test/schedule-catalog-resolver-contract.spec.ts`
Expected: FAIL because the resolver and DTO files do not exist.

- [ ] **Step 3: Extract the resolver**

Move the private `resolveSubject`, `resolveSection`, `resolveRoom`, `resolveFaculty`, `dayOfWeek`, `clockTime`, and `baseKey` implementations from `ScheduleReuseService` into `ScheduleCatalogResolver` with the signatures above. Preserve the exact existing fallback order: subject id then `subject_code`; section code then id; room id then `room_number` with external-room fallback; faculty id then `employee_id`/`wmsu_id`/`faculty_name` with external-name fallback. Move the four catalog repository injections into the resolver.

Refactor `ScheduleReuseService` to inject `ScheduleCatalogResolver` and call `this.catalog.*`. Do not change any reuse result, conflict reason, or status behavior. Register and export `ScheduleCatalogResolver` in `scheduling.module.ts`.

- [ ] **Step 4: Add the DTOs**

Create the DTOs exactly as declared in the Interfaces block, following `reuse-published-version.dto.ts` for the `@Equals(true)` workaround.

- [ ] **Step 5: Run focused and regression tests**

Run:
```bash
pnpm --filter @coe-nnect/backend exec jest --runTestsByPath test/schedule-catalog-resolver-contract.spec.ts
pnpm --filter @coe-nnect/backend exec jest --runTestsByPath test/reuse-published-version.dto.spec.ts
pnpm --filter @coe-nnect/backend exec jest --runTestsByPath test/published-version-routes.spec.ts
```
Expected: all PASS; reuse contract behavior unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/scheduling/services/schedule-catalog-resolver.service.ts apps/backend/src/modules/scheduling/dto/draft-snapshot.dto.ts apps/backend/src/modules/scheduling/services/schedule-reuse.service.ts apps/backend/src/modules/scheduling/scheduling.module.ts apps/backend/test/schedule-catalog-resolver-contract.spec.ts
git commit -m "Extract schedule catalog checks for draft snapshots" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 3: Save and list draft snapshots

**Files:**
- Create: `apps/backend/src/modules/scheduling/services/term-draft-snapshot.service.ts`
- Create: `apps/backend/src/modules/scheduling/controllers/draft-snapshot.controller.ts`
- Create: `apps/backend/test/draft-snapshot-routes.spec.ts`
- Modify: `apps/backend/src/modules/scheduling/scheduling.module.ts`

**Interfaces:**
- Consumes: `TermDraftSnapshot`, `SaveDraftSnapshotDto`, `DraftSnapshotTargetDto`, `Term`, `Schedule`, `ScheduleCatalogResolver`.
- Produces:

```ts
export type DraftSnapshotSummary = {
  snapshotId: string;
  termId: string;
  termName: string;
  semester: string | null;
  schoolYear: string;
  name: string;
  entryCount: number;
  createdAt: string;
};

class TermDraftSnapshotService {
  save(dto: SaveDraftSnapshotDto, actor: any): Promise<DraftSnapshotSummary>;
  list(termId: string, deptId: string, actor: any): Promise<DraftSnapshotSummary[]>;
}

@Controller('v1/schedules')
class DraftSnapshotController {
  findAll(@Query('termId') termId: string, @Query('deptId') deptId: string, @Req() req: any): Promise<{ data: DraftSnapshotSummary[] }>;
  save(@Body() dto: SaveDraftSnapshotDto, @Req() req: any): Promise<{ data: DraftSnapshotSummary }>;
}
```

- [ ] **Step 1: Write the failing contract test**

Create `draft-snapshot-routes.spec.ts`. Assert:

```ts
const controller = read('apps/backend/src/modules/scheduling/controllers/draft-snapshot.controller.ts');
const service = read('apps/backend/src/modules/scheduling/services/term-draft-snapshot.service.ts');
const module = read('apps/backend/src/modules/scheduling/scheduling.module.ts');

assert.match(controller, /@Controller\('v1\/schedules'\)/);
assert.match(controller, /@Get\('draft-snapshots'\)/);
assert.match(controller, /@Post\('draft-snapshots'\)/);
assert.equal(
  (controller.match(/@Roles\('department_head', 'administrator'\)/g) ?? []).length,
  2,
);
assert.match(controller, /@Auditable\(\{ action: 'schedule\.draft_save', source: 'Scheduling' \}\)/);
assert.match(service, /async save\(dto: SaveDraftSnapshotDto, actor: any\)/);
assert.match(service, /async list\(termId: string, deptId: string, actor: any\)/);
assert.match(service, /status:\s*In\(\['draft', 'review'\]\)/);
assert.match(service, /is_active/);
assert.match(service, /throw new BadRequestException/);
assert.doesNotMatch(service, /status: 'published'/);

const registered = module.match(/controllers:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
assert.ok(
  registered.indexOf('DraftSnapshotController') <
    registered.indexOf('SchedulingController'),
);
assert.match(module, /TermDraftSnapshotService,/);
```

Also assert that the save path rejects zero draft/review rows and that `save()` writes denormalized `termName`, `semester`, and `schoolYear` from the term row.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/backend exec jest --runTestsByPath test/draft-snapshot-routes.spec.ts`
Expected: FAIL because the service/controller do not exist.

- [ ] **Step 3: Implement save and list**

In `TermDraftSnapshotService`:

- Inject `@InjectRepository(TermDraftSnapshot)`, `@InjectRepository(Term)`, `@InjectRepository(Schedule)`, and `SupabaseService`.
- `assertActor(actor, deptId)` mirrors `ScheduleReuseService.assertActor()`: administrator passes with any numeric `deptId`; department head must have a non-empty `deptId` equal to `dto.deptId`.
- `assertActiveTerm(termId)` loads `term_id, term_name, semester, school_year, is_active` with the admin Supabase client, throws `NotFoundException` if missing and `BadRequestException` if `is_active !== true`.
- `save()`: trim the name, query `Schedule` where `termId`, `deptId`, `status: In(['draft','review'])` with `subject`, `sectionRef`, `room`, `faculty` relations, reject an empty result, map rows through a `toDraftSnapshotEntry()` helper that uses the exact `PublishedVersionEntry` field set and numbers repeated `(subjectId, sectionId, loadType)` sessions by numeric `scheduleId`, then persist one `TermDraftSnapshot` with `createdBy: actor?.userId ?? null` and return its summary.
- `list()`: query by `termId` and `deptId`, order by `createdAt DESC`, and return summaries with `entryCount` derived from `snapshot.entries.length`.

- [ ] **Step 4: Implement the controller**

Register `DraftSnapshotController` before `SchedulingController` in `scheduling.module.ts`. Both routes use `@Roles('department_head', 'administrator')`; `save()` uses `@Auditable({ action: 'schedule.draft_save', source: 'Scheduling' })`. Add the service to providers and exports.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/backend exec jest --runTestsByPath test/draft-snapshot-routes.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/scheduling/services/term-draft-snapshot.service.ts apps/backend/src/modules/scheduling/controllers/draft-snapshot.controller.ts apps/backend/src/modules/scheduling/scheduling.module.ts apps/backend/test/draft-snapshot-routes.spec.ts
git commit -m "Add draft snapshot save and list API" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 4: Preflight and all-or-nothing load

**Files:**
- Modify: `apps/backend/src/modules/scheduling/services/term-draft-snapshot.service.ts`
- Modify: `apps/backend/src/modules/scheduling/controllers/draft-snapshot.controller.ts`
- Modify: `apps/backend/test/draft-snapshot-routes.spec.ts`

**Interfaces:**
- Consumes: `ScheduleCatalogResolver`, `RuleContextBuilder`, `ConstraintsService`, `ScheduleFacultyService`, `DataSource`, `TermDraftSnapshot`.
- Produces:

```ts
export type DraftLoadConflict = {
  entry: DraftSnapshotEntry;
  targetScheduleId: string | null;
  action: 'conflict';
  reason: string;
};
export type DraftLoadResult = {
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

class TermDraftSnapshotService {
  preflight(snapshotId: string, dto: DraftSnapshotTargetDto, actor: any): Promise<DraftLoadResult>;
  apply(snapshotId: string, dto: ApplyDraftSnapshotDto, actor: any): Promise<DraftLoadResult>;
}
```

- [ ] **Step 1: Extend the failing contract test**

Append to `draft-snapshot-routes.spec.ts`:

```ts
assert.match(service, /async preflight\(snapshotId: string, dto: DraftSnapshotTargetDto, actor: any\)/);
assert.match(service, /async apply\(snapshotId: string, dto: ApplyDraftSnapshotDto, actor: any\)/);
assert.match(service, /dto\.confirmed !== true/);
assert.match(service, /snapshot\.termId/);
assert.match(service, /filter\(item => item\?\.status === 'draft' \|\| item\?\.status === 'review'\)/);
assert.match(service, /excludeScheduleIds:/);
assert.match(service, /existingSchedule\.push\(/);
assert.match(service, /engine\.hardConflicts\.length > 0/);
assert.match(service, /engine\.softWarnings/);
assert.match(service, /prospectus/);
assert.match(service, /cancelOrphanedFacultyRequest\(/);
assert.match(service, /this\.dataSource\.transaction\(/);
assert.match(controller, /@Post\('draft-snapshots\/:snapshotId\/preflight'\)/);
assert.match(controller, /@Post\('draft-snapshots\/:snapshotId\/load'\)/);
assert.match(controller, /@Auditable\(\{ action: 'schedule\.draft_load', source: 'Scheduling' \}\)/);
assert.equal(
  (controller.match(/@Roles\('department_head', 'administrator'\)/g) ?? []).length,
  4,
);
```

Also assert the service source contains a conflict reason for a live row whose status is `finalized` or `published`, and one for `pendingFacultyRequestId`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/backend exec jest --runTestsByPath test/draft-snapshot-routes.spec.ts`
Expected: FAIL on the new preflight/apply assertions.

- [ ] **Step 3: Implement assessment**

Implement `preflight()` and `apply()` around one private `assess(snapshotId, dto, actor, mode)` method:

- Load the snapshot by id and dept; reject a missing snapshot with `NotFoundException`. Reject `String(snapshot.termId) !== String(dto.termId)` with `ConflictException`. Filter entries to `status === 'draft' || status === 'review'`; fail if none remain.
- Call `assertActor()` and `assertActiveTerm()` before assessment. `apply()` additionally requires `dto.confirmed === true`, otherwise `BadRequestException`.
- Load current `Schedule` rows for `termId + deptId` with catalog relations. Group draft/review rows by `baseKey(resolvedSubjectId, resolvedSectionId, loadType)` + `session_index`, sorted by numeric `scheduleId`. Build the match key after catalog resolution, not from raw snapshot ids.
- For each entry: resolve subject/section/room/faculty through `ScheduleCatalogResolver`; reject a subject outside the term prospectus, a deactivated receiving or subject-owning department, and incomplete day/time. If the matched live row is `finalized`/`published` or has `pendingFacultyRequestId`, emit a conflict and do not overwrite it.
- Build the rule context with `excludeScheduleIds` set to **all** current draft/review ids in scope. Append a synthetic `ScheduleEntryContext` for each already-accepted snapshot entry (`scheduleId: 'snapshot:<index>'`) to `context.existingSchedule` before `ConstraintsService.evaluate()`. Treat `engine.hardConflicts` as conflicts and `engine.softWarnings` as warnings.
- In apply mode, create cross-department faculty requests with `ScheduleFacultyService.ensureCrossDeptFacultyRequest()` before validation; rollback newly created gates when validation or any write fails. Never cancel a request that was already pending before the load started.

- [ ] **Step 4: Implement transaction and controller routes**

Use `DataSource.transaction()` for snapshot inserts/updates/deletes. Update matched rows, create unmatched snapshot entries, and delete current draft/review rows not matched by the snapshot. For each deleted row with `pendingFacultyRequestId`, call `cancelOrphanedFacultyRequest()` after the delete. Return `DraftLoadResult` with `failed: false` only when no conflicts were found.

Add the two controller routes with roles and audit decorators asserted in Step 1.

- [ ] **Step 5: Run focused and regression tests**

Run:
```bash
pnpm --filter @coe-nnect/backend exec jest --runTestsByPath test/draft-snapshot-routes.spec.ts
pnpm --filter @coe-nnect/backend exec jest --runTestsByPath test/reuse-published-version.dto.spec.ts
pnpm --filter @coe-nnect/backend exec jest --runTestsByPath test/published-version-routes.spec.ts
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/scheduling/services/term-draft-snapshot.service.ts apps/backend/src/modules/scheduling/controllers/draft-snapshot.controller.ts apps/backend/test/draft-snapshot-routes.spec.ts
git commit -m "Validate and apply draft snapshot loads" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 5: Frontend draft snapshot API client

**Files:**
- Modify: `apps/frontend/src/api/schedule.api.ts`
- Create: `apps/frontend/src/features/timetable/draft-save-load.test.ts`

**Interfaces:**
- Consumes: `PublishedVersionEntry`, `api` from `./client`.
- Produces:

```ts
export type DraftSnapshotEntry = Omit<PublishedVersionEntry, 'status'> & {
  status: 'draft' | 'review';
};
export type DraftLoadConflict = {
  entry: DraftSnapshotEntry;
  targetScheduleId: string | null;
  action: 'conflict';
  reason: string;
};
export type DraftLoadResult = {
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
export type DraftSnapshotSummary = {
  snapshotId: string;
  termId: string;
  termName: string;
  semester: string | null;
  schoolYear: string;
  name: string;
  entryCount: number;
  createdAt: string;
};

fetchDraftSnapshots(termId: string, deptId: string): Promise<DraftSnapshotSummary[]>;
saveDraftSnapshot(input: { termId: string; deptId: string; name: string }): Promise<DraftSnapshotSummary>;
preflightDraftSnapshot(snapshotId: string, termId: string, deptId: string): Promise<DraftLoadResult>;
applyDraftSnapshot(snapshotId: string, termId: string, deptId: string): Promise<DraftLoadResult>;
```

- [ ] **Step 1: Write the failing source guard**

Create `draft-save-load.test.ts` using the existing frontend node:test `read()` pattern. Assert:

```ts
const api = read('apps/frontend/src/api/schedule.api.ts');
assert.match(api, /export type DraftSnapshotEntry/);
assert.match(api, /status: 'draft' \| 'review'/);
assert.match(api, /export async function fetchDraftSnapshots/);
assert.match(api, /\/v1\/schedules\/draft-snapshots'/);
assert.match(api, /export async function saveDraftSnapshot/);
assert.match(api, /export async function preflightDraftSnapshot/);
assert.match(api, /draft-snapshots\/\$\{snapshotId\}\/preflight/);
assert.match(api, /export async function applyDraftSnapshot/);
assert.match(api, /draft-snapshots\/\$\{snapshotId\}\/load/);
assert.match(api, /confirmed: true/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/draft-save-load.test.ts`
Expected: FAIL because the API functions do not exist.

- [ ] **Step 3: Implement the API client**

Add the types and four functions to `schedule.api.ts`. Use `api.get` with `{ params: { termId, deptId } }` for `fetchDraftSnapshots` and `api.request({ method: 'POST', url, data })` for the three mutations, following `preflightReuse`/`applyReuse`. Every function returns `data.data`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/draft-save-load.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/api/schedule.api.ts apps/frontend/src/features/timetable/draft-save-load.test.ts
git commit -m "Add draft snapshot frontend API client" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 6: Save-as-draft flow

**Files:**
- Create: `apps/frontend/src/features/timetable/components/SaveDraftDialog.tsx`
- Modify: `apps/frontend/src/features/timetable/TimetablePage.tsx`
- Modify: `apps/frontend/src/features/timetable/draft-save-load.test.ts`

**Interfaces:**
- Consumes: `saveDraftSnapshot`, `allEntries`, `activeTerm`, `myDeptId`, `feedback`.
- Produces:

```tsx
type SaveDraftDialogProps = {
  open: boolean;
  onClose: () => void;
  termLabel: string;
  entryCount: number;
  name: string;
  busy: boolean;
  onNameChange: (value: string) => void;
  onSave: () => void;
};
```

Page state and handlers: `saveDraftOpen`, `draftName`, `savingDraft`, `handleOpenSaveDraft`, `handleSaveDraft`.

- [ ] **Step 1: Extend the failing source guard**

Append to `draft-save-load.test.ts`:

```ts
const page = read('apps/frontend/src/features/timetable/TimetablePage.tsx');
const dialog = read('apps/frontend/src/features/timetable/components/SaveDraftDialog.tsx');

assert.match(page, /key: 'save-draft'/);
assert.match(page, /label: 'Save as draft…'/);
assert.match(page, /handleOpenSaveDraft/);
assert.match(page, /handleSaveDraft/);
assert.match(page, /saveDraftSnapshot\(/);
assert.match(page, /feedback\.success\(/);
assert.match(page, /feedback\.error\(/);
assert.match(page, /\['term-draft-snapshots', activeTerm\.termId, myDeptId\]/);
assert.doesNotMatch(page, /alert\(|confirm\(|prompt\(/);
assert.match(dialog, /<Modal/);
assert.match(dialog, /Save timetable draft/);
assert.match(dialog, /Draft name/);
assert.match(dialog, /entryCount/);
```

Also assert the page still contains `dataTour: 'tt-focus'`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/draft-save-load.test.ts`
Expected: FAIL on the save-flow assertions.

- [ ] **Step 3: Implement the dialog**

Create `SaveDraftDialog.tsx` with the exact props above. Use `Modal` with title `Save timetable draft`, an input labelled `Draft name`, a visible `termLabel` and `entryCount`, and a primary button labelled `Save draft`. Keep it presentational: no feedback calls and no API calls inside the component.

- [ ] **Step 4: Wire the page**

In `TimetablePage.tsx`:

- Import `saveDraftSnapshot`, `SaveDraftDialog`, and `DraftSnapshotSummary`.
- Add the three state values and two handlers with the exact names above. `handleOpenSaveDraft` clears `draftName` and opens the dialog. `handleSaveDraft` checks `activeTerm`, `myDeptId`, and a non-blank name, calls the API, calls `feedback.success()` with the saved name and term, invalidates `['term-draft-snapshots', activeTerm.termId, myDeptId]`, closes the dialog, and calls `feedback.error()` on failure.
- Add a More-menu item with `key: 'save-draft'`, `label: 'Save as draft…'`, `onSelect: handleOpenSaveDraft`, `disabled` while saving, and no `dataTour`.
- Mount `<SaveDraftDialog ... />` with `entryCount` derived from `allEntries.filter((entry) => entry.status === 'draft' || entry.status === 'review').length`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/draft-save-load.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/timetable/components/SaveDraftDialog.tsx apps/frontend/src/features/timetable/TimetablePage.tsx apps/frontend/src/features/timetable/draft-save-load.test.ts
git commit -m "Wire save as draft dialog" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 7: Load-drafts flow

**Files:**
- Create: `apps/frontend/src/features/timetable/components/SavedDraftDrawer.tsx`
- Create: `apps/frontend/src/features/timetable/components/DraftLoadSummaryModal.tsx`
- Modify: `apps/frontend/src/features/timetable/TimetablePage.tsx`
- Modify: `apps/frontend/src/features/timetable/draft-save-load.test.ts`

**Interfaces:**
- Consumes: `fetchDraftSnapshots`, `preflightDraftSnapshot`, `applyDraftSnapshot`, `DraftSnapshotSummary`, `DraftLoadResult`, `feedback`.
- Produces:

```tsx
type SavedDraftDrawerProps = {
  open: boolean;
  onClose: () => void;
  termLabel: string;
  snapshots: DraftSnapshotSummary[];
  busySnapshotId: string | null;
  onLoad: (snapshot: DraftSnapshotSummary) => void;
};

type DraftLoadSummaryModalProps = {
  open: boolean;
  onClose: () => void;
  snapshotName: string;
  termLabel: string;
  result: DraftLoadResult | null;
  busy: boolean;
  onConfirm: () => void;
};
```

Page state and handlers: `draftsOpen`, `draftPreflight`, `busySnapshotId`, `applyingDraft`, `handleOpenDrafts`, `handlePreflightDraft`, `handleApplyDraft`.

- [ ] **Step 1: Extend the failing source guard**

Append to `draft-save-load.test.ts`:

```ts
const drawer = read('apps/frontend/src/features/timetable/components/SavedDraftDrawer.tsx');
const summary = read('apps/frontend/src/features/timetable/components/DraftLoadSummaryModal.tsx');

assert.match(page, /key: 'load-draft'/);
assert.match(page, /label: 'Load drafts…'/);
assert.match(page, /handleOpenDrafts/);
assert.match(page, /handlePreflightDraft/);
assert.match(page, /handleApplyDraft/);
assert.match(page, /preflightDraftSnapshot\(/);
assert.match(page, /applyDraftSnapshot\(/);
assert.match(page, /\['schedules', activeTerm\.termId\]/);
assert.match(page, /\['unscheduled', activeTerm\.termId, myDeptId\]/);
assert.match(page, /\['faculty-requests'\]/);
assert.match(page, /\['term-draft-snapshots', activeTerm\.termId, myDeptId\]/);
assert.match(drawer, /role="dialog"/);
assert.match(drawer, /aria-label="Saved timetable drafts"/);
assert.match(drawer, /schoolYear/);
assert.match(drawer, /semester/);
assert.match(summary, /conflicts\.length/);
assert.match(summary, /result\.summary/);
assert.match(summary, /Load this draft/);
assert.doesNotMatch(page + drawer + summary, /alert\(|confirm\(|prompt\(/);
```

Also assert the confirm button is disabled when `result.failed` or `result.conflicts.length > 0`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/draft-save-load.test.ts`
Expected: FAIL on the load-flow assertions.

- [ ] **Step 3: Implement the drawer and summary modal**

Create `SavedDraftDrawer.tsx` with an `<aside role="dialog" aria-label="Saved timetable drafts">`. Render one folder header using `schoolYear · semester · termName` and each snapshot with its name, `createdAt`, `entryCount`, and a `Load` button. Show an empty state when `snapshots.length === 0`. Keep it presentational.

Create `DraftLoadSummaryModal.tsx` with the exact props above. Render `result.summary`, counts `matched`, `ready`, `create`, `update`, `remove`, `keptAsIs`, `warnings`, and each conflict reason. Disable `Load this draft` when `!result || result.failed || result.conflicts.length > 0` or `busy`.

- [ ] **Step 4: Wire the page**

In `TimetablePage.tsx`:

- Import the two new components and the three API functions.
- Add a React Query for `['term-draft-snapshots', activeTerm?.termId, myDeptId]` enabled only when `draftsOpen && activeTerm && isDepartmentHead && myDeptId`.
- Add the four state values and three handlers with the exact names above. `handleOpenDrafts` opens the drawer. `handlePreflightDraft` calls preflight, stores `{ snapshot, result }`, and uses `feedback.error()` on failure. `handleApplyDraft` requires a successful conflict-free preflight, calls apply, invalidates the five query keys asserted in Step 1, closes both surfaces, and emits `feedback.success()` with the saved draft name and term; errors use `feedback.error()`.
- Add a More-menu item with `key: 'load-draft'`, `label: 'Load drafts…'`, `onSelect: handleOpenDrafts`, `disabled` while applying, and no `dataTour`.
- Mount both components with the props declared in the Interfaces block.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @coe-nnect/frontend exec node --test src/features/timetable/draft-save-load.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/timetable/components/SavedDraftDrawer.tsx apps/frontend/src/features/timetable/components/DraftLoadSummaryModal.tsx apps/frontend/src/features/timetable/TimetablePage.tsx apps/frontend/src/features/timetable/draft-save-load.test.ts
git commit -m "Wire load drafts drawer and preflight" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 8: Browser E2E coverage

**Files:**
- Create: `e2e/specs/draft-save-load.spec.ts`

**Interfaces:**
- Consumes: `loginAs`, `openTimetable`, `scheduleBlock`, seed state from `e2e/specs/helpers.ts` and `e2e/seed.ts`; the More-menu pattern from `e2e/specs/published-version.spec.ts`.
- Produces: five Playwright tests named:
  - `saves named drafts with the term year and semester label`
  - `blocks load when the saved draft conflicts with itself`
  - `blocks load when a live row is finalized or has a pending faculty request`
  - `restores saved draft and review rows without touching published rows`
  - `rejects loading a snapshot into a different term`

- [ ] **Step 1: Write the E2E spec**

Use existing helpers for login and timetable navigation. Define local helpers:

```ts
const moreItem = (page: Page, name: string) =>
  page.getByRole('menu', { name: 'More actions' }).getByRole('menuitem', { name, exact: true });
const openMore = async (page: Page) =>
  page.getByRole('button', { name: 'More', exact: true }).click();
```

Cover, in order:

1. Save: open More → `Save as draft…` → fill `Draft name` with `Working A` → click `Save draft` → assert feedback contains `Working A`, then reopen `Load drafts…` and assert the folder header contains the seeded `schoolYear`, semester, and term name.
2. Snapshot-internal conflict: seed two draft rows with the same faculty and overlapping time, save them, then load and assert the summary dialog contains a conflict reason and `Load this draft` is disabled.
3. Live obstacle: save a draft, then make a copied live row `finalized` (or attach a pending faculty request through the existing API/helper), load, and assert conflict feedback plus unchanged published/finalized status.
4. Successful restore: save a draft and a `review` row, mutate the live grid, load the snapshot, confirm, and assert the restored statuses are `draft`/`review` and a seeded `published` row keeps its status and id.
5. Cross-term: save in the seeded active term, activate a second term using the existing term-management helper, open `Load drafts…` for the new term, and assert no snapshot for `Working A` is offered; additionally call the load endpoint directly with the mismatched `termId` and assert HTTP 409.

Use `page.waitForResponse()` before clicking any preflight or load action, following the established `clickReuse` pattern.

- [ ] **Step 2: Verify E2E discovery**

Run: `pnpm test:e2e:list`
Expected: the five new tests are listed and existing tests remain listed. Do not run local browser E2E; CI Browser E2E is authoritative.

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/draft-save-load.spec.ts
git commit -m "Cover draft snapshot save and load in browser tests" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

### Task 9: Full verification

**Files:**
- No source changes unless verification finds a defect.

**Interfaces:**
- Consumes: all tasks above.

- [ ] **Step 1: Run the full local suite**

Run:
```bash
pnpm typecheck && pnpm typecheck:e2e && pnpm test && pnpm test:e2e:list
```
Expected: all commands exit 0; frontend, backend, constraint-rules tests pass; E2E list includes the five new tests.

- [ ] **Step 2: Check the committed diff scope**

Run: `git status --short` and `git diff --check`.
Expected: clean tree, no whitespace errors, no staged `.superpowers/`, `final-review.diff`, unrelated docs plans/specs, or `docs/integrations/idp-request-change-update.md`.

- [ ] **Step 3: Commit any verification-only fixes**

```bash
git add <only files changed by verification fixes>
git commit -m "Fix draft snapshot verification findings" -m "Co-authored-by: trynotybort <trynotybort@gmail.com>"
```

Skip this step if verification required no fixes.
