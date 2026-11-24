# Optional Term Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow term creation with neither, either, or both academic dates while preserving valid date ranges.

**Architecture:** Update the term contract from required strings to optional strings and from required database columns to nullable columns. Keep relationship validation in the service and DTO/UI, and make date formatting/sorting null-safe.

**Tech Stack:** NestJS, TypeORM, class-validator, React, TanStack Query, PostgreSQL/Supabase, Jest, Vite.

**Spec:** `docs/superpowers/specs/2026-11-24-optional-term-dates-design.md`

## Global Constraints

- `startDate` and `endDate` may be omitted independently.
- Supplied dates must use `YYYY-MM-DD`.
- If both dates are supplied, `endDate` must be after `startDate`.
- Omitted dates are stored as `NULL`.
- Missing dates display as "Dates not set."
- The term name, school year, and semester remain required.

## Review Focus

- Missing both dates: the creation form and API accept `{ startDate: '', endDate: '' }` or omitted properties and save `NULL` values.
- Missing one date: creation succeeds independently for start-only and end-only inputs.
- Invalid range: when both values exist and end is equal to or earlier than start, creation is rejected.
- Invalid formats: a supplied date outside `YYYY-MM-DD` is rejected.
- Existing/sorting behavior: terms with missing dates remain visible and do not throw while sorting or formatting.
- Database constraint: nullable columns accept `NULL`, while a supplied pair must still satisfy the range check.

---

### Task 1: Add backend and migration coverage

**Files:**
- Create: `apps/backend/test/terms.service.spec.ts`
- Modify: `apps/backend/src/modules/terms/dto/create-term.dto.ts`
- Modify: `apps/backend/src/modules/terms/entities/term.entity.ts`
- Modify: `apps/backend/src/modules/terms/terms.service.ts`
- Create: `supabase/migrations/20261124000000_optional_term_dates.sql`

**Interfaces:**
- Consumes: `CreateTermDto` with `startDate?: string` and `endDate?: string`.
- Produces: `Term.startDate: string | null` and `Term.endDate: string | null`.
- Produces: repository creation values using `dto.startDate ?? null` and `dto.endDate ?? null`.

- [ ] **Step 1: Add failing service tests for omitted, partial, and invalid date ranges**

Create `apps/backend/test/terms.service.spec.ts`. Mock a term repository and data source, and construct `TermsService` with minimal notification/recipient collaborators.

Test these assertions:
- Creating with both properties omitted saves `startDate: null` and `endDate: null`.
- Creating with only `startDate: '2026-08-01'` saves `endDate: null`.
- Creating with only `endDate: '2026-12-15'` saves `startDate: null`.
- Creating with end equal to or earlier than start throws `BadRequestException`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --filter @coe-nnect/backend test:ci -- --runInBand test/terms.service.spec.ts`
Expected: failures show that the service currently dereferences or rejects optional dates.

- [ ] **Step 3: Update the create DTO**

In `apps/backend/src/modules/terms/dto/create-term.dto.ts`:
- Add `@IsOptional()` before `@Matches(...)` on `startDate`.
- Add `@IsOptional()` before `@Matches(...)` on `endDate`.
- Change both properties to `startDate?: string` and `endDate?: string`.

- [ ] **Step 4: Update the Term entity**

In `apps/backend/src/modules/terms/entities/term.entity.ts`:
- Change `startDate` to `string | null`.
- Mark the column `nullable: true`.
- Change `endDate` to `string | null`.
- Mark the column `nullable: true`.

- [ ] **Step 5: Update creation validation and persistence**

In `apps/backend/src/modules/terms/terms.service.ts`:
- Only compare dates when both `dto.startDate` and `dto.endDate` are present.
- Persist `dto.startDate ?? null` and `dto.endDate ?? null`.

- [ ] **Step 6: Add a nullable-date migration**

Create `supabase/migrations/20261124000000_optional_term_dates.sql`:
- `ALTER TABLE public.term ALTER COLUMN start_date DROP NOT NULL;`
- `ALTER TABLE public.term ALTER COLUMN end_date DROP NOT NULL;`
- Recreate `term_check` if needed as `CHECK (end_date IS NULL OR start_date IS NULL OR end_date > start_date)` after dropping the existing constraint.

- [ ] **Step 7: Run backend focused tests and typecheck**

Run: `pnpm --filter @coe-nnect/backend test:ci -- --runInBand test/terms.service.spec.ts`
Expected: PASS.

Run: `pnpm --filter @coe-nnect/backend typecheck`
Expected: PASS.

### Task 2: Update frontend types and create form

**Files:**
- Modify: `apps/frontend/src/api/terms.api.ts`
- Modify: `apps/frontend/src/features/system-config/components/TermsPanel.tsx`

**Interfaces:**
- Consumes: `Term.startDate: string | null`, `Term.endDate: string | null`, and `CreateTermInput` optional date strings.
- Produces: null-safe date formatting and sorting; a submission containing empty date values or omitted properties.

- [ ] **Step 1: Update frontend term types**

In `apps/frontend/src/api/terms.api.ts`:
- Change `Term.startDate` and `Term.endDate` to `string | null`.
- Change `CreateTermInput.startDate` and `CreateTermInput.endDate` to `string | null` or optional `?: string`.

- [ ] **Step 2: Make date rendering null-safe**

In `apps/frontend/src/features/system-config/components/TermsPanel.tsx`:
- Change `fmtDate(iso: string)` to `fmtDate(iso: string | null | undefined)`.
- Return `"Dates not set"` for missing values.
- Render a missing pair with `"Dates not set"` rather than a date range; for one known date, render `"From ..."` or `"Until ..."` as appropriate.
- Sort terms in `openForm` and the term list safely when `startDate` is null.

- [ ] **Step 3: Remove required-date validation and optionalize submission**

In `handleSubmit`:
- Remove the “Choose both” validation.
- Keep range validation only when both form date values are present.
- Submit `startDate: form.startDate || null` and `endDate: form.endDate || null`.

In the date labels and inputs:
- Remove the `*` from the Start Date and End Date labels.
- Leave the date inputs empty-capable.

- [ ] **Step 4: Run frontend typecheck and build**

Run: `pnpm --filter @coe-nnect/frontend typecheck`
Expected: PASS.

Run: `pnpm --filter @coe-nnect/frontend build`
Expected: PASS.
