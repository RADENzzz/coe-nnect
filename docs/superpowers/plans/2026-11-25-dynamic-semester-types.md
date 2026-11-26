# Dynamic Semester Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed `1st | 2nd | summer` semester enum with a dean-managed catalog, so a tri-semester or any custom term structure works without a code change or migration.

**Architecture:** A `semester_type` table holds immutable codes, editable labels, sort order, and an active flag. The four referencing columns become `text` with foreign keys. A NestJS module exposes CRUD; every write path validates against the catalog. The frontend reads the catalog through one TanStack Query hook and renders every option and label from it.

**Tech Stack:** PostgreSQL/Supabase migrations, NestJS + TypeORM, React + Vite + TanStack Query, Node's built-in test runner for pure frontend utilities.

**Spec:** `docs/superpowers/specs/2026-11-25-dynamic-semesters-and-guardrails-design.md`

## Global Constraints

- Commit messages are plain descriptive sentences. No `feat:`, `fix:`, `chore:`, or other colon-prefixed labels.
- Existing codes `1st`, `2nd`, and `summer` must keep working with no data rewrite.
- `term.semester` stays nullable; `prospectus.semester` stays `NOT NULL`.
- Column names stay `semester` and `elective_semester`; only their type changes.
- Backend verification from `apps/backend`: `pnpm typecheck`, `pnpm typecheck:test`, `pnpm test:ci -- --runInBand test/<file>.spec.ts`.
- Frontend verification from `apps/frontend`: `pnpm typecheck`, `pnpm test`.
- Migration verification from the repo root: `supabase db reset` when Docker is available; CI also runs it.
- Never validate a semester the user did not change. An existing row with an inactive type must still save when an unrelated field is edited.
- The catalog is locked whenever any term is active. All four write endpoints return 409 naming the blocking term; there is no override.

## Review Focus

1. **Inactive type on an existing row.** Editing an unrelated field must not change or clear the stored semester. Pinned in Task 3's `subjects` update test.
2. **Unknown PDF table label.** The importer must not coerce it to the first type; the confirm step must block until a valid type is chosen. Pinned in Task 5's `matchSemesterType` test and Task 9's manual check.
3. **Deleting a type in use.** The API must return a readable 400 naming the counts, not a raw foreign-key error. Pinned in Task 2.
4. **Ambiguous labels.** Two types sharing a label must resolve deterministically by sort order, never silently pick a random row. Pinned in Task 5.
5. **Custom term code through IDP.** `2026-2027-3rd` must pass DTO validation and publish.
6. **Active-term lock.** Every catalog mutation is rejected while a term is active, including the panel's "deactivate instead" fallback. Pinned in Task 2's lock tests and Task 8's read-only state. Pinned in Task 4.

---

## File Structure

**Backend**

- `supabase/migrations/20261125000000_dynamic_semester_types.sql` — schema, seed, foreign keys, RLS.
- `apps/backend/src/modules/semesters/` — entity, DTOs, service, controller, module.
- `apps/backend/src/modules/idp/term-code.ts` — one shared term-code pattern.
- Write-path validation in `terms`, `prospectus`, `subjects`, and `prospectus-pdfs`.

**Frontend**

- `apps/frontend/src/api/semesters.api.ts` — HTTP client and types.
- `apps/frontend/src/hooks/use-semester-types.ts` — query plus label/order helpers.
- `apps/frontend/src/lib/semester-match.ts` and `.test.ts` — code/label/alias matching.
- `apps/frontend/src/features/system-config/components/SemesterTypesPanel.tsx` — dean manager.
- `apps/frontend/src/components/ui/ConfirmDialog.tsx` — shared confirmation.
- Existing dropdowns and import components consume the hook.

---

### Task 1: Catalog schema and seed

**Files:**
- Create: `supabase/migrations/20261125000000_dynamic_semester_types.sql`

**Interfaces:**
- Produces: table `public.semester_type(code, label, short_label, sort_order, is_active, created_at, updated_at)` and four foreign keys.

- [ ] **Step 1: Write the migration**

```sql
-- Dynamic semester types.
--
-- Replaces the public.semester_type enum with a dean-managed catalog table.
-- Codes are immutable; labels are editable. Existing values are preserved and
-- gain foreign keys, so a type cannot be deleted while it is in use.

-- 1. Abort if any legacy value is outside the seeded catalog.
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(DISTINCT v.value, ', ') INTO bad
  FROM (
    SELECT semester AS value
    FROM public.prospectus_pdf_table
    WHERE semester IS NOT NULL
    UNION
    SELECT elective_semester
    FROM public.subject
    WHERE elective_semester IS NOT NULL
  ) AS v
  WHERE v.value NOT IN ('1st', '2nd', 'summer');

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot migrate semester types: unknown values %', bad;
  END IF;
END $$;

-- 2. Enum columns become text.
ALTER TABLE public.term
  ALTER COLUMN semester TYPE text USING semester::text;

ALTER TABLE public.prospectus
  ALTER COLUMN semester TYPE text USING semester::text;

-- 3. Drop the enum before reusing the name for the catalog table.
DROP TYPE public.semester_type;

-- 4. Catalog.
CREATE TABLE public.semester_type (
  code text PRIMARY KEY,
  label text NOT NULL,
  short_label text NOT NULL,
  sort_order smallint NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT semester_type_code_format
    CHECK (code ~ '^[a-z0-9][a-z0-9_-]{0,19}$'),
  CONSTRAINT semester_type_label_not_blank
    CHECK (length(btrim(label)) > 0),
  CONSTRAINT semester_type_short_label_not_blank
    CHECK (length(btrim(short_label)) > 0)
);

INSERT INTO public.semester_type (code, label, short_label, sort_order)
VALUES
  ('1st', 'First Semester', '1st', 10),
  ('2nd', 'Second Semester', '2nd', 20),
  ('summer', 'Summer', 'Summer', 30);

-- 5. Replace the old text checks with catalog foreign keys.
ALTER TABLE public.prospectus_pdf_table
  DROP CONSTRAINT IF EXISTS prospectus_pdf_table_semester_check;

ALTER TABLE public.subject
  DROP CONSTRAINT IF EXISTS subject_elective_semester_check;

ALTER TABLE public.term
  ADD CONSTRAINT term_semester_fkey FOREIGN KEY (semester)
  REFERENCES public.semester_type(code) ON UPDATE CASCADE;

ALTER TABLE public.prospectus
  ADD CONSTRAINT prospectus_semester_fkey FOREIGN KEY (semester)
  REFERENCES public.semester_type(code) ON UPDATE CASCADE;

ALTER TABLE public.prospectus_pdf_table
  ADD CONSTRAINT prospectus_pdf_table_semester_fkey FOREIGN KEY (semester)
  REFERENCES public.semester_type(code) ON UPDATE CASCADE;

ALTER TABLE public.subject
  ADD CONSTRAINT subject_elective_semester_fkey FOREIGN KEY (elective_semester)
  REFERENCES public.semester_type(code) ON UPDATE CASCADE;

-- 6. RLS mirrors term: authenticated reads, writes through the API.
ALTER TABLE public.semester_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY read_authenticated ON public.semester_type
  FOR SELECT TO authenticated USING (true);
```

- [ ] **Step 2: Apply it to a clean database**

Run from the repo root: `supabase db reset`
Expected: every migration applies with no errors.

If Docker is unavailable, note that `.github/workflows/ci-migrations.yml` runs the same reset in CI.

- [ ] **Step 3: Verify the seed**

Run:

```sql
select code, label, short_label, sort_order, is_active
from public.semester_type
order by sort_order;
```

Expected: `1st | First Semester | 1st | 10 | true`, `2nd | Second Semester | 2nd | 20 | true`, `summer | Summer | Summer | 30 | true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261125000000_dynamic_semester_types.sql
git commit -m "Add a dean-managed semester type catalog"
```

---

### Task 2: Semesters module and CRUD

**Files:**
- Create: `apps/backend/src/modules/semesters/entities/semester-type.entity.ts`
- Create: `apps/backend/src/modules/semesters/dto/create-semester-type.dto.ts`
- Create: `apps/backend/src/modules/semesters/dto/update-semester-type.dto.ts`
- Create: `apps/backend/src/modules/semesters/dto/reorder-semester-types.dto.ts`
- Create: `apps/backend/src/modules/semesters/semesters.service.ts`
- Create: `apps/backend/src/modules/semesters/semesters.controller.ts`
- Create: `apps/backend/src/modules/semesters/semesters.module.ts`
- Modify: `apps/backend/src/app.module.ts` (add `SemestersModule` after `TermsModule`)
- Test: `apps/backend/test/semesters.service.spec.ts`

**Interfaces:**
- Consumes: `createFakeRepository` from `test/fakes/repository.fake.ts`.
- Produces:
  - `SemestersService.findAll(): Promise<SemesterTypeWithUsage[]>`
  - `SemestersService.assertUsable(code: string): Promise<void>`
  - `SemestersService.create(dto: CreateSemesterTypeDto): Promise<SemesterType>`
  - `SemestersService.update(code: string, dto: UpdateSemesterTypeDto): Promise<SemesterType>`
  - `SemestersService.reorder(codes: string[]): Promise<SemesterType[]>`
  - `SemestersService.remove(code: string): Promise<{ success: true }>`
  - `SemesterTypeWithUsage` adds `termCount`, `prospectusCount`, `pdfTableCount`, `electiveCount`.
  - Endpoints: `GET /v1/semesters`, `POST /v1/semesters`, `PATCH /v1/semesters/reorder`, `PATCH /v1/semesters/:code`, `DELETE /v1/semesters/:code`.

- [ ] **Step 1: Write the failing service test**

```ts
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SemestersService } from '../src/modules/semesters/semesters.service';
import { createFakeRepository } from './fakes/repository.fake';

const SEED = [
  { code: '1st', label: 'First Semester', shortLabel: '1st', sortOrder: 10, isActive: true },
  { code: '2nd', label: 'Second Semester', shortLabel: '2nd', sortOrder: 20, isActive: true },
  { code: 'summer', label: 'Summer', shortLabel: 'Summer', sortOrder: 30, isActive: true },
];

function build() {
  // semester_type's primary key is `code`, not the fake's default `id`.
  const repo = createFakeRepository(SEED, { idKey: 'code' });
  const terms = createFakeRepository([], { idKey: 'termId' });
  const prospectus = createFakeRepository([], { idKey: 'prospectusId' });
  const pdfTables = createFakeRepository([], { idKey: 'tableId' });
  const subjects = createFakeRepository([], { idKey: 'subjectId' });

  return {
    repo,
    terms,
    prospectus,
    pdfTables,
    subjects,
    service: new SemestersService(
      repo as any,
      terms as any,
      prospectus as any,
      pdfTables as any,
      subjects as any,
    ),
  };
}

describe('SemestersService', () => {
  it('normalizes a new code and appends the sort order', async () => {
    const { service } = build();
    const created = await service.create({
      code: ' 3RD ',
      label: 'Third Semester',
      shortLabel: '3rd',
    });

    expect(created.code).toBe('3rd');
    expect(created.sortOrder).toBe(40);
    expect(created.isActive).toBe(true);
  });

  it('rejects a duplicate code', async () => {
    const { service } = build();
    await expect(
      service.create({ code: '1st', label: 'First', shortLabel: '1st' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a code with spaces', async () => {
    const { service } = build();
    await expect(
      service.create({
        code: 'third semester',
        label: 'Third Semester',
        shortLabel: '3rd',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates the label without touching the code', async () => {
    const { service } = build();
    const updated = await service.update('summer', {
      label: 'Midyear Term',
      shortLabel: 'Midyear',
    });

    expect(updated.code).toBe('summer');
    expect(updated.label).toBe('Midyear Term');
  });

  it('reorders every type and rejects an incomplete list', async () => {
    const { service } = build();
    const reordered = await service.reorder(['summer', '1st', '2nd']);

    expect(reordered.map((t) => t.code)).toEqual(['summer', '1st', '2nd']);
    expect(reordered.map((t) => t.sortOrder)).toEqual([10, 20, 30]);

    await expect(service.reorder(['summer'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('blocks deletion while any table references the type', async () => {
    const { service, terms, prospectus } = build();
    terms.rows.push({ termId: '1', semester: 'summer' });
    prospectus.rows.push({ prospectusId: '1', semester: 'summer' });

    await expect(service.remove('summer')).rejects.toThrow(
      /used by 1 prospectus row and 1 term/i,
    );
  });

  it('deletes an unused type', async () => {
    const { service } = build();
    await expect(service.remove('summer')).resolves.toEqual({ success: true });
  });

  it('rejects an unknown or inactive type in assertUsable', async () => {
    const { service, repo } = build();
    await expect(service.assertUsable('3rd')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    repo.rows[0].isActive = false;
    await expect(service.assertUsable('1st')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts an active type in assertUsable', async () => {
    const { service } = build();
    await expect(service.assertUsable('2nd')).resolves.toBeUndefined();
  });

  it('locks every catalog change while a term is active', async () => {
    const { service, terms } = build();
    terms.rows.push({
      termId: 't1',
      termName: 'First Semester 2026-2027',
      isActive: true,
    });

    await expect(
      service.create({ code: '3rd', label: 'Third Semester', shortLabel: '3rd' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.update('summer', { label: 'Midyear Term' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.reorder(['summer', '1st', '2nd']),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('summer')).rejects.toThrow(
      /locked while "First Semester 2026-2027" is active/i,
    );
  });

  it('allows catalog changes again after the term is deactivated', async () => {
    const { service, terms } = build();
    terms.rows.push({
      termId: 't1',
      termName: 'First Semester 2026-2027',
      isActive: false,
    });

    await expect(
      service.update('summer', { label: 'Midyear Term' }),
    ).resolves.toMatchObject({ label: 'Midyear Term' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:ci -- --runInBand test/semesters.service.spec.ts`
Expected: FAIL because `../src/modules/semesters/semesters.service` does not exist.

- [ ] **Step 3: Implement the module**

Entity `SemesterType`:

```ts
@Entity('semester_type')
export class SemesterType {
  @PrimaryColumn({ type: 'text' })
  code: string;

  @Column({ type: 'text' })
  label: string;

  @Column({ name: 'short_label', type: 'text' })
  shortLabel: string;

  @Column({ name: 'sort_order', type: 'smallint' })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
```

DTOs:

- `CreateSemesterTypeDto`: `code` matches `/^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$/`; `label` and `shortLabel` are `@Length(1, 60)`; `sortOrder` is optional `@IsInt()` with `@Min(0)` and `@Max(9999)`.
- `UpdateSemesterTypeDto`: all four fields optional; no `code`.
- `ReorderSemesterTypesDto`: `codes` is `@IsArray()`, `@ArrayNotEmpty()`, `@IsString({ each: true })`.

Service rules:

- Normalize `code` with `trim().toLowerCase()` before the regex and duplicate check.
- `create` appends `(max sortOrder ?? 0) + 10` when `sortOrder` is omitted.
- `update` throws `NotFoundException('Semester type not found')`.
- `reorder` requires the array to contain every existing code exactly once; write `(index + 1) * 10`.
- `remove` counts all four tables and builds a correctly pluralized message, for example `used by 1 prospectus row and 2 terms` (include PDF tables and electives when non-zero), then throws `BadRequestException` with `Deactivate it instead.`. Never emit a literal `(s)`.
- `assertUsable` throws `Unknown semester type "<code>". Add it in System Settings → Academic Calendar first.` and `Semester type "<label>" is inactive. Activate it or choose another.`
- `assertCatalogEditable` checks `terms.findOne({ where: { isActive: true } })` and, when found, throws `ConflictException('Semester types are locked while "<termName>" is active. Deactivate it in System Settings → Academic Calendar first.')`. Call it first in `create`, `update`, `reorder`, and `remove`. Do not call it from `assertUsable` or `findAll`.

Controller mirrors `TermsController`: `@Roles('college_dean', 'college_secretary')` on writes, no role on `GET`, `@Auditable` actions `semester.create`, `semester.update`, `semester.reorder`, `semester.delete`. Put `@Patch('reorder')` before `@Patch(':code')`.

Module imports `TypeOrmModule.forFeature([SemesterType, Term, Prospectus, ProspectusPdfTable, Subject, User])`, provides `SemestersService` and `RolesGuard`, exports `SemestersService`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:ci -- --runInBand test/semesters.service.spec.ts`
Expected: 11 passing.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck && pnpm typecheck:test`
Expected: no errors.

```bash
git add apps/backend/src/modules/semesters apps/backend/src/app.module.ts apps/backend/test/semesters.service.spec.ts
git commit -m "Add semester type CRUD with usage counts and delete guards"
```

---

### Task 3: Validate every write path

**Files:**
- Create: `apps/backend/test/fakes/semesters.fake.ts`
- Modify: `apps/backend/src/modules/terms/terms.service.ts` (constructor and `create`)
- Modify: `apps/backend/src/modules/terms/terms.module.ts`
- Modify: `apps/backend/src/modules/prospectus/prospectus.service.ts` (constructor, `create`, `update`)
- Modify: `apps/backend/src/modules/prospectus/prospectus.module.ts`
- Modify: `apps/backend/src/modules/prospectus/entities/prospectus.entity.ts` (enum column → text)
- Modify: `apps/backend/src/modules/subjects/subjects.service.ts` (constructor, `create`, `update`)
- Modify: `apps/backend/src/modules/subjects/subjects.module.ts`
- Modify: `apps/backend/src/modules/prospectus-pdfs/prospectus-pdfs.service.ts` (constructor, `createTable`, `updateTable`)
- Modify: `apps/backend/src/modules/prospectus-pdfs/prospectus-pdfs.module.ts`
- Modify: `apps/backend/test/terms.service.spec.ts`, `prospectus.service.spec.ts`, `subjects.service.spec.ts`, `prospectus-pdfs.service.spec.ts`

**Interfaces:**
- Consumes: `SemestersService.assertUsable(code: string): Promise<void>`.
- Produces: a 400 from every write path when the code is missing or inactive.

- [ ] **Step 1: Add the shared fake**

```ts
import { BadRequestException } from '@nestjs/common';

export function createFakeSemesters(
  known = ['1st', '2nd', 'summer'],
  active = known,
) {
  return {
    assertUsable: jest.fn(async (code: string) => {
      if (!known.includes(code)) {
        throw new BadRequestException(`Unknown semester type "${code}".`);
      }
      if (!active.includes(code)) {
        throw new BadRequestException(`Semester type "${code}" is inactive.`);
      }
    }),
  };
}
```

- [ ] **Step 2: Write the failing tests**

Add to `terms.service.spec.ts`:

```ts
it('rejects a semester type that is not in the catalog', async () => {
  const { service } = buildService(); // pass createFakeSemesters() as the 5th arg
  await expect(
    service.create({ termName: 'Third', schoolYear: '2026-2027', semester: '3rd' }),
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('accepts a newly added 3rd semester', async () => {
  const { service } = buildService(['1st', '2nd', 'summer', '3rd']);
  const created = await service.create({
    termName: 'Third Semester',
    schoolYear: '2026-2027',
    semester: '3rd',
  });
  expect(created.semester).toBe('3rd');
});
```

Add to `prospectus.service.spec.ts`:

```ts
it('rejects an unknown semester on create', async () => {
  const { service } = createService(); // pass createFakeSemesters()
  await expect(
    service.create({ programId: '1', subjectId: '1', yearLevel: 1, semester: '3rd' }, admin),
  ).rejects.toBeInstanceOf(BadRequestException);
});
```

Add to `subjects.service.spec.ts`:

```ts
it('rejects an unknown elective semester', async () => {
  const { service } = createService(); // pass createFakeSemesters()
  await expect(
    service.create(electiveDto({ electiveSemester: '3rd' }), admin),
  ).rejects.toBeInstanceOf(BadRequestException);
});

it('does not revalidate an inactive semester when the update leaves it unchanged', async () => {
  const semesters = createFakeSemesters(['1st', '2nd', 'summer'], ['1st', '2nd']);
  const { service } = createService(semesters);
  await service.update('1', { title: 'Renamed' }, admin);
  expect(semesters.assertUsable).not.toHaveBeenCalled();
});
```

Add to `prospectus-pdfs.service.spec.ts`:

```ts
it('rejects an unknown table semester', async () => {
  const { service } = build(); // pass createFakeSemesters()
  await expect(
    service.createTable('1', { ...minimalTableDto, semester: '3rd' }, user),
  ).rejects.toBeInstanceOf(BadRequestException);
});
```

Use the existing helpers in each spec; only the constructor calls change.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test:ci -- --runInBand test/terms.service.spec.ts test/prospectus.service.spec.ts test/subjects.service.spec.ts test/prospectus-pdfs.service.spec.ts`
Expected: FAIL because the constructors do not accept the fake yet.

- [ ] **Step 4: Inject and call `assertUsable`**

- `TermsService.create`: call `await this.semesters.assertUsable(dto.semester);` before the duplicate check.
- `ProspectusService.create`: call it after the program and subject checks. In `update`, call it only when `dto.semester !== undefined`.
- `SubjectsService.create`: call it only when `dto.electiveSemester` is truthy. In `update`, call it only when `dto.electiveSemester !== undefined && dto.electiveSemester !== null`.
- `ProspectusPdfsService.createTable`: call it only when `dto.semester` is truthy. In `updateTable`, only when `dto.semester !== undefined && dto.semester !== null`.
- Change `Prospectus.semester` from `type: 'enum', enum: [...], enumName: 'semester_type'` to `type: 'text'`.

Import `SemestersModule` into the four feature modules and add `private readonly semesters: SemestersService` to each constructor.

- [ ] **Step 5: Run the tests to verify they pass**

Run the same command as Step 3.
Expected: all pass.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck && pnpm typecheck:test`
Expected: no errors.

```bash
git add apps/backend/src/modules apps/backend/test
git commit -m "Validate semester codes against the catalog on every write path"
```

---

### Task 4: Accept custom term codes in IDP

**Files:**
- Create: `apps/backend/src/modules/idp/term-code.ts`
- Create: `apps/backend/test/term-code.spec.ts`
- Modify: `apps/backend/src/modules/idp/dto/publish-schedule.dto.ts`
- Modify: `apps/backend/src/modules/idp/dto/sync-faculty.dto.ts`
- Modify: `apps/backend/src/modules/idp/idp-change-request.service.ts`
- Modify: `apps/backend/src/modules/idp/idp-schedule-publisher.service.ts`
- Modify: `apps/backend/src/modules/idp/idp-sync.service.ts`

**Interfaces:**
- Produces: `TERM_CODE_PATTERN: RegExp` and `TERM_CODE_HINT: string`.

- [ ] **Step 1: Write the failing test**

```ts
import { TERM_CODE_PATTERN } from '../src/modules/idp/term-code';

describe('TERM_CODE_PATTERN', () => {
  it.each(['2026-2027-1st', '2026-2027-2nd', '2026-2027-summer', '2026-2027-3rd', '2026-2027-intersession'])(
    'accepts %s',
    (value) => expect(TERM_CODE_PATTERN.test(value)).toBe(true),
  );

  it.each(['2026-2027-Third Semester', '2026-3rd', '2026-2027-', '2026-2027-3RD!'])(
    'rejects %s',
    (value) => expect(TERM_CODE_PATTERN.test(value)).toBe(false),
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:ci -- --runInBand test/term-code.spec.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement and replace the five copies**

```ts
export const TERM_CODE_PATTERN = /^\d{4}-\d{4}-[a-z0-9][a-z0-9_-]{0,19}$/;
export const TERM_CODE_HINT = 'YYYY-YYYY-<semester code>';
```

Replace the local regex in `publish-schedule.dto.ts` and the four inline regexes with this constant. Change the publisher error text from `is not YYYY-YYYY-1st|2nd|summer.` to ``is not ${TERM_CODE_HINT}.``.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:ci -- --runInBand test/term-code.spec.ts test/idp-schedule-publisher.service.spec.ts`
Expected: all pass.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck && pnpm typecheck:test
git add apps/backend/src/modules/idp apps/backend/test/term-code.spec.ts
git commit -m "Accept catalog semester codes in IDP term identifiers"
```

---

### Task 5: Frontend catalog client, hook, and matcher

**Files:**
- Create: `apps/frontend/src/api/semesters.api.ts`
- Create: `apps/frontend/src/hooks/use-semester-types.ts`
- Create: `apps/frontend/src/lib/semester-match.ts`
- Create: `apps/frontend/src/lib/semester-match.test.ts`
- Modify: `apps/frontend/package.json` (`test` script: add `src/lib/semester-match.test.ts`)
- Modify: `apps/frontend/src/api/terms.api.ts`, `prospectus.api.ts`, `subjects.api.ts`, `schedule.api.ts`, `prospectus-pdfs.api.ts`, `features/import/types.ts`

**Interfaces:**
- Produces:
  - `fetchSemesterTypes(): Promise<SemesterTypeRecord[]>`
  - `createSemesterType`, `updateSemesterType`, `deleteSemesterType`, `reorderSemesterTypes`
  - `useSemesterTypes()` returning `{ types, activeTypes, labelFor, shortLabelFor, sortOrderFor, isLoading }`
  - `matchSemesterType(text: string, types: SemesterLike[]): SemesterLike | null`

- [ ] **Step 1: Write the failing matcher test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSemesterType } from './semester-match.ts';

const types = [
  { code: '1st', label: 'First Semester', shortLabel: '1st', sortOrder: 10 },
  { code: '2nd', label: 'Second Semester', shortLabel: '2nd', sortOrder: 20 },
  { code: '3rd', label: 'Third Semester', shortLabel: '3rd', sortOrder: 30 },
  { code: 'summer', label: 'Summer', shortLabel: 'Summer', sortOrder: 40 },
];

test('matches a code, a short label, a full label, and an alias', () => {
  assert.equal(matchSemesterType('3RD', types)?.code, '3rd');
  assert.equal(matchSemesterType('Third Semester', types)?.code, '3rd');
  assert.equal(matchSemesterType('Third', types)?.code, '3rd');
  assert.equal(matchSemesterType('Mid Year', types)?.code, 'summer');
});

test('returns null for an unrecognized value', () => {
  assert.equal(matchSemesterType('Fifth Term', types), null);
});

test('resolves an ambiguous label by sort order', () => {
  const ambiguous = [
    { code: 'a', label: 'Term', shortLabel: 'A', sortOrder: 20 },
    { code: 'b', label: 'Term', shortLabel: 'B', sortOrder: 10 },
  ];
  assert.equal(matchSemesterType('Term', ambiguous)?.code, 'b');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test src/lib/semester-match.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the matcher, API, hook, and type changes**

`semester-match.ts`:

- Normalize input with `trim().toLowerCase().replace(/\s+/g, ' ')`.
- Match in order: exact code, exact short label, exact label, alias, then contains.
- Aliases: `first → 1st`, `second → 2nd`, `third → 3rd`, `fourth → 4th`, `summer → summer`, `midyear/mid year → summer`.
- Sort candidate types by `sortOrder` before matching so ambiguity is deterministic.
- Return the matched type or `null`.

`semesters.api.ts`:

```ts
export interface SemesterTypeRecord {
  code: string;
  label: string;
  shortLabel: string;
  sortOrder: number;
  isActive: boolean;
  termCount: number;
  prospectusCount: number;
  pdfTableCount: number;
  electiveCount: number;
}

export interface CreateSemesterTypeInput {
  code: string;
  label: string;
  shortLabel: string;
  sortOrder?: number;
}

export type UpdateSemesterTypeInput = Partial<Omit<CreateSemesterTypeInput, 'code'>> & {
  isActive?: boolean;
};
```

All functions use `api` from `./client` and return `data.data`.

`use-semester-types.ts`:

- `useQuery({ queryKey: ['semester-types'], queryFn: fetchSemesterTypes, staleTime: 5 * 60 * 1000 })`.
- `labelFor(code)` and `shortLabelFor(code)` fall back to `code`.
- `sortOrderFor(code)` falls back to `Number.MAX_SAFE_INTEGER`.
- `activeTypes` filters `isActive`.

Type changes: replace every `'1st' | '2nd' | 'summer'` union with `string` in the six listed files. Keep the exported alias names (`SemesterType`, `ElectiveSemester`) so existing imports compile.

- [ ] **Step 4: Run the matcher test and typecheck**

Run: `node --test src/lib/semester-match.test.ts && pnpm typecheck`
Expected: 3 tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/api apps/frontend/src/hooks/use-semester-types.ts apps/frontend/src/lib/semester-match.ts apps/frontend/src/lib/semester-match.test.ts apps/frontend/src/features/import/types.ts apps/frontend/package.json
git commit -m "Add the semester catalog client, hook, and label matcher"
```

---

### Task 6: Convert Terms and Prospectus screens

**Files:**
- Modify: `apps/frontend/src/features/system-config/components/TermsPanel.tsx`
- Modify: `apps/frontend/src/features/prospectus/ProspectusPage.tsx`
- Modify: `apps/frontend/src/features/prospectus/components/ProspectusFormModal.tsx`
- Modify: `apps/frontend/src/features/prospectus/components/FillSlotModal.tsx`

**Interfaces:**
- Consumes: `useSemesterTypes()`, `matchSemesterType()`.

- [ ] **Step 1: Convert `TermsPanel`**

- Replace `inferSemesterFromName` with `matchSemesterType(name, types)`.
- Replace `defaultSemesterForTermName(name)` with `matchSemesterType(name, types)?.code ?? activeTypes[0]?.code ?? ''`.
- Replace the hard-coded semester `<option>` list with `activeTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)`.
- Replace the `nextSemester === 'summer' ? 'Summer' : ...` label with `shortLabelFor(term.semester)`.
- Keep the selected value visible when it is inactive: build options as `activeTypes` plus the current value if missing.

- [ ] **Step 2: Convert the Prospectus screens**

- `ProspectusPage.tsx`: remove the local `SEMESTER_OPTIONS` constant; build options from `activeTypes`; replace the label ternary at the old line 1683 with `shortLabelFor(...)`.
- `ProspectusFormModal.tsx`: remove the local options constant; use `activeTypes`; replace the two `'summer'` label ternaries with `shortLabelFor(...)`.
- `FillSlotModal.tsx`: replace the summer sort key with `sortOrderFor`; replace the summer `<option>` and label with catalog values.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: no errors.

Manual: open System Settings → Terms. The dropdown shows First/Second/Summer. Add a term named "Third Semester" after the catalog task lands; it should preselect the `3rd` type.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/system-config/components/TermsPanel.tsx apps/frontend/src/features/prospectus
git commit -m "Drive term and prospectus semester options from the catalog"
```

---

### Task 7: Convert Subjects and Plot Subject screens

**Files:**
- Modify: `apps/frontend/src/features/subjects/components/SubjectFormModal.tsx`
- Modify: `apps/frontend/src/features/subjects/components/SubjectFiltersPanel.tsx`
- Modify: `apps/frontend/src/features/subjects/SubjectsPage.tsx`
- Modify: `apps/frontend/src/features/plot-subject/PlotSubjectModal.tsx`

**Interfaces:**
- Consumes: `useSemesterTypes()`.

- [ ] **Step 1: Replace every hard-coded option and label**

- `SubjectFormModal.tsx`: replace the `summer` `<option>` with `activeTypes.map(...)`.
- `SubjectFiltersPanel.tsx`: replace the `summer` `<option>` with `activeTypes.map(...)`.
- `SubjectsPage.tsx`: replace the two `electiveSemester === 'summer' ? 'Summer' : ...` ternaries with `shortLabelFor(...)`.
- `PlotSubjectModal.tsx`: replace the `summer` `<option>` with `activeTypes.map(...)`.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: no errors, existing tests pass.

Manual: open Subjects, filter by elective semester; open Plot Subject and confirm the dropdown lists every active type.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/subjects apps/frontend/src/features/plot-subject
git commit -m "Drive subject semester options from the catalog"
```

---

### Task 8: Dean manager panel

**Files:**
- Create: `apps/frontend/src/components/ui/ConfirmDialog.tsx`
- Create: `apps/frontend/src/features/system-config/components/SemesterTypesPanel.tsx`
- Modify: `apps/frontend/src/features/system-config/SystemConfigPage.tsx` (render below `TermsPanel`)
- Modify: `apps/frontend/src/features/tutorial/tours.ts` (one step in the `system-settings` tour)

**Interfaces:**
- `ConfirmDialog` props: `open`, `title`, `description`, `confirmLabel`, `tone?: 'default' | 'danger'`, `busy?`, `onConfirm`, `onClose`.
- `SemesterTypesPanel` props: `isAdmin: boolean`.

- [ ] **Step 1: Build `ConfirmDialog`**

Use `Modal` from the same folder. Default focus goes to Cancel. The confirm button uses the danger classes when `tone === 'danger'`. Disable both buttons while `busy`.

- [ ] **Step 2: Build `SemesterTypesPanel`**

- Header and subtitle from the spec.
- Table columns: order with up/down buttons, short label, label, code in mono, usage string, active toggle, Edit, Delete.
- Usage string: `12 prospectus · 2 terms` (include PDF tables and electives when non-zero).
- Add/Edit modal fields: code (create only), label, short label, order.
- Inline errors below fields; the submit button stays enabled and reports on click.
- Delete opens `ConfirmDialog`. When usage is non-zero, the dialog explains the block and offers **Deactivate instead**, which calls `updateSemesterType(code, { isActive: false })`.
- Locked state: read the already-cached `['terms']` query and find `isActive`. While a term is active, show a banner naming that term with a link to the Terms panel, and disable Add, order arrows, active toggles, Edit, Delete, and the **Deactivate instead** fallback. Keep the table and all labels visible. The API still rejects writes, so a stale tab cannot bypass this.
- After every mutation, `qc.invalidateQueries({ queryKey: ['semester-types'] })` and show a success toast.
- Non-admin: render the table read-only, hide Add/Edit/Delete/toggle.

- [ ] **Step 3: Mount it**

In `SystemConfigPage.tsx`, inside the existing `data-tour="sysconfig-terms"` wrapper, render `<SemesterTypesPanel isAdmin={isAdmin} />` immediately after `<TermsPanel isAdmin={isAdmin} />`.

- [ ] **Step 4: Add the tour step**

In `tours.ts`, add a step targeting `[data-tour="sysconfig-terms"]` with body text explaining that the dean can add a third term, rename a period, or deactivate one without a code change — but only while no term is active.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck`
Expected: no errors.

Manual: add `3rd` / "Third Semester" / "3rd"; confirm it appears in the Terms dropdown. Try deleting a used type; confirm the readable block message. Rename `Summer` to `Midyear`; confirm the label updates on the Terms page and existing rows. With a term active, confirm the panel is read-only, the banner names the term, and a direct `POST /v1/semesters` returns 409; deactivate the term and confirm editing works again.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/ui/ConfirmDialog.tsx apps/frontend/src/features/system-config apps/frontend/src/features/tutorial/tours.ts
git commit -m "Add the dean semester type manager"
```

---

### Task 9: Convert the import pipeline

**Files:**
- Modify: `apps/frontend/src/features/import/constants.ts`
- Modify: `apps/frontend/src/features/import/utils/labels.ts`
- Modify: `apps/frontend/src/features/import/utils/rowDetection.ts`
- Modify: `apps/frontend/src/features/import/components/AddTableDialog.tsx`
- Modify: `apps/frontend/src/features/import/components/AutoDetectDialog.tsx`
- Modify: `apps/frontend/src/features/import/components/MajorMinorClassifier.tsx`
- Modify: `apps/frontend/src/features/import/components/ImportProspectusDialog.tsx`
- Modify: `apps/frontend/src/features/import/components/ExtractedTableModal.tsx`
- Modify: `apps/frontend/src/features/import/components/LiveExtractionPreview.tsx`
- Modify: `apps/frontend/src/features/import/components/TableRegion.tsx`
- Modify: `apps/frontend/src/features/import/components/TableRowsEditor.tsx`
- Modify: `apps/frontend/src/features/import/ProspectusPdfEditorPage.tsx`
- Modify: `apps/frontend/src/features/import/ProspectusPdfListPage.tsx`

**Interfaces:**
- Consumes: `useSemesterTypes()`, `matchSemesterType()`, `shortLabelFor()`.
- Produces: `maxTables(semesterCount: number): number`; `nextFreeCombination(existing, semesters)`.

- [ ] **Step 1: Make the constants dynamic**

In `constants.ts`:

- Remove `SEMESTERS`, `SEMESTER_ORDER`, and the `MAX_TABLES` constant.
- Add `export function maxTables(semesterCount: number) { return YEAR_LEVELS.length * Math.max(1, semesterCount); }`.
- Change `nextFreeCombination(existing, semesters: { code: string }[])` and return a `string` semester.

- [ ] **Step 2: Make labels accept catalog text**

In `labels.ts`, add an optional `semesterText?: string | null` to `yearTermLabel`, `tableLabel`, and `shortTableLabel`. Render `semesterText ?? semester`. This keeps every existing call compiling while allowing a display label.

- [ ] **Step 3: Broaden the heading heuristic**

In `rowDetection.ts`, extend `semesterWord` to
`first|second|third|fourth|1st|2nd|3rd|4th|summer|midyear|mid year|trimester|quarter`.
This only decides whether a line looks like a heading; the catalog matcher decides the actual type.

- [ ] **Step 4: Convert the components**

- `AddTableDialog.tsx`: replace `SEMESTERS` with `activeTypes`; `maxTablesReached` uses `maxTables(activeTypes.length)`; the year grid and semester buttons map `activeTypes`; the "all slots mapped" copy uses the dynamic counts.
- `AutoDetectDialog.tsx`: pass `activeTypes.map((t) => t.code)` into `firstFreePair` and `seedDrafts`; replace `MAX_TABLES` with `maxTables(activeTypes.length)`; map `activeTypes` in the semester select; when a proposal's semester does not match the catalog, set it to `null` and show `Not recognized` until the user picks one.
- `MajorMinorClassifier.tsx`: delete `TERM_ORDER`; sort groups by `sortOrderFor(row.semester)`; pass `shortLabelFor(row.semester)` into `yearTermLabel`.
- `ImportProspectusDialog.tsx`: pass `shortLabelFor(...)` into `tableLabel`/`yearTermLabel`; add a `missingSemesterTables` check that blocks Import while any regular table has a semester not present in the catalog, with an inline message naming the table.
- `ExtractedTableModal.tsx`, `LiveExtractionPreview.tsx`, `TableRegion.tsx`, `TableRowsEditor.tsx`: add the hook and pass `shortLabelFor(table.semester)` into `tableLabel`.
- `ProspectusPdfEditorPage.tsx`: replace `SEMESTER_ORDER` with `sortOrderFor`; replace `MAX_TABLES` with `maxTables(activeTypes.length)`; pass labels into the two label helpers.
- `ProspectusPdfListPage.tsx`: replace `MAX_TABLES` with `maxTables(activeTypes.length)`.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: no errors; the classifier tests still pass.

Manual: import a PDF table headed "THIRD YEAR - 3RD SEMESTER". The Add Table dialog offers `3rd`; the editor shows "Third Semester" (or the short label); an unrecognized value blocks Import with a readable message.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/import
git commit -m "Drive the prospectus import semester options from the catalog"
```

---

### Task 10: Derive the temporary elective code token

**Files:**
- Create: `apps/backend/src/modules/prospectus-pdfs/semester-code-token.ts`
- Create: `apps/backend/test/semester-code-token.spec.ts`
- Modify: `apps/backend/src/modules/prospectus-pdfs/prospectus-pdfs.service.ts` (`makeTemporaryElectiveCode`)

**Interfaces:**
- Produces: `semesterCodeToken(code: string | null | undefined): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { semesterCodeToken } from '../src/modules/prospectus-pdfs/semester-code-token';

describe('semesterCodeToken', () => {
  it.each([
    ['1st', '1'],
    ['2nd', '2'],
    ['summer', 'S'],
    ['3rd', '3'],
    ['intersession', 'I'],
    [null, 'X'],
    ['', 'X'],
  ])('maps %s to %s', (code, expected) => {
    expect(semesterCodeToken(code)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:ci -- --runInBand test/semester-code-token.spec.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement it and use it**

```ts
export function semesterCodeToken(code: string | null | undefined): string {
  const first = code?.trim().charAt(0);
  if (!first) return 'X';
  return /[0-9]/.test(first) ? first : first.toUpperCase();
}
```

In `makeTemporaryElectiveCode`, replace the three `table.semester === ...` branches with `semesterCodeToken(params.table.semester)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:ci -- --runInBand test/semester-code-token.spec.ts test/prospectus-pdfs.service.spec.ts`
Expected: all pass, including the existing deterministic-code assertions.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/prospectus-pdfs/semester-code-token.ts apps/backend/src/modules/prospectus-pdfs/prospectus-pdfs.service.ts apps/backend/test/semester-code-token.spec.ts
git commit -m "Derive temporary elective codes from catalog semester codes"
```

---

### Task 11: Full verification

**Files:** none expected; fix anything the checks surface.

- [ ] **Step 1: Backend**

Run from `apps/backend`:

```bash
pnpm typecheck
pnpm typecheck:test
pnpm test:ci
```

Expected: no type errors, all suites pass.

- [ ] **Step 2: Frontend**

Run from `apps/frontend`:

```bash
pnpm typecheck
pnpm test
```

Expected: no type errors, all listed tests pass.

- [ ] **Step 3: Migration**

Run from the repo root: `supabase db reset`
Expected: clean apply, three seeded types.

- [ ] **Step 4: Manual smoke**

- Add `3rd` / "Third Semester" / "3rd" in System Settings.
- Create a term "Third Semester 2026-2027" with the new type; activate it.
- Add a prospectus row with semester `3rd`.
- Confirm Subjects and Plot Subject list `3rd`.
- Import a PDF table headed "THIRD YEAR - 3RD SEMESTER".
- Deactivate `3rd`; confirm existing rows still render and new forms exclude it.
- Rename `Summer` to `Midyear`; confirm existing rows show the new label.
- Activate a term; confirm the dean panel goes read-only with a banner naming the term and a direct catalog write returns 409. Deactivate it and confirm edits work again.
- Try deleting `3rd`; confirm the readable block message.
- Publish `2026-2027-3rd` through the IDP publisher test or a local call.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "Fix issues found while verifying dynamic semester types"
```

Only commit when Step 4 surfaced a change; otherwise leave the tree clean.
