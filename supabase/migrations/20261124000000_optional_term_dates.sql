ALTER TABLE public.term
  ALTER COLUMN start_date DROP NOT NULL,
  ALTER COLUMN end_date DROP NOT NULL;

ALTER TABLE public.term DROP CONSTRAINT IF EXISTS term_check;

ALTER TABLE public.term
  ADD CONSTRAINT term_check
  CHECK (
    start_date IS NULL
    OR end_date IS NULL
    OR end_date > start_date
  );
