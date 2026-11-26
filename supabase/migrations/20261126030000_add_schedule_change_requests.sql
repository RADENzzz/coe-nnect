-- Dean-approved schedule change requests for draft schedule entries.
--
-- A department head requests a change to a draft entry; the Dean approves or
-- rejects it. Only an approval may apply the requested change. At most one
-- pending request may exist per schedule.
--
-- Backend-only table: RLS is enabled with no client policies and the
-- anon/authenticated roles lose their default grants.

CREATE TYPE public.schedule_change_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);

CREATE TABLE IF NOT EXISTS public.schedule_change_request (
    request_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schedule_id bigint NOT NULL
        REFERENCES public.schedule(schedule_id) ON DELETE CASCADE,
    dept_id bigint
        REFERENCES public.department(dept_id) ON DELETE SET NULL,
    requested_by uuid
        REFERENCES public.users(user_id) ON DELETE SET NULL,
    reason text NOT NULL,
    status public.schedule_change_request_status
        DEFAULT 'pending'::public.schedule_change_request_status NOT NULL,
    responded_by uuid
        REFERENCES public.users(user_id) ON DELETE SET NULL,
    responded_at timestamp with time zone,
    response_remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- One open request per schedule. Resolved requests remain as history.
CREATE UNIQUE INDEX uq_schedule_change_request_pending
    ON public.schedule_change_request (schedule_id)
    WHERE status = 'pending';

CREATE INDEX idx_schedule_change_request_status_created
    ON public.schedule_change_request (status, created_at DESC);

CREATE INDEX idx_schedule_change_request_dept
    ON public.schedule_change_request (dept_id);

CREATE INDEX idx_schedule_change_request_requested_by
    ON public.schedule_change_request (requested_by);

CREATE TRIGGER trg_schedule_change_request_updated_at
    BEFORE UPDATE ON public.schedule_change_request
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.schedule_change_request ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.schedule_change_request FROM anon, authenticated;
GRANT ALL ON TABLE public.schedule_change_request TO service_role;
