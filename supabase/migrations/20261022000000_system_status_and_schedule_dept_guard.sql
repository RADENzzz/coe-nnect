-- CoE-NNECT migration: system_status banner and active-department schedule guard.
--
-- Added 22 October 2026. Brings the tracked schema in line with the live
-- Supabase project; see docs/DATABASE STRUCTURE/coe-nnect-database-structure.sql
-- for the matching snapshot and docs/DATABASE STRUCTURE/README.md for the
-- narrative description.
--
--   1. `system_status` — a singleton row holding the app-wide status banner
--      (outage / maintenance notices) shown on the login page and app shell.
--   2. `trg_schedule_active_dept` — rejects schedule writes that belong to a
--      deactivated or missing department, mirroring the API-side guards.
--   3. `REVOKE USAGE ON SCHEMA public FROM PUBLIC` — the schema is reachable
--      only through the anon, authenticated, and service_role roles.

-- ---------------------------------------------------------------------------
-- Schema-level access
-- ---------------------------------------------------------------------------

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- ---------------------------------------------------------------------------
-- system_status
-- ---------------------------------------------------------------------------

CREATE TABLE public.system_status (
    status_id smallint DEFAULT 1 NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    title text,
    message text,
    suppress_until timestamp with time zone,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_status_pkey PRIMARY KEY (status_id),
    CONSTRAINT system_status_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text, 'maintenance'::text]))),
    CONSTRAINT system_status_status_id_check CHECK ((status_id = 1)),
    CONSTRAINT chk_system_status_title_required CHECK (((enabled = false) OR ((title IS NOT NULL) AND (length(btrim(title)) > 0))))
);

ALTER TABLE public.system_status
    ADD CONSTRAINT system_status_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.tg_system_status_touch() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_status_touch ON public.system_status;
CREATE TRIGGER trg_system_status_touch BEFORE UPDATE ON public.system_status FOR EACH ROW EXECUTE FUNCTION public.tg_system_status_touch();

ALTER TABLE public.system_status ENABLE ROW LEVEL SECURITY;

-- Read-only for everyone: the banner is rendered before sign-in, and writes go
-- through the administrator-only NestJS endpoint (which also writes audit_trail).
DROP POLICY IF EXISTS system_status_public_read ON public.system_status;
CREATE POLICY system_status_public_read ON public.system_status FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS system_status_authenticated_read ON public.system_status;
CREATE POLICY system_status_authenticated_read ON public.system_status FOR SELECT TO authenticated USING (true);

GRANT ALL ON TABLE public.system_status TO anon;
GRANT ALL ON TABLE public.system_status TO authenticated;
GRANT ALL ON TABLE public.system_status TO service_role;

GRANT ALL ON FUNCTION public.tg_system_status_touch() TO anon;
GRANT ALL ON FUNCTION public.tg_system_status_touch() TO authenticated;
GRANT ALL ON FUNCTION public.tg_system_status_touch() TO service_role;

-- The administrator API updates this row, so it must exist. It starts disabled.
INSERT INTO public.system_status (status_id, enabled, severity)
VALUES (1, false, 'info')
ON CONFLICT (status_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Active-department guard for schedule writes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_active_department_on_schedule() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  dept_active boolean;
  dept_label  text;
BEGIN
  IF NEW.dept_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_active,
         dept_code || ' — ' || dept_name
    INTO dept_active, dept_label
    FROM public.department
   WHERE dept_id = NEW.dept_id;

  IF dept_active IS NULL THEN
    -- dept_id points at a non-existent department
    RAISE EXCEPTION
      'schedule.dept_id=% does not reference an existing department',
      NEW.dept_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF dept_active IS FALSE THEN
    -- Single format string with ONE % placeholder for dept_label.
    -- No || concatenation — that's the PL/pgSQL RAISE gotcha.
    RAISE EXCEPTION
      'Cannot write schedule row: department "%" is deactivated. Reactivate the department from Dean → Departments before making changes.',
      dept_label
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_active_dept ON public.schedule;
CREATE TRIGGER trg_schedule_active_dept BEFORE INSERT OR UPDATE OF dept_id ON public.schedule FOR EACH ROW EXECUTE FUNCTION public.enforce_active_department_on_schedule();

GRANT ALL ON FUNCTION public.enforce_active_department_on_schedule() TO anon;
GRANT ALL ON FUNCTION public.enforce_active_department_on_schedule() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_active_department_on_schedule() TO service_role;
