-- Cross-department subject edit requests.
--
-- A department head may request edit access to a subject owned by another
-- department. The owning department head (or an administrator) approves or
-- rejects the request; approval is an active grant until it is revoked.
-- At most one pending request may exist per subject.
--
-- Backend-only table: RLS is enabled with no client policies and the
-- anon/authenticated roles lose their default grants.

CREATE TYPE public.subject_edit_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled',
    'revoked'
);

CREATE TABLE IF NOT EXISTS public.subject_edit_request (
    request_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_id bigint NOT NULL
        REFERENCES public.subject(subject_id) ON DELETE CASCADE,
    requesting_dept_id bigint NOT NULL
        REFERENCES public.department(dept_id) ON DELETE CASCADE,
    owning_dept_id bigint NOT NULL
        REFERENCES public.department(dept_id) ON DELETE CASCADE,
    reason text NOT NULL,
    status public.subject_edit_request_status
        DEFAULT 'pending'::public.subject_edit_request_status NOT NULL,
    created_by uuid
        REFERENCES public.users(user_id) ON DELETE SET NULL,
    responded_by uuid
        REFERENCES public.users(user_id) ON DELETE SET NULL,
    responded_at timestamp with time zone,
    response_remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- One open request per subject. Resolved requests remain as history.
CREATE UNIQUE INDEX uq_subject_edit_request_pending
    ON public.subject_edit_request (subject_id)
    WHERE status = 'pending';

CREATE INDEX idx_subject_edit_request_status_created
    ON public.subject_edit_request (status, created_at DESC);

CREATE TRIGGER trg_subject_edit_request_updated_at
    BEFORE UPDATE ON public.subject_edit_request
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subject_edit_request ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.subject_edit_request FROM anon, authenticated;
GRANT ALL ON TABLE public.subject_edit_request TO service_role;
