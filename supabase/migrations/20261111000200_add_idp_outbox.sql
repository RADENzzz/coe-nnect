-- CoE-NNECT migration: durable IDP outbox (Pattern C).
--
-- The IDP deployment is a desktop application that may be offline. It cannot
-- receive inbound HTTP, so published schedules are stored here until the
-- desktop client polls GET /api/idp/v1/outbox/schedules.
--
-- (kind, idempotency_key) is the contract idempotency pair. For schedule
-- items the key is coe_nnect_version_id, so re-publishing the same version
-- returns the original payload instead of creating a second item.
--
-- Only the NestJS API (DATABASE_URL) reads and writes this table. RLS is
-- enabled with no client policies and no anon/authenticated grants.

CREATE TABLE IF NOT EXISTS public.idp_outbox (
    outbox_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind text NOT NULL,
    idempotency_key text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT idp_outbox_kind_key_unique UNIQUE (kind, idempotency_key)
);

-- Poll query: WHERE kind = ? AND created_at >= ? ORDER BY created_at.
CREATE INDEX IF NOT EXISTS idx_idp_outbox_kind_created_at
    ON public.idp_outbox USING btree (kind, created_at);

ALTER TABLE public.idp_outbox ENABLE ROW LEVEL SECURITY;
