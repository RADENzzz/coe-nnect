-- CoE-NNECT migration: durable inbound IDP change requests (Milestone 3).
--
-- Contract 4.7 / 5.7: IDP asks CoE-NNECT to review a schedule- or
-- faculty-affecting change. `idp_request_id` is the idempotency key and the
-- primary key. The acknowledgement is stored on the same row and is also
-- queued in public.idp_outbox under kind 'change_request.ack', so an offline
-- IDP desktop can collect it later.
--
-- Only the NestJS API (DATABASE_URL) reads and writes this table. RLS is
-- enabled with no client policies and no anon/authenticated grants.

CREATE TABLE IF NOT EXISTS public.idp_change_request (
    idp_request_id text PRIMARY KEY,
    body_hash text NOT NULL,
    type text NOT NULL,
    faculty_id bigint REFERENCES public.faculty(faculty_id) ON DELETE SET NULL,
    faculty_wmsu_id text,
    faculty_employee_id text,
    severity text NOT NULL,
    requires_ack boolean DEFAULT true NOT NULL,
    status text DEFAULT 'pending' NOT NULL,
    payload jsonb NOT NULL,
    affected_dates jsonb,
    requested_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ack_action text,
    ack_notes text,
    acknowledged_by uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
    acknowledged_at timestamp with time zone,
    CONSTRAINT idp_change_request_status_check
        CHECK (status IN ('pending', 'acknowledged', 'rejected')),
    CONSTRAINT idp_change_request_ack_action_check
        CHECK (ack_action IS NULL OR ack_action IN ('accepted', 'rejected', 'modified'))
);

-- Review queue: pending first, newest first.
CREATE INDEX IF NOT EXISTS idx_idp_change_request_status_requested_at
    ON public.idp_change_request USING btree (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_idp_change_request_type
    ON public.idp_change_request USING btree (type);

ALTER TABLE public.idp_change_request ENABLE ROW LEVEL SECURITY;
