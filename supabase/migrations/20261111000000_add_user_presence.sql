-- CoE-NNECT migration: persisted presence.
--
-- Supabase Realtime presence is ephemeral: it disappears when the tab
-- closes, the network drops, or the browser travels somewhere the presence
-- channel is not subscribed. That makes it the right source for a live
-- "Online" dot but the wrong source for "when was this person last around?".
--
-- `user_presence` records a lightweight heartbeat per user. It is a separate
-- table (not a column on `users`) so a minute-level heartbeat never touches
-- `users.updated_at`, audit triggers, or anything that fans out on user
-- mutations.
--
-- Only the NestJS API (DATABASE_URL) reads and writes this table. RLS is
-- enabled with no client policies and no anon/authenticated grants, so direct
-- Supabase clients cannot enumerate presence rows.

CREATE TABLE IF NOT EXISTS public.user_presence (
    user_id uuid PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
