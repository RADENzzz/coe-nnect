-- CoE-NNECT migration: app-wide maintenance mode.
--
-- `system_status` started life as a read-only banner. `maintenance_mode`
-- turns it into an access gate: when true, only the hidden developer
-- (administrator) account may sign in or call the API. Everyone else sees
-- the maintenance page and is rejected by the backend with 503.
--
-- It is deliberately separate from `enabled`/`severity`: a maintenance
-- banner may be shown without locking the app, and the lock may be enabled
-- without displaying the popup banner.

ALTER TABLE public.system_status
    ADD COLUMN IF NOT EXISTS maintenance_mode boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.system_status.maintenance_mode IS
    'When true, blocks sign-in and API access for every non-administrator.';

-- The baseline constraint only required a title for the popup banner. The
-- maintenance page renders the same title, so require it for either switch.
-- Safe to tighten here: the new column defaults to false, so no existing row
-- can violate it.
ALTER TABLE public.system_status
    DROP CONSTRAINT IF EXISTS chk_system_status_title_required;

ALTER TABLE public.system_status
    ADD CONSTRAINT chk_system_status_title_required
    CHECK (
        (enabled = false AND maintenance_mode = false)
        OR (title IS NOT NULL AND length(btrim(title)) > 0)
    );
