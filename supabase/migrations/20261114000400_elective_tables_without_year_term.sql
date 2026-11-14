-- Elective tables are not tied to a year or term.
--
-- Electives are optioned subjects: a PDF may list an elective pool without
-- saying which year/term it belongs to. The editor still requires a year and
-- semester for regular curriculum tables, but elective tables may now leave
-- both columns NULL and are assigned to a year/term later when the prospectus
-- is built.
--
-- Existing elective tables keep their stored year/semester for compatibility.

ALTER TABLE public.prospectus_pdf_table
    ALTER COLUMN year_level DROP NOT NULL;

ALTER TABLE public.prospectus_pdf_table
    ALTER COLUMN semester DROP NOT NULL;

ALTER TABLE public.prospectus_pdf_table
    DROP CONSTRAINT IF EXISTS prospectus_pdf_table_year_level_check;

ALTER TABLE public.prospectus_pdf_table
    ADD CONSTRAINT prospectus_pdf_table_year_level_check
    CHECK (year_level IS NULL OR (year_level BETWEEN 1 AND 6));

ALTER TABLE public.prospectus_pdf_table
    DROP CONSTRAINT IF EXISTS prospectus_pdf_table_semester_check;

ALTER TABLE public.prospectus_pdf_table
    ADD CONSTRAINT prospectus_pdf_table_semester_check
    CHECK (
        semester IS NULL
        OR semester IN ('1st', '2nd', 'summer')
    );

-- Regular curriculum tables still need an identity; electives do not.
ALTER TABLE public.prospectus_pdf_table
    DROP CONSTRAINT IF EXISTS prospectus_pdf_table_regular_identity_check;

ALTER TABLE public.prospectus_pdf_table
    ADD CONSTRAINT prospectus_pdf_table_regular_identity_check
    CHECK (
        table_kind = 'elective'
        OR (year_level IS NOT NULL AND semester IS NOT NULL)
    );

COMMENT ON COLUMN public.prospectus_pdf_table.year_level IS
    'Year level for regular tables (1-6). NULL for elective tables that are not tied to a year.';

COMMENT ON COLUMN public.prospectus_pdf_table.semester IS
    'Semester for regular tables. NULL for elective tables that are not tied to a term.';
