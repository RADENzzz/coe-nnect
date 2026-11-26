# Dynamic Semester Types and UI Guardrails Design

## Intent and why

The college runs more than the two regular semesters plus summer. Terms and
prospectus rows currently hard-code `1st`, `2nd`, and `summer` in a Postgres
enum, in backend DTOs, and in about a dozen frontend files. A dean cannot add a
third semester or rename one, and a tri-semester curriculum cannot be entered
without abusing an existing value.

Separately, users lose their place in the system: long forms accept invalid
input until submit, some destructive actions are one click away, and the 25
existing guided tours are only discoverable from the Help page.

This design covers both: a dean-managed semester catalog, and a guardrails pass
that adds confirmations, inline validation, and page-level help.

## Decisions

1. **A1 — Dean-managed catalog.** A `semester_type` table with stable codes,
   editable labels, sort order, and an active flag. Existing enum columns
   become `text` with foreign keys to the catalog.
2. **Label-only rename.** Codes are immutable after creation. Renaming a label
   changes display everywhere without rewriting prospectus rows. Deleting a
   type is blocked while it is referenced; deactivate instead.
3. **B1 — Guardrails plus tours.** Confirmation audit, inline validation on
   long forms, per-page first-visit micro-tours, and a persistent page-level
   help button.
4. **One global list.** The catalog is shared by every school year. Switching a
   year from two semesters to three is just creating a term with the new type;
   there is no per-year or per-program scheme table.
5. **Vocabulary.** "Semester type" and "term type" mean the same thing here.
   The UI keeps the existing "Semester" wording for consistency with the Terms
   page, with a subtitle that says it covers trimesters, quarters, and summer.
   The database columns keep their `semester` names.
6. **Locked while a term is active.** The catalog is frozen from the moment a
   term is activated until that term is deactivated. Every write endpoint
   returns 409 naming the blocking term. There is no override. This keeps
   labels from shifting under an in-progress term and keeps historical
   prospectuses stable.

## Goals

- A dean can add, rename, reorder, deactivate, and (when unused) delete semester
  types, including `3rd` or any custom type — between terms, while no term is
  active.
- Every term, prospectus row, elective, and import table validates against the
  catalog.
- Existing `1st`, `2nd`, and `summer` data keeps working with no rewrite.
- Every destructive action names what it will destroy and requires an explicit
  confirmation.
- Long forms report every missing or invalid field in one place before submit.
- Each major page offers its tour in place, and first-time users are offered a
  short tour once per page.

## Non-goals

- Per-school-year semester availability. The catalog is global.
- Editing or deleting a code after creation.
- Bulk rewriting historical prospectus rows.
- Localization of labels.
- Changing the IDP sync payload shape beyond accepting new term codes.

## Constraints

- `term.semester` stays nullable for legacy rows; creation still requires a
  value.
- `prospectus.semester` stays `NOT NULL`.
- The unique key `(program_id, subject_id, year_level, semester)` stays.
- Existing values must not be silently coerced. The migration aborts with a
  clear message if it finds a value outside the seeded catalog.
- No conventional-commit prefixes in commit messages.

## Part 1 — Semester catalog

### Data model

```sql
CREATE TABLE public.semester_type (
  code         text PRIMARY KEY,
  label        text NOT NULL,
  short_label  text NOT NULL,
  sort_order   smallint NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT semester_type_code_format
    CHECK (code ~ '^[a-z0-9][a-z0-9_-]{0,19}$'),
  CONSTRAINT semester_type_label_not_blank
    CHECK (length(btrim(label)) > 0),
  CONSTRAINT semester_type_short_label_not_blank
    CHECK (length(btrim(short_label)) > 0)
);
```

Seed:

| code | label | short_label | sort_order |
| --- | --- | --- | --- |
| `1st` | First Semester | 1st | 10 |
| `2nd` | Second Semester | 2nd | 20 |
| `summer` | Summer | Summer | 30 |

`code` is the stable key stored in every referencing table. `label` is the long
display name. `short_label` is used in dense UI (badges, table cells, import
chips). `sort_order` drives every dropdown and the "which semester comes next"
logic.

Foreign keys:

- `term.semester` → `semester_type(code)` `ON UPDATE CASCADE`
- `prospectus.semester` → `semester_type(code)` `ON UPDATE CASCADE`
- `prospectus_pdf_table.semester` → `semester_type(code)` `ON UPDATE CASCADE`
- `subject.elective_semester` → `semester_type(code)` `ON UPDATE CASCADE`

The default `NO ACTION` delete rule is what blocks deleting a type in use.

RLS mirrors `term`: `ENABLE ROW LEVEL SECURITY` plus
`CREATE POLICY read_authenticated ON public.semester_type FOR SELECT TO authenticated USING (true);`.
Writes go through the API with the service role and `RolesGuard`, not through
the anon client.

### Migration sequence

`supabase/migrations/<timestamp>_dynamic_semester_types.sql`

1. Pre-flight guard: raise an exception if any of `prospectus_pdf_table.semester`
   or `subject.elective_semester` holds a value outside `1st`, `2nd`, `summer`.
2. Convert `term.semester` and `prospectus.semester` to `text`
   (`USING semester::text`).
3. Drop the `public.semester_type` enum.
4. Create the `semester_type` table with the constraints above.
5. Seed the three existing types.
6. Drop `prospectus_pdf_table_semester_check` and
   `subject_elective_semester_check`; their replacement is the foreign key.
7. Add the four foreign keys.
8. Add `updated_at` trigger or set it in the service. The service owns it;
   no trigger.

Rollback: recreate the enum from the current catalog rows that are referenced,
convert columns back with a `CASE` mapping, and drop the table. Document this in
the migration header; it is only safe while the catalog contains the original
three codes.

### Backend API

New module `apps/backend/src/modules/semesters/`, mirroring `terms/`.

| Method | Path | Roles | Behavior |
| --- | --- | --- | --- |
| GET | `/v1/semesters` | any signed-in | All types, sorted by `sort_order`, with usage counts |
| POST | `/v1/semesters` | dean, secretary | Create; code normalized to lowercase |
| PATCH | `/v1/semesters/reorder` | dean, secretary | Body `{ codes: string[] }`; rewrites `sort_order` as 10, 20, 30… |
| PATCH | `/v1/semesters/:code` | dean, secretary | Update `label`, `shortLabel`, `sortOrder`, `isActive`; code immutable |
| DELETE | `/v1/semesters/:code` | dean, secretary | Delete only when unused |

Catalog lock: every mutating endpoint (`POST`, both `PATCH`es, `DELETE`) first
calls `assertCatalogEditable()`. When any term has `is_active = true` it throws
`ConflictException` (409):

> Semester types are locked while "First Semester 2026-2027" is active.
> Deactivate it in System Settings → Academic Calendar first.

`GET` is never blocked, and `assertUsable` still runs during an active term so
ordinary prospectus and subject edits keep working.

`GET` response item:

```ts
{
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
```

Usage counts come from four grouped queries in one service method, keyed by
code. The manager UI needs them to explain why delete is blocked.

Validation rules:

- Code: lowercase slug, 1–20 chars, starts alphanumeric, `[a-z0-9_-]`.
  Normalize input by trimming and lowercasing. Reject duplicates with
  `Semester type "3rd" already exists.`
- Label and short label: trimmed, non-empty, max 60 chars.
- `sortOrder`: integer 0–9999; when omitted on create, append after the current
  maximum.
- Deactivate: allowed even when in use. Existing rows keep rendering.
- Delete: if any of the four counts is non-zero, return 400 with
  `Semester type "3rd" is used by 12 prospectus rows and 2 terms. Deactivate it instead.`
- Reorder: every code must exist; the array must contain every code exactly
  once.

### Write-path validation

Each service that accepts a semester gets `SemestersService` injected and calls
`assertUsable(code)`:

- `TermsService.create` — required, must exist and be active.
- `ProspectusService.create` and bulk create — required, exist and active.
- `SubjectsService.create/update` — `electiveSemester` optional; when present,
  must exist and be active.
- `ProspectusPdfsService` table create/update — optional; when present, must
  exist and be active.

`assertUsable` throws `BadRequestException` with a message naming the code and
whether it is missing or inactive. The foreign key remains the last line of
defense.

`ProspectusPdfsService.makeTemporaryElectiveCode` maps `1st` → `1`, `2nd` → `2`,
`summer` → `S`, and anything else → `X` to build `ELEC-Y<year>S<sem>-<hash>`.
Replace the three literals with a derived token: a leading digit is used as-is,
otherwise the first letter uppercased (`summer` → `S`, `3rd` → `3`,
`intersession` → `I`). Existing codes keep their exact characters, so re-import
stays idempotent; the hash already disambiguates two codes that derive the same
letter.

Sort-order comparisons replace the remaining "summer is last" assumptions in
the UI. There is no backend ordering branch.

### Frontend catalog

New `apps/frontend/src/api/semesters.api.ts` plus a `useSemesterTypes()` query
hook.

- Cache key `['semester-types']`; `staleTime` 5 minutes.
- `labelFor(code)` falls back to the raw code, so an unknown legacy value still
  renders instead of disappearing.
- Dropdowns show active types only, plus the currently selected type when it is
  inactive (so editing an old row does not silently change its value).
- `useSemesterTypes()` exposes `options`, `labelFor`, `shortLabelFor`, and
  `nextAfter(code)`.

Files to convert from the hard-coded union to `string` plus catalog lookups:

| Area | Files |
| --- | --- |
| API types | `terms.api.ts`, `prospectus.api.ts`, `subjects.api.ts`, `schedule.api.ts`, `prospectus-pdfs.api.ts` |
| Terms | `TermsPanel.tsx` (dropdown, label, `inferSemesterFromName`) |
| Prospectus | `ProspectusPage.tsx`, `ProspectusFormModal.tsx`, `FillSlotModal.tsx` |
| Subjects | `SubjectFormModal.tsx`, `SubjectFiltersPanel.tsx`, `SubjectsPage.tsx` |
| Plot subject | `PlotSubjectModal.tsx` |
| Import | `types.ts`, `constants.ts`, `utils/labels.ts`, `utils/rowDetection.ts`, `components/classifier-logic.ts`, `components/MajorMinorClassifier.tsx`, `components/AddTableDialog.tsx`, `components/AutoDetectDialog.tsx`, `components/ImportProspectusDialog.tsx` |

The English ordinal alias map (`first`, `second`, `third`, `fourth`, `midyear`,
`mid year`) stays in one shared helper, `matchSemesterType(text, types)`, used by
the term-name inference, the import classifier, and PDF row detection. Matching
order: code, short label, label, alias, case-insensitive.

### Dean UI

New `SemesterTypesPanel` rendered directly below `TermsPanel` in
`SystemConfigPage`, inside the existing `data-tour="sysconfig-terms"` area.
Visible read-only to non-deans, like Terms.

Panel contents:

- Header: "Semester types", subtitle "The periods a school year is divided
  into — semesters, trimesters, quarters, or summer. Order here controls every
  dropdown and the import classifier."
- Table columns: drag/up-down order, short label, label, code (mono, read-only),
  usage ("12 prospectus · 2 terms"), active toggle, edit, delete.
- "Add semester type" button opens a modal with code, label, short label, and
  order. Code auto-fills from the label until the user edits it, then shows
  "Code cannot be changed later."
- Inline errors under each field; the submit button stays enabled and reports
  problems on click rather than sitting disabled with no explanation.
- Delete opens a standard confirmation. When usage counts are non-zero the
  confirm explains the block and offers **Deactivate instead**.
- Deactivating a type used by the active term shows a warning that existing
  records keep the label but new records cannot select it.

While a term is active, the panel renders read-only: the Add button, order
arrows, active toggles, Edit, and Delete are disabled, and a banner names the
blocking term with a link to the Terms panel. The API enforces the same rule,
so a stale tab cannot bypass it.

### PDF import behavior

- Detection order per table: exact code, short label, label, alias, then
  case-insensitive contains.
- Recognized values select the catalog entry.
- Unrecognized values show "Not recognized: <text>" and block the confirm step
  until the dean picks a type or adds one inline. The inline add reuses the
  create endpoint and refreshes the catalog.
- Regular tables require a semester; elective tables may stay `null` (existing
  rule).
- Table ordering and "next semester" suggestions use `sort_order`, never the
  literal `summer`.

### IDP term codes

Five backend spots hard-code `^\d{4}-\d{4}-(1st|2nd|summer)$`:
`publish-schedule.dto.ts`, `sync-faculty.dto.ts`,
`idp-change-request.service.ts`, `idp-schedule-publisher.service.ts`, and
`idp-sync.service.ts`.

Relax to `^\d{4}-\d{4}-[a-z0-9][a-z0-9_-]{0,19}$`, which keeps every existing
code valid and accepts `3rd`. Update the error text to
`term_code must be YYYY-YYYY-<semester code>`.

## Part 2 — Guardrails and help (B1)

### Confirmation policy

Three levels, implemented with one shared `ConfirmDialog` component:

- **None** — reversible, non-destructive actions (activate, filter, export).
- **Standard** — names the object and the consequence, primary button in the
  danger tone. Used for delete of a single row, discard draft, unfinalize.
- **Typed** — requires typing the object's name or `DELETE`. Used for bulk
  delete, deleting an academic term, deleting a program, and deactivating the
  active term.

Audit and apply to:

| Surface | Actions |
| --- | --- |
| Terms | delete term, deactivate active term |
| Programs | delete program |
| Prospectus | bulk remove, delete slot, deactivate mapping |
| Subjects | delete subject, bulk delete, deactivate with active mappings |
| Sections | delete section, bulk delete |
| Faculty | delete or deactivate, role change |
| Rooms | delete room |
| Admin users | deactivate, delete, role change |
| Import | discard draft, delete PDF, overwrite existing tables |
| Schedule | unfinalize, discard auto-generate, clear drafts |
| Settings | reset appearance |

Some of these already confirm; the implementation plan starts with a per-action
audit so only gaps are added. No action loses an existing confirmation.

Permission guardrail: write controls are hidden or disabled with an explanatory
tooltip for read-only roles, instead of failing at submit.

### Form validation

New `FormErrorSummary` component, rendered at the top of:

- `ProspectusFormModal`
- `ImportProspectusDialog` confirm step
- `SubjectFormModal`
- `TermsPanel` create form
- `RoomFormModal`
- Section form

Behavior:

- Validate on blur and on submit; clear a field's error when it becomes valid.
- On submit, scroll to the summary and list every problem as a link to the
  field.
- Keep the submit button enabled unless a request is in flight. A disabled
  button with no explanation is the failure mode this pass removes.
- Destructive forms show the consequence inline before the confirm button.

### Page help

- Add a `HelpButton` to the app header, left of notifications. It is visible on
  every signed-in page.
- Clicking opens a small popover:
  - **Take a tour of this page** — resolves the current path to a tour with the
    existing `tourMatchesPath` helper; disabled with "No tour for this page yet"
    when none matches.
  - **Open the Help page** — links to `/help`.
  - **What's new** — links to the Help page's version section.
- First-visit offer: once per browser, per tour id, show a small toast after the
  page settles: "New here? Take a 30-second tour" with Start and Dismiss. The
  flag is `coe-nnect:tour-offered:<tourId>` in localStorage. Only tours with
  `paths` and at most five steps are offered. The existing welcome modal for
  dean and department head stays as-is; the toast does not fire on the same page
  while the welcome modal is open.
- The Help page gains a "Page tours" section listing tours by route, reusing
  `TOUR_META` categories.

### Reused systems

- `features/tutorial/TutorialProvider.tsx` and `TutorialLauncher.tsx` for tour
  execution and spotlighting.
- `features/tutorial/tours.ts` for tour definitions and path matching.
- `features/help/HelpPage.tsx` for FAQ, troubleshooting, and walkthroughs.
- `components/ui/Modal.tsx` for the confirm and add dialogs.
- `lib/body-scroll-lock.ts` for every new overlay.

## Risks and edge cases

- **Migration ordering.** The enum must be dropped before a table with the same
  name is created. The migration does this in one transaction.
- **Inactive type on an existing row.** Dropdowns must include the current value
  even when inactive; otherwise saving an unrelated field would silently change
  the semester.
- **Import unknowns.** Blocking the confirm step is intentional, but the inline
  add path must work without leaving the import wizard.
- **IDP compatibility.** Relaxing the term-code regex is backward compatible;
  the sync payload shape does not change.
- **Tour noise.** The first-visit toast is capped to one per tour per browser and
  suppressed for tours longer than five steps.
- **Label collisions.** Two types may share a label; codes stay unique and the
  manager shows the code in every row. Import matching uses the first match by
  sort order and warns when ambiguous.
- **Chicken and egg.** A third semester type cannot be added while the second
  semester is active. The intended flow is: deactivate the current term, add
  the type, then create and activate the next term. The panel's locked banner
  states this explicitly so the dean is not left guessing.

## Test plan

Backend:

- `semesters.service.spec.ts`: create, duplicate code, invalid code, label-only
  update, reorder, deactivate, delete blocked by usage, delete when unused, and
  the catalog lock (all four mutations rejected with 409 while a term is active,
  accepted again after deactivation).
- `terms.service.spec.ts`: create rejects an unknown code and an inactive code;
  create accepts a newly added `3rd`.
- `prospectus.service.spec.ts`: create rejects an unknown code.
- `subjects.service.spec.ts`: `electiveSemester` validation.
- IDP publisher: accepts `2026-2027-3rd` and still rejects malformed codes.
- Migration smoke test on a copy of the demo database.

Frontend:

- `pnpm typecheck` after removing the union types.
- Manual: add `3rd`, create a term with it, add a prospectus row, import a PDF
  table labeled "Third Semester", deactivate the type, confirm existing rows
  still render and new forms exclude it.
- Manual: with a term active, confirm the panel is read-only, the banner names
  the term, and a direct `POST /v1/semesters` returns 409. Deactivate the term
  and confirm editing works again.
- Manual: every confirmation in the audit table opens, names the object, and
  cancel is the default focus.
- Manual: prospectus detail → Edit → close modal restores page scrolling (the
  scroll-lock fix already landed; keep it as a regression check).

## Rollout

1. Migration and seed.
2. Backend module and write-path validation.
3. Frontend catalog hook and type conversion, keeping the UI visually unchanged.
4. Dean manager panel.
5. Import and IDP updates.
6. Guardrails and help.
7. Demo seed update: add `3rd` only if a demo term uses it; otherwise leave the
   three seeded types untouched.

Each step is independently shippable. Steps 1–5 are one branch; step 6 can
follow once the semester work is verified.
