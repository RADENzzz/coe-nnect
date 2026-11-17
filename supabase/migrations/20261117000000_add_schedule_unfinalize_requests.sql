-- Dean-approved unfinalize requests for published schedule entries.
--
-- A department head may unfinalize a *finalized* entry directly (it is not
-- public yet). Once an entry is *published*, only the Dean can take it out of
-- the public schedule. The DH records the reason here, the Dean approves or
-- rejects it, and an approval moves the entry back to Draft.
--
-- The status-flow trigger is widened by exactly one edge: published -> draft.
-- The request table is backend-only: RLS is enabled with no client policies
-- and the anon/authenticated roles lose their default grants.

CREATE TYPE public.schedule_unfinalize_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);

CREATE TABLE public.schedule_unfinalize_request (
    request_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schedule_id bigint NOT NULL
        REFERENCES public.schedule(schedule_id) ON DELETE CASCADE,
    dept_id bigint
        REFERENCES public.department(dept_id) ON DELETE SET NULL,
    requested_by uuid
        REFERENCES public.users(user_id) ON DELETE SET NULL,
    reason text NOT NULL,
    status public.schedule_unfinalize_request_status
        DEFAULT 'pending'::public.schedule_unfinalize_request_status NOT NULL,
    responded_by uuid
        REFERENCES public.users(user_id) ON DELETE SET NULL,
    responded_at timestamp with time zone,
    response_remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- At most one open request per schedule. Resolved requests remain as history.
CREATE UNIQUE INDEX uq_schedule_unfinalize_request_pending
    ON public.schedule_unfinalize_request (schedule_id)
    WHERE status = 'pending'::public.schedule_unfinalize_request_status;

CREATE INDEX idx_schedule_unfinalize_request_status_created
    ON public.schedule_unfinalize_request (status, created_at DESC);

CREATE INDEX idx_schedule_unfinalize_request_dept
    ON public.schedule_unfinalize_request (dept_id);

CREATE TRIGGER trg_schedule_unfinalize_request_updated_at
    BEFORE UPDATE ON public.schedule_unfinalize_request
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.schedule_unfinalize_request ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.schedule_unfinalize_request FROM anon, authenticated;
GRANT ALL ON TABLE public.schedule_unfinalize_request TO service_role;

-- Allow the Dean's unfinalize decision to move a published entry back to
-- Draft. Every other transition remains unchanged.
CREATE OR REPLACE FUNCTION public.enforce_schedule_status_flow() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.status = old.status then
    return new;
  end if;

  if (old.status, new.status) in (
    ('draft','review'),
    ('review','draft'),
    ('review','finalized'),
    ('finalized','review'),
    ('finalized','published'),
    ('published','finalized'),
    -- Added for FR 5.1.5 / 5.1.6 — direct finalize / unfinalize
    ('draft','finalized'),
    ('finalized','draft'),
    -- Added for Dean-approved unfinalize of a published entry
    ('published','draft')
  ) then
    return new;
  end if;

  raise exception 'Invalid schedule status change: % -> %', old.status, new.status;
end;
$$;
