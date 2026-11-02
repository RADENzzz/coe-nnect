-- CoE-NNECT migration: columns that were added to the entities after the
-- baseline snapshot but never made it into a tracked migration.
--
-- Without these, a fresh `supabase db reset` produces a database that the
-- backend cannot query (Playwright E2E failed on Subject.is_placeholder,
-- Prospectus.slot_label, and schedule_unscheduled.dept_id).
--
--   1. `subject.is_placeholder` — deterministic placeholder subjects created
--      by the prospectus importer for elective slots.
--   2. `prospectus.slot_label` — the human-readable slot from the PDF.
--   3. `schedule_unscheduled.dept_id` — department scoping for sessions the
--      solver could not place.

-- ---------------------------------------------------------------------------
-- subject.is_placeholder
-- ---------------------------------------------------------------------------

ALTER TABLE public.subject
    ADD COLUMN IF NOT EXISTS is_placeholder boolean DEFAULT false NOT NULL;

-- ---------------------------------------------------------------------------
-- prospectus.slot_label
-- ---------------------------------------------------------------------------

ALTER TABLE public.prospectus
    ADD COLUMN IF NOT EXISTS slot_label text;

-- ---------------------------------------------------------------------------
-- schedule_unscheduled.dept_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.schedule_unscheduled
    ADD COLUMN IF NOT EXISTS dept_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'schedule_unscheduled_dept_id_fkey'
       AND conrelid = 'public.schedule_unscheduled'::regclass
  ) THEN
    ALTER TABLE public.schedule_unscheduled
      ADD CONSTRAINT schedule_unscheduled_dept_id_fkey
      FOREIGN KEY (dept_id) REFERENCES public.department(dept_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_schedule_unscheduled_dept
    ON public.schedule_unscheduled USING btree (dept_id);
