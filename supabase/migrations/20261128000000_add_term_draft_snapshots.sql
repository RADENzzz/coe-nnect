-- Named drafts of the live draft/review timetable, scoped to one term and
-- department. Snapshots are rebuilt from the current grid on load; they never
-- contain finalized or published rows. Names are intentionally not unique:
-- several drafts may share a label.
--
-- Backend-only table: RLS is enabled with no client policies and the
-- anon/authenticated roles lose their default grants.

CREATE TABLE IF NOT EXISTS public.term_draft_snapshot (
    term_draft_snapshot_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    term_id bigint NOT NULL
        REFERENCES public.term(term_id) ON UPDATE CASCADE ON DELETE CASCADE,
    dept_id bigint NOT NULL
        REFERENCES public.department(dept_id) ON UPDATE CASCADE ON DELETE CASCADE,
    name text NOT NULL,
    term_name text NOT NULL,
    semester text,
    school_year text NOT NULL,
    snapshot jsonb NOT NULL,
    created_by uuid
        REFERENCES public.users(user_id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_term_draft_snapshot_term_dept
    ON public.term_draft_snapshot (term_id, dept_id);

CREATE INDEX idx_term_draft_snapshot_term_dept_created_at
    ON public.term_draft_snapshot (term_id, dept_id, created_at DESC);

CREATE INDEX idx_term_draft_snapshot_created_at
    ON public.term_draft_snapshot (created_at DESC);

CREATE TRIGGER trg_term_draft_snapshot_updated_at
    BEFORE UPDATE ON public.term_draft_snapshot
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.term_draft_snapshot ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.term_draft_snapshot FROM anon, authenticated;
GRANT ALL ON TABLE public.term_draft_snapshot TO service_role;
