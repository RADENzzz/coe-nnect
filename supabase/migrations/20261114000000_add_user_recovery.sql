-- Optional recovery email and single-use tokens for password recovery.
--
-- The login email lives on public.users and in Supabase Auth. A recovery
-- email is deliberately separate: users may keep an institutional login
-- address while receiving reset links at a personal address.
--
-- Token columns store SHA-256 hashes only. This table is never read by the
-- browser: RLS is enabled with no policies, and the anon/authenticated roles
-- lose their default grants. The NestJS API uses the service/database role.

CREATE TABLE IF NOT EXISTS public.user_recovery (
    user_id uuid PRIMARY KEY
        REFERENCES public.users(user_id) ON DELETE CASCADE,
    recovery_email text,
    verification_token_hash text,
    verification_token_expires_at timestamptz,
    verified_at timestamptz,
    reset_token_hash text,
    reset_token_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_recovery_email_idx
    ON public.user_recovery (lower(recovery_email));

-- A verified address belongs to at most one account. Pending claims may
-- collide; the person who controls the inbox decides which claim wins.
CREATE UNIQUE INDEX IF NOT EXISTS user_recovery_verified_email_idx
    ON public.user_recovery (lower(recovery_email))
    WHERE verified_at IS NOT NULL;

CREATE TRIGGER trg_user_recovery_updated_at
    BEFORE UPDATE ON public.user_recovery
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_recovery ENABLE ROW LEVEL SECURITY;

-- Supabase grants new public tables to anon/authenticated by default. Remove
-- those grants so the token hashes are reachable only through the backend.
REVOKE ALL ON TABLE public.user_recovery FROM anon, authenticated;
GRANT ALL ON TABLE public.user_recovery TO service_role;
