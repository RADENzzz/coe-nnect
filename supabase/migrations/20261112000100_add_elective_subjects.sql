-- Elective subjects and elective PDF tables.
--
-- An elective subject is a catalog entry that may not have a fixed course code
-- yet. Elective imports create a deterministic placeholder code instead, and
-- the UI warns until the placeholder is resolved.
--
-- Elective subjects may also be total-units-only: some prospectuses list only
-- the total units for an elective, with no lecture/lab split. In that mode the
-- lecture and lab columns stay at zero.

-- ── subject ──────────────────────────────────────────────────────────────

ALTER TABLE public.subject
    ADD COLUMN IF NOT EXISTS is_elective boolean DEFAULT false NOT NULL;

ALTER TABLE public.subject
    ADD COLUMN IF NOT EXISTS units_mode text DEFAULT 'lec_lab' NOT NULL;

ALTER TABLE public.subject
    DROP CONSTRAINT IF EXISTS subject_units_mode_check;

ALTER TABLE public.subject
    ADD CONSTRAINT subject_units_mode_check
    CHECK (units_mode IN ('lec_lab', 'total_only'));

-- Total-only units only make sense for electives.
ALTER TABLE public.subject
    DROP CONSTRAINT IF EXISTS subject_units_mode_elective_check;

ALTER TABLE public.subject
    ADD CONSTRAINT subject_units_mode_elective_check
    CHECK (units_mode = 'lec_lab' OR is_elective);

-- In total-only mode the breakdown columns must stay empty.
ALTER TABLE public.subject
    DROP CONSTRAINT IF EXISTS subject_total_only_units_check;

ALTER TABLE public.subject
    ADD CONSTRAINT subject_total_only_units_check
    CHECK (
        units_mode = 'lec_lab'
        OR (lecture_units = 0 AND lab_units = 0)
    );

CREATE INDEX IF NOT EXISTS idx_subject_is_elective
    ON public.subject (is_elective)
    WHERE is_elective;

COMMENT ON COLUMN public.subject.is_elective IS
    'True when the catalog entry is an elective subject. Electives may use total-only units and are plotted before regular subjects.';
COMMENT ON COLUMN public.subject.units_mode IS
    'lec_lab = total is lecture + lab; total_only = only total units are known (electives only).';

-- Existing placeholder rows created by the old import flow are electives too.
UPDATE public.subject
SET is_elective = true,
    units_mode = CASE
        WHEN lecture_units = 0 AND lab_units = 0 AND total_units > 0
            THEN 'total_only'
        ELSE units_mode
    END
WHERE is_placeholder = true;

-- ── prospectus_pdf_table ─────────────────────────────────────────────────

ALTER TABLE public.prospectus_pdf_table
    ADD COLUMN IF NOT EXISTS table_kind text DEFAULT 'regular' NOT NULL;

ALTER TABLE public.prospectus_pdf_table
    DROP CONSTRAINT IF EXISTS prospectus_pdf_table_kind_check;

ALTER TABLE public.prospectus_pdf_table
    ADD CONSTRAINT prospectus_pdf_table_kind_check
    CHECK (table_kind IN ('regular', 'elective'));

-- A PDF may contain many elective tables for the same year/semester, but only
-- one regular curriculum table for each combination.
ALTER TABLE public.prospectus_pdf_table
    DROP CONSTRAINT IF EXISTS uq_prospectus_pdf_table_ys;

CREATE UNIQUE INDEX IF NOT EXISTS uq_prospectus_pdf_table_regular_ys
    ON public.prospectus_pdf_table (pdf_id, year_level, semester)
    WHERE table_kind = 'regular';

COMMENT ON COLUMN public.prospectus_pdf_table.table_kind IS
    'regular = curriculum table (one per year/semester per PDF); elective = elective table (many allowed).';
