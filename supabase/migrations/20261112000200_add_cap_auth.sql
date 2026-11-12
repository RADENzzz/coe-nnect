-- CoE-NNECT migration: Cap CAPTCHA replay protection and redeem-token storage.
--
-- Cap Core is stateless: challenge tokens are signed JWTs and the library
-- returns a redeem token plus a lookup key. The NestJS API stores the lookup
-- key here and deletes it on read, which makes each solved challenge
-- single-use. The nonce table makes challenge redemption itself single-use.
--
-- Only the NestJS API (DATABASE_URL) reads and writes these tables. RLS is
-- enabled with no client policies and no anon/authenticated grants, so direct
-- Supabase clients cannot inspect, forge, or replay Cap state.

CREATE TABLE IF NOT EXISTS public.cap_nonce (
    signature text PRIMARY KEY,
    expires_at timestamp with time zone NOT NULL
);

-- Expiry sweep runs hourly from CapService.
CREATE INDEX IF NOT EXISTS idx_cap_nonce_expires_at
    ON public.cap_nonce USING btree (expires_at);

CREATE TABLE IF NOT EXISTS public.cap_token (
    token_key text PRIMARY KEY,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Expiry sweep runs hourly from CapService.
CREATE INDEX IF NOT EXISTS idx_cap_token_expires_at
    ON public.cap_token USING btree (expires_at);

ALTER TABLE public.cap_nonce ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cap_token ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cap_nonce FROM anon, authenticated;
REVOKE ALL ON TABLE public.cap_token FROM anon, authenticated;
