-- Published term schedule snapshots kept for archive and reuse.
--
-- One saved version per term is rewritten in place: term deletion detaches the
-- row instead of deleting it, so an archived snapshot stays addressable by id.
-- No backfill: existing schedule_version rows are left alone.
--
-- Backend-only table: RLS is enabled with no client policies and the
-- anon/authenticated roles lose their default grants.

CREATE TABLE IF NOT EXISTS public.term_published_version (
    term_published_version_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    term_id bigint
        REFERENCES public.term(term_id) ON UPDATE CASCADE ON DELETE SET NULL,
    version_number integer DEFAULT 1 NOT NULL,
    term_name text NOT NULL,
    semester text,
    school_year text NOT NULL,
    snapshot jsonb NOT NULL,
    published_at timestamp with time zone,
    deactivated_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_modified_by uuid
        REFERENCES public.users(user_id) ON DELETE SET NULL,
    CONSTRAINT chk_term_published_version_version_number
        CHECK (version_number > 0)
);

CREATE UNIQUE INDEX uq_term_published_version_term
    ON public.term_published_version (term_id)
    WHERE term_id IS NOT NULL;

CREATE INDEX idx_term_published_version_term_id
    ON public.term_published_version (term_id);

CREATE INDEX idx_term_published_version_semester_school_year
    ON public.term_published_version (semester, school_year);

CREATE INDEX idx_term_published_version_updated_at
    ON public.term_published_version (updated_at DESC);

CREATE TRIGGER trg_term_published_version_updated_at
    BEFORE UPDATE ON public.term_published_version
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.term_published_version ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.term_published_version FROM anon, authenticated;
GRANT ALL ON TABLE public.term_published_version TO service_role;

-- Finalize history survives term deletion as well.
ALTER TABLE public.schedule_version ALTER COLUMN term_id DROP NOT NULL;

ALTER TABLE public.schedule_version
    DROP CONSTRAINT IF EXISTS schedule_version_term_id_fkey;

ALTER TABLE public.schedule_version
    ADD CONSTRAINT schedule_version_term_id_fkey
    FOREIGN KEY (term_id) REFERENCES public.term(term_id)
    ON UPDATE CASCADE ON DELETE SET NULL;
