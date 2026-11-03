-- CoE-NNECT migration: remember prospectus rows that were switched off
-- automatically because their subject was deactivated.
--
-- When a subject is deactivated, its prospectus mappings are deactivated
-- too. When the subject is reactivated we only want to restore the rows
-- that the cascade turned off — entries a user deactivated by hand must
-- stay inactive. This flag distinguishes the two cases.

ALTER TABLE public.prospectus
    ADD COLUMN IF NOT EXISTS deactivated_by_subject boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.prospectus.deactivated_by_subject IS
    'True when this row was deactivated automatically because its subject was deactivated. Cleared when the subject (or the user) reactivates it.';

CREATE INDEX IF NOT EXISTS idx_prospectus_subject_active
    ON public.prospectus USING btree (subject_id, is_active);
