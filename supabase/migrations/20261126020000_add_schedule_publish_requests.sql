-- Dean-approved publish requests for draft schedule entries.
--
-- A department head requests publication of a draft entry; the Dean approves
-- or rejects it. Only an approval may move the entry from finalized to
-- published. At most one pending request may exist per schedule.
--
-- Backend-only table: RLS is enabled with no client policies and the
-- anon/authenticated roles lose their default grants. The schedule status-flow
-- trigger already allows finalized -> published, so it is not changed here.

CREATE TYPE public.schedule_publish_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);

CREATE TABLE IF NOT EXISTS public.schedule_publish_request (
    request_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schedule_id bigint NOT NULL
        REFERENCES public.schedule(schedule_id) ON DELETE CASCADE,
    dept_id bigint
        REFERENCES public.department(dept_id) ON DELETE SET NULL,
    requested_by uuid
        REFERENCES public.users(user_id) ON DELETE SET NULL,
    note text,
    status public.schedule_publish_request_status
        DEFAULT 'pending'::public.schedule_publish_request_status NOT NULL,
    responded_by uuid
        REFERENCES public.users(user_id) ON DELETE SET NULL,
    responded_at timestamp with time zone,
    response_remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- One open request per schedule. Resolved requests remain as history.
CREATE UNIQUE INDEX uq_schedule_publish_request_pending
    ON public.schedule_publish_request (schedule_id)
    WHERE status = 'pending';

CREATE INDEX idx_schedule_publish_request_status_created
    ON public.schedule_publish_request (status, created_at DESC);

CREATE INDEX idx_schedule_publish_request_dept
    ON public.schedule_publish_request (dept_id);

CREATE INDEX idx_schedule_publish_request_requested_by
    ON public.schedule_publish_request (requested_by);

CREATE TRIGGER trg_schedule_publish_request_updated_at
    BEFORE UPDATE ON public.schedule_publish_request
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.schedule_publish_request ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.schedule_publish_request FROM anon, authenticated;
GRANT ALL ON TABLE public.schedule_publish_request TO service_role;
