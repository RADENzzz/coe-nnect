-- Dynamic semester types.
--
-- Replaces the public.semester_type enum with a dean-managed catalog table.
-- Codes are immutable; labels are editable. Existing values are preserved and
-- gain foreign keys, so a type cannot be deleted while it is in use.
--
-- Rollback is manual and only safe while the catalog still contains the
-- original three codes (1st, 2nd, summer). Reverse the steps: drop the four
-- foreign keys and restore the two replaced text CHECK constraints, recreate
-- the public.semester_type enum, convert term.semester and prospectus.semester
-- back with a CASE mapping, then drop the catalog table.

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
