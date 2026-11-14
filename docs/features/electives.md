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

Code-less elective rows in a prospectus are placeholder subjects. **Fill
Elective Slot** only accepts elective subjects; the backend rejects regular
subjects with `Slots can only be filled with elective subjects.`

The modal filters the catalog by category, year level, and term, pre-filters to
the slot's year/term, and groups options by category. Electives with a `NULL`
year or term are treated as eligible for every year/term. Filling a slot
snapshots the placeholder label onto `prospectus.slot_label` and deactivates
the old placeholder when nothing else references it.

The **Add Subject to Prospectus** picker also separates electives from regular
subjects, groups electives by category, and shows each elective's year/term
metadata.


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
3. **Temporary code** — the row has no code and no existing elective. The
   backend creates a deterministic placeholder such as
   `ELEC-Y1S1-A1B2C3`, sets `is_placeholder = true`, and reports it in
   `temporaryCodes` and `warnings`.

Temporary codes are deterministic for the same table, row, and title, so
re-importing the same PDF does not create duplicates. Legacy `slot` rows keep
the older `SLOT-…` format.

New elective subjects inherit `elective_year_level` and `elective_semester`
from the PDF table they came from. The import review also accepts an optional
`elective_category`; the value is trimmed and stored on each newly created
elective so the catalog can group and filter it later.

If no elective subjects exist in the catalog yet, the import dialog and the
backend both warn before the import starts. Rows with a temporary code are
still imported so the prospectus structure is not lost.

## Scheduling behavior

- Electives are sorted before regular subjects in the prospectus view.
- Multiple distinct electives may be plotted in one semester. The prospectus
  uniqueness key still prevents the same subject from being placed twice in the
  same program/year/semester.
- Auto-generate excludes electives that are unresolved (placeholder or an
  `ELEC-`/`SLOT-` code) and returns the exclusions in `electiveWarnings`.
- Plot-subject and plot-multi reject unresolved electives with a clear error.
  The Timetable page hides them from the plot modal and shows a banner linking
  to the Elective tab.
- Resolving the code on the Subjects page clears `is_placeholder` automatically,
  after which the elective can be plotted and auto-generated.

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
  temporary-code elective imports, total-only imports, idempotent re-imports,
  regular-subject rejection, elective table uniqueness, and inherited
  year/term/category metadata.
- `apps/backend/test/prospectus.service.spec.ts` — fill-slot rejection of
  regular subjects and successful replacement of a placeholder with an
  elective.
