# Elective subjects

Elective subjects are catalog entries that may not have a fixed course code yet.
They can appear in the prospectus more than once per year and semester, and they
are plotted before regular subjects during auto-generation.

## Catalog model

An elective is a normal `subject` row with `is_elective = true`. Two unit modes
are supported:

| `units_mode` | Meaning | Stored units |
| --- | --- | --- |
| `lec_lab` | The prospectus gives a lecture/lab breakdown. | `lecture_units + lab_units = total_units` |
| `total_only` | The prospectus gives only a total. | `lecture_units = 0`, `lab_units = 0`, `total_units > 0` |

`total_only` is valid only for electives. The database enforces this with a
check constraint, and `SubjectsService` validates it before every create or
update.

Electives appear in the **Elective** tab on the Subjects page
(`/subjects?kind=elective`). The tab strip also includes **All**, **Regular**, and
**Minor**. Elective rows show an **Elective** badge and, for total-only units, a
`3 units (total only)` label.

### Empty elective fields

A code-less elective imported from a prospectus table is not a catalog subject
yet; it is an **empty elective field** (a placeholder `subject` row with
`is_placeholder = true`). Placeholders are hidden from the Subjects page (tabs,
stats, filters, and department counts), from the import elective picker, from the
prospectus subject picker, from the Fill Slot picker, and from faculty
qualifications. They remain visible in the Prospectus as rows to fill.

A term can need more than one offering of the same elective field (for example
Software Development and Robotics). Each copy is a distinct placeholder subject
with a deterministic `ELEC-…` code: the first copy has no suffix, later copies
use `-C2`, `-C3`, and so on. Import review sets the copy count, and the
Prospectus row action **Duplicate field** adds another copy later.

### Categories, year levels, and terms

Elective metadata lives on the `subject` row itself; there is no separate
managed category table. Three optional columns describe where an elective
belongs:

| Column | Meaning |
| --- | --- |
| `elective_category` | Free-text group such as `GEC` or `Major`. Blank is stored as `NULL` (uncategorized). |
| `elective_year_level` | Preferred year level from 1 to 6. `NULL` means any year. |
| `elective_semester` | `1st`, `2nd`, or `summer`. `NULL` means any term. |

The service trims categories and clears all three values whenever
`is_elective` is turned off. The database enforces the same rule with
`subject_elective_metadata_only_check`.

The Subjects page exposes category, year-level, and term filters under
**Elective filters**, shows removable filter pills, and renders an **Elective
Meta** column with category/year/term badges. The filter panel derives its
category options from the values that actually exist in the catalog, including
an **Uncategorized** option.

## Prospectus slot filling

Code-less elective rows in a prospectus are placeholder subjects, shown as
**Empty field** rows. **Fill Slot** accepts either:

- an **existing elective** (`subjectId`), or
- a **typed code** (`newSubjectCode`, with an optional title). The backend reuses
  an elective with that code or creates a new one from the slot's title and units
  (`is_elective = true`, `is_placeholder = false`), so entered codes are saved as
  elective subjects automatically.

Regular subjects are rejected with `Slots can only be filled with elective
subjects.`, placeholder codes (`ELEC-…`/`SLOT-…`) are rejected as typed codes, and
the request must contain exactly one of the two options.

The existing-elective modal filters the catalog by category, year level, and term,
pre-filters to the slot's year/term, and groups options by category. Electives
with a `NULL` year or term are eligible for every year/term. Filling a slot
snapshots the placeholder label onto `prospectus.slot_label` and deactivates the
old placeholder when nothing else references it.

**Duplicate field** adds another hidden placeholder plus a second prospectus row
for the same program/year/term, with the next `-C2`, `-C3`, … code. Deleting the
last prospectus row that references a placeholder deletes the hidden subject
(or deactivates it if historical data would break a foreign key).

The **Add Subject to Prospectus** picker also separates electives from regular
subjects, groups electives by category, shows each elective's year/term
metadata, and never offers placeholder subjects.


## Prospectus PDF tables

A prospectus PDF table is either `regular` or `elective`
(`prospectus_pdf_table.table_kind`). Regular tables remain unique per year and
semester. Elective tables may repeat for the same year and semester, so a
program can list several elective groups independently.

Elective tables use the same columns as regular tables: code, title,
prerequisite, lecture, lab, and total. A missing code is allowed.

## Import flow

When an elective table is imported, each row can be resolved in one of three
ways:

1. **Typed code** — the reviewer types the real course code. A new elective
   subject is created with that code and `is_placeholder = false`.
2. **Existing elective** — the reviewer picks an elective from the catalog. The
   row is linked to that `subject_id`; regular subjects are rejected with a
   `not_elective` skip reason.
3. **Empty elective field** — the row has no code and no existing elective. The
   backend creates a deterministic placeholder such as `ELEC-Y1S1-A1B2C3`, sets
   `is_placeholder = true`, and reports it in `temporaryCodes` and `warnings`.
   The row is an empty field to fill from the Prospectus later, not a catalog
   subject.

Temporary codes are deterministic for the same table, row, and title, so
re-importing the same PDF does not create duplicates. Legacy `slot` rows keep
the older `SLOT-…` format. A code-less row also accepts a `copies` value
(1–20): the backend creates that many distinct placeholders and prospectus rows,
suffixing copies after the first with `-C2`, `-C3`, and so on. Copies are ignored
when the row names a real code.

New elective subjects inherit `elective_year_level` and `elective_semester`
from the PDF table they came from. The import review also accepts an optional
`elective_category`; the value is trimmed and stored on each newly created
elective so the catalog can group and filter it later.

### Major/minor classification during import

Regular-subject rows can be classified in the import review so the department
head no longer edits each subject on the Subjects page to tick **Minor**:

- **Drag and drop** — press anywhere on a regular row (outside its inputs,
  selects, and buttons) and drop it on the **Major** or **Minor** box.
- **Classifier modal** — **Open classifier** lists the regular rows with
  Major/Minor toggles, plus **All major** / **All minor** bulk actions. Tabs at
  the top switch between **All terms** and each year/term in the import.
- **Badge toggle** — click the Major/Minor badge beside the row's code.

The chosen `is_minor` flag is sent with each regular-subject row; re-importing a
subject updates the flag. Elective rows are classified when they are filled.

If no elective subjects exist in the catalog yet, the import dialog and the
backend both warn before the import starts. Rows with an empty elective field
are still imported so the prospectus structure is not lost.

## Scheduling behavior

- Electives are sorted before regular subjects in the prospectus view.
- Multiple distinct electives may be plotted in one semester. The prospectus
  uniqueness key still prevents the same subject from being placed twice in the
  same program/year/semester.
- Auto-generate excludes electives that are unresolved (placeholder or an
  `ELEC-`/`SLOT-` code) and returns the exclusions in `electiveWarnings`.
- Plot-subject and plot-multi reject unresolved electives with a clear error.
  The Timetable page hides them from the plot modal and shows a banner linking
  to the Prospectus page (**Fill fields**).
- Filling the field from the Prospectus page (choose an existing elective or type
  a code) replaces the placeholder, after which the elective can be plotted and
  auto-generated.

## Schema

Migration `supabase/migrations/20261112000100_add_elective_subjects.sql` adds:

- `subject.is_elective` (default `false`, not null)
- `subject.units_mode` (default `lec_lab`, checked to `lec_lab` or `total_only`)
- `prospectus_pdf_table.table_kind` (default `regular`, checked to `regular` or
  `elective`)
- A partial unique index that keeps regular tables unique per PDF/year/semester
  while allowing repeated elective tables
- A backfill that marks existing `SLOT-`/`ELEC-` placeholder subjects as
  electives

Migration `supabase/migrations/20261114000100_add_elective_categories.sql` adds:

- `subject.elective_category` (free text)
- `subject.elective_year_level` (`smallint`, checked to 1–6 or `NULL`)
- `subject.elective_semester` (checked to `1st`, `2nd`, `summer`, or `NULL`)
- A non-empty category check, an elective-only metadata check, and a partial
  index on the three metadata columns

Migration `supabase/migrations/20261114000200_fix_pdf_row_snapshots.sql` cleans
up empty cell overrides written by the old row-snapshot logic. Rows whose
overrides were all empty become explicit `blank` rows; mixed overrides keep only
their non-empty values.

## Tests

Backend coverage lives in:

- `apps/backend/test/subjects.service.spec.ts` — elective unit modes, total-only
  validation, placeholder auto-resolution, category trimming, metadata
  persistence, and metadata clearing when an elective becomes regular.
- `apps/backend/test/prospectus-pdfs.service.spec.ts` — typed, existing, and
  empty-field elective imports, copy counts, total-only imports, idempotent
  re-imports, regular-subject rejection, major/minor flags, elective table
  uniqueness, and inherited year/term/category metadata.
- `apps/backend/test/prospectus.service.spec.ts` — fill-slot rejection of
  regular subjects, filling with an existing elective, typed-code create/reuse,
  placeholder-code rejection, duplicate-slot copies, and placeholder cleanup on
  removal.
