-- CoE-NNECT migration: durable IDP webhook idempotency.
--
-- Contract 7.4 requires receivers to keep seen idempotency keys for at least
-- 30 days. The first IDP implementation kept them in a process-local Map,
-- which loses state on restart and is not shared between instances.
--
-- Only the NestJS API (DATABASE_URL) reads and writes this table. RLS is
-- enabled with no client policies and no anon/authenticated grants, so direct
-- Supabase clients cannot inspect or tamper with integration state.

CREATE TABLE IF NOT EXISTS public.idp_processed_event (
    event_id text PRIMARY KEY,
    body_hash text NOT NULL,
    event_type text,
    faculty_id bigint REFERENCES public.faculty(faculty_id) ON DELETE SET NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Retention sweep (30 days) scans by processed_at.
CREATE INDEX IF NOT EXISTS idx_idp_processed_event_processed_at
    ON public.idp_processed_event USING btree (processed_at);

ALTER TABLE public.idp_processed_event ENABLE ROW LEVEL SECURITY;
