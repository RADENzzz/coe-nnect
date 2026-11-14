-- Elective categorization metadata.
--
-- Electives are standby catalog subjects: the same catalog entry may be used
-- by several prospectuses, and users need to tell them apart by the group they
-- belong to (for example GEC vs. major) and by the year/semester they target.
--
-- The values are free text / small integers on the subject itself rather than a
-- separate managed category table. This keeps imports and the subject form
-- simple: a category is whatever the department types, and the UI derives its
-- filter and dropdown groups from the values that actually exist.

ALTER TABLE public.subject
    ADD COLUMN IF NOT EXISTS elective_category text;

ALTER TABLE public.subject
    ADD COLUMN IF NOT EXISTS elective_year_level smallint;

ALTER TABLE public.subject
    ADD COLUMN IF NOT EXISTS elective_semester text;

ALTER TABLE public.subject
    DROP CONSTRAINT IF EXISTS subject_elective_year_level_check;

ALTER TABLE public.subject
    ADD CONSTRAINT subject_elective_year_level_check
    CHECK (elective_year_level IS NULL OR elective_year_level BETWEEN 1 AND 6);

ALTER TABLE public.subject
    DROP CONSTRAINT IF EXISTS subject_elective_semester_check;

ALTER TABLE public.subject
    ADD CONSTRAINT subject_elective_semester_check
    CHECK (
        elective_semester IS NULL
        OR elective_semester IN ('1st', '2nd', 'summer')
    );

ALTER TABLE public.subject
    DROP CONSTRAINT IF EXISTS subject_elective_category_nonempty_check;

ALTER TABLE public.subject
    ADD CONSTRAINT subject_elective_category_nonempty_check
    CHECK (
        elective_category IS NULL
        OR btrim(elective_category) <> ''
    );

-- Metadata is meaningful for electives only. Clearing the elective flag must
-- clear the metadata too; the service enforces the same rule on writes.
ALTER TABLE public.subject
    DROP CONSTRAINT IF EXISTS subject_elective_metadata_only_check;

ALTER TABLE public.subject
    ADD CONSTRAINT subject_elective_metadata_only_check
    CHECK (
        is_elective
        OR (
            elective_category IS NULL
            AND elective_year_level IS NULL
            AND elective_semester IS NULL
        )
    );

CREATE INDEX IF NOT EXISTS idx_subject_elective_metadata
    ON public.subject (
        elective_category,
        elective_year_level,
        elective_semester
    )
    WHERE is_elective;

COMMENT ON COLUMN public.subject.elective_category IS
    'Free-text elective group (for example GEC or Major), used by filters and grouped dropdowns.';
COMMENT ON COLUMN public.subject.elective_year_level IS
    'Preferred year level for this elective (1-6), or NULL when it applies to any year.';
COMMENT ON COLUMN public.subject.elective_semester IS
    'Preferred semester for this elective (1st, 2nd, summer), or NULL when it applies to any term.';
