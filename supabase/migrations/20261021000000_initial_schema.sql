-- CoE-NNECT database schema
-- Generated: 2026-10-20T12:56:02.325Z
--
-- This file contains the public schema only (tables, types, functions,
-- triggers, RLS policies, indexes, and grants). It does not contain row data.
-- Apply it to an empty Supabase project. The custom trigger on auth.users is
-- appended at the end because pg_dump does not include it in a public-only dump.

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: day_of_week; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.day_of_week AS ENUM (
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
);


--
-- Name: faculty_class; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.faculty_class AS ENUM (
    'regular',
    'part_time',
    'visiting_lecturer',
    'other'
);


--
-- Name: faculty_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.faculty_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);


--
-- Name: load_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.load_type AS ENUM (
    'lecture',
    'laboratory',
    'other'
);


--
-- Name: room_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.room_type AS ENUM (
    'lecture_room',
    'laboratory',
    'computer_lab',
    'drafting_room',
    'other',
    'any'
);


--
-- Name: schedule_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.schedule_status AS ENUM (
    'draft',
    'review',
    'finalized',
    'published'
);


--
-- Name: semester_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.semester_type AS ENUM (
    '1st',
    '2nd',
    'summer'
);


--
-- Name: sync_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sync_status AS ENUM (
    'pending',
    'synced',
    'failed'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'administrator',
    'college_dean',
    'department_head',
    'viewer'
);


--
-- Name: auto_generate_lock_key(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_generate_lock_key(p_term_id text) RETURNS bigint
    LANGUAGE sql IMMUTABLE
    AS $$
  select ('x' || substr(md5('auto_generate:' || p_term_id), 1, 16))::bit(64)::bigint;
$$;


--
-- Name: cleanup_expired_auto_generate_locks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_auto_generate_locks() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_deleted int;
begin
  delete from public.auto_generate_lock
  where expires_at < now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


--
-- Name: current_user_dept(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_dept() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select dept_id from public.users where user_id = auth.uid() and is_active;
$$;


--
-- Name: current_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_role() RETURNS public.user_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role from public.users where user_id = auth.uid() and is_active;
$$;


--
-- Name: enforce_schedule_status_flow(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_schedule_status_flow() RETURNS trigger
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
    ('finalized','draft')
  ) then
    return new;
  end if;

  raise exception 'Invalid schedule status change: % -> %', old.status, new.status;
end;
$$;


--
-- Name: get_auto_generate_lock(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auto_generate_lock(p_term_id bigint) RETURNS TABLE(held_by uuid, state text, expires_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select acquired_by, state, expires_at
  from public.auto_generate_lock
  where term_id = p_term_id
    and expires_at > now();
$$;


--
-- Name: get_auto_generate_lock_state(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auto_generate_lock_state(p_term_id bigint) RETURNS TABLE(held_by uuid, state text, expires_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select acquired_by, state, expires_at
  from public.auto_generate_lock
  where term_id = p_term_id;
$$;


--
-- Name: handle_new_auth_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  role_value public.user_role;
BEGIN
  -- Parse role safely. Unknown values fall back to 'viewer'.
  BEGIN
    role_value := coalesce(
      nullif(meta->>'role', '')::public.user_role,
      'viewer'::public.user_role
    );
  EXCEPTION WHEN invalid_text_representation THEN
    role_value := 'viewer'::public.user_role;
  END;

  INSERT INTO public.users (
    user_id, username, email, role, dept_id, faculty_id, employee_id, wmsu_id
  )
  VALUES (
    new.id,
    coalesce(nullif(meta->>'username', ''), split_part(new.email, '@', 1)),
    new.email,
    role_value,
    nullif(meta->>'dept_id', '')::bigint,
    nullif(meta->>'faculty_id', '')::bigint,
    nullif(meta->>'employee_id', ''),
    nullif(meta->>'wmsu_id', '')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$;


--
-- Name: mark_auto_generate_pending(bigint, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_auto_generate_pending(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer DEFAULT 600) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.auto_generate_lock
  set state = 'pending_confirm',
      expires_at = now() + (p_ttl_seconds || ' seconds')::interval
  where term_id = p_term_id
    and acquired_by = p_user_id;
end;
$$;


--
-- Name: prevent_owned_room_preference(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_owned_room_preference() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM room
    WHERE room_id = NEW.room_id
      AND dept_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot prefer owned room % — it is exclusive to its owning department',
      NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: release_auto_generate_lock(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_auto_generate_lock(p_term_id text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$
  select pg_advisory_unlock(public.auto_generate_lock_key(p_term_id));
$$;


--
-- Name: release_auto_generate_lock(bigint, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_auto_generate_lock(p_term_id bigint, p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from public.auto_generate_lock
  where term_id = p_term_id
    and acquired_by = p_user_id;
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: try_acquire_auto_generate_lock(bigint, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.try_acquire_auto_generate_lock(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer DEFAULT 120) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Clear stale locks
  delete from public.auto_generate_lock
  where term_id = p_term_id
    and expires_at < now();

  begin
    insert into public.auto_generate_lock
      (term_id, acquired_by, expires_at, state)
    values (
      p_term_id,
      p_user_id,
      now() + (p_ttl_seconds || ' seconds')::interval,
      'running'
    );
    return true;
  exception when unique_violation then
    return false;
  end;
end;
$$;


--
-- Name: try_auto_generate_lock(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.try_auto_generate_lock(p_term_id text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$
  select pg_try_advisory_lock(public.auto_generate_lock_key(p_term_id));
$$;


--
-- Name: update_room_preference_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_room_preference_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_trail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_trail (
    audit_id bigint NOT NULL,
    user_id uuid,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    action text NOT NULL,
    affected_data jsonb,
    source_system text
);


--
-- Name: audit_trail_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit_trail ALTER COLUMN audit_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_trail_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auto_generate_lock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auto_generate_lock (
    term_id bigint NOT NULL,
    acquired_at timestamp with time zone DEFAULT now() NOT NULL,
    acquired_by uuid,
    expires_at timestamp with time zone NOT NULL,
    state text DEFAULT 'running'::text NOT NULL,
    CONSTRAINT auto_generate_lock_state_check CHECK ((state = ANY (ARRAY['running'::text, 'pending_confirm'::text])))
);


--
-- Name: conversation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation (
    conversation_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_conversation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.conversation ALTER COLUMN conversation_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.conversation_conversation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: conversation_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_member (
    conversation_id bigint NOT NULL,
    user_id uuid NOT NULL,
    last_read_at timestamp with time zone,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cross_department_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cross_department_request (
    request_id uuid DEFAULT gen_random_uuid() NOT NULL,
    requesting_dept_id bigint,
    target_dept_id bigint,
    faculty_id bigint,
    subject_id bigint,
    term_id bigint,
    timeslot_id bigint,
    reason text,
    status character varying(50) DEFAULT 'pending'::character varying,
    requested_by uuid,
    approved_by uuid,
    resolved_at timestamp with time zone,
    remarks text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: department; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department (
    dept_id bigint NOT NULL,
    dept_code text NOT NULL,
    dept_name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: department_dept_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.department ALTER COLUMN dept_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.department_dept_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: designation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designation (
    designation_id bigint NOT NULL,
    designation_name text NOT NULL,
    release_hours numeric(5,2) DEFAULT 0 NOT NULL,
    CONSTRAINT designation_release_hours_check CHECK ((release_hours >= (0)::numeric))
);


--
-- Name: designation_designation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.designation ALTER COLUMN designation_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.designation_designation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: faculty; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faculty (
    faculty_id bigint NOT NULL,
    wmsu_id text,
    employee_id text,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    contact text,
    dept_id bigint,
    designation_id bigint,
    classification public.faculty_class DEFAULT 'regular'::public.faculty_class NOT NULL,
    required_hours numeric(5,2),
    sync_status public.sync_status DEFAULT 'pending'::public.sync_status NOT NULL,
    last_synced_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT faculty_required_hours_check CHECK ((required_hours >= (0)::numeric))
);


--
-- Name: faculty_commitment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faculty_commitment (
    commitment_id bigint NOT NULL,
    faculty_id bigint NOT NULL,
    term_id bigint,
    day_of_week public.day_of_week NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    title text,
    source_system text DEFAULT 'IDP'::text NOT NULL,
    external_id text,
    last_synced_at timestamp with time zone,
    CONSTRAINT faculty_commitment_check CHECK ((end_time > start_time))
);


--
-- Name: faculty_commitment_commitment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.faculty_commitment ALTER COLUMN commitment_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.faculty_commitment_commitment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: faculty_faculty_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.faculty ALTER COLUMN faculty_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.faculty_faculty_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: faculty_preference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faculty_preference (
    preference_id bigint NOT NULL,
    faculty_id bigint NOT NULL,
    preferred_day public.day_of_week NOT NULL,
    preferred_start_time time without time zone NOT NULL,
    preferred_end_time time without time zone NOT NULL,
    CONSTRAINT faculty_preference_check CHECK ((preferred_end_time > preferred_start_time))
);


--
-- Name: faculty_preference_preference_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.faculty_preference ALTER COLUMN preference_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.faculty_preference_preference_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: faculty_qualification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faculty_qualification (
    qual_id bigint NOT NULL,
    faculty_id bigint NOT NULL,
    subject_id bigint NOT NULL,
    source_system text
);


--
-- Name: faculty_qualification_qual_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.faculty_qualification ALTER COLUMN qual_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.faculty_qualification_qual_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: faculty_request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faculty_request (
    request_id bigint NOT NULL,
    requesting_dept_id bigint NOT NULL,
    target_dept_id bigint NOT NULL,
    faculty_id bigint,
    subject_id bigint NOT NULL,
    term_id bigint NOT NULL,
    reason text NOT NULL,
    status public.faculty_request_status DEFAULT 'pending'::public.faculty_request_status NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_by uuid,
    responded_at timestamp with time zone,
    response_remarks text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT faculty_request_check CHECK ((requesting_dept_id <> target_dept_id))
);


--
-- Name: faculty_request_request_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.faculty_request ALTER COLUMN request_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.faculty_request_request_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: faculty_unavailability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faculty_unavailability (
    unavailability_id bigint NOT NULL,
    faculty_id bigint NOT NULL,
    term_id bigint,
    day_of_week text NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    reason text,
    source text DEFAULT 'local'::text NOT NULL,
    external_id text,
    synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_unavailability_day CHECK ((day_of_week = ANY (ARRAY['Monday'::text, 'Tuesday'::text, 'Wednesday'::text, 'Thursday'::text, 'Friday'::text, 'Saturday'::text, 'Sunday'::text]))),
    CONSTRAINT chk_unavailability_time_order CHECK ((end_time > start_time)),
    CONSTRAINT faculty_unavailability_source_check CHECK ((source = ANY (ARRAY['local'::text, 'idp'::text])))
);


--
-- Name: faculty_unavailability_unavailability_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.faculty_unavailability ALTER COLUMN unavailability_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.faculty_unavailability_unavailability_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message (
    message_id bigint NOT NULL,
    conversation_id bigint NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000)))
);


--
-- Name: message_message_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.message ALTER COLUMN message_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.message_message_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: minor_subject_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.minor_subject_schedule (
    minor_id bigint NOT NULL,
    term_id bigint NOT NULL,
    subject_code text NOT NULL,
    description text,
    source_dept text,
    day_of_week public.day_of_week,
    start_time time without time zone,
    end_time time without time zone,
    CONSTRAINT minor_subject_schedule_check CHECK (((end_time IS NULL) OR (start_time IS NULL) OR (end_time > start_time)))
);


--
-- Name: minor_subject_schedule_minor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.minor_subject_schedule ALTER COLUMN minor_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.minor_subject_schedule_minor_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification (
    notification_id bigint NOT NULL,
    recipient_id uuid NOT NULL,
    trigger_key text NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    body text,
    entity_type text,
    entity_id text,
    payload jsonb,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_notification_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.notification ALTER COLUMN notification_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.notification_notification_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: program; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program (
    program_id bigint NOT NULL,
    program_code text NOT NULL,
    program_name text NOT NULL,
    dept_id bigint NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: program_program_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.program ALTER COLUMN program_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.program_program_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: prospectus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospectus (
    prospectus_id bigint NOT NULL,
    program_id bigint NOT NULL,
    subject_id bigint NOT NULL,
    year_level smallint NOT NULL,
    semester public.semester_type NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    lecture_sessions_per_week smallint DEFAULT 1 NOT NULL,
    lecture_minutes_per_session smallint DEFAULT 90 NOT NULL,
    lab_sessions_per_week smallint DEFAULT 1 NOT NULL,
    lab_minutes_per_session smallint DEFAULT 180 NOT NULL,
    CONSTRAINT prospectus_lab_minutes_per_session_check CHECK (((lab_minutes_per_session >= 60) AND (lab_minutes_per_session <= 300))),
    CONSTRAINT prospectus_lab_sessions_per_week_check CHECK (((lab_sessions_per_week >= 1) AND (lab_sessions_per_week <= 3))),
    CONSTRAINT prospectus_lecture_minutes_per_session_check CHECK (((lecture_minutes_per_session >= 30) AND (lecture_minutes_per_session <= 240))),
    CONSTRAINT prospectus_lecture_sessions_per_week_check CHECK (((lecture_sessions_per_week >= 1) AND (lecture_sessions_per_week <= 5))),
    CONSTRAINT prospectus_year_level_check CHECK (((year_level >= 1) AND (year_level <= 6)))
);


--
-- Name: prospectus_pdf; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospectus_pdf (
    pdf_id bigint NOT NULL,
    department_id bigint NOT NULL,
    original_filename text NOT NULL,
    storage_path text NOT NULL,
    storage_bucket text DEFAULT 'prospectus-pdfs'::text NOT NULL,
    file_size_bytes bigint NOT NULL,
    page_count integer NOT NULL,
    page_width_pt numeric(10,4) NOT NULL,
    page_height_pt numeric(10,4) NOT NULL,
    notes text,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT prospectus_pdf_page_count_check CHECK ((page_count > 0))
);


--
-- Name: TABLE prospectus_pdf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.prospectus_pdf IS 'Uploaded prospectus PDFs. One per department typically; multiple allowed for audit.';


--
-- Name: prospectus_pdf_pdf_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.prospectus_pdf ALTER COLUMN pdf_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.prospectus_pdf_pdf_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: prospectus_pdf_table; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospectus_pdf_table (
    table_id bigint NOT NULL,
    pdf_id bigint NOT NULL,
    year_level smallint NOT NULL,
    semester text NOT NULL,
    label text,
    region_page_index integer NOT NULL,
    region_x_start_pt numeric(10,4) NOT NULL,
    region_x_end_pt numeric(10,4) NOT NULL,
    region_y_start_pt numeric(10,4) NOT NULL,
    region_y_end_pt numeric(10,4) NOT NULL,
    columns jsonb NOT NULL,
    rows jsonb NOT NULL,
    subject_count integer DEFAULT 0 NOT NULL,
    total_lec_units integer DEFAULT 0 NOT NULL,
    total_lab_units integer DEFAULT 0 NOT NULL,
    total_units integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prospectus_pdf_table_region_page_index_check CHECK ((region_page_index >= 0)),
    CONSTRAINT prospectus_pdf_table_semester_check CHECK ((semester = ANY (ARRAY['1st'::text, '2nd'::text, 'summer'::text]))),
    CONSTRAINT prospectus_pdf_table_year_level_check CHECK (((year_level >= 1) AND (year_level <= 6)))
);


--
-- Name: TABLE prospectus_pdf_table; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.prospectus_pdf_table IS 'User-drawn table mappings inside a prospectus PDF.';


--
-- Name: COLUMN prospectus_pdf_table.columns; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.prospectus_pdf_table.columns IS 'Array of {role: code|title|prereq|lec|lab|total, x_start_pt, x_end_pt}';


--
-- Name: COLUMN prospectus_pdf_table.rows; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.prospectus_pdf_table.rows IS 'Array of {row_id: string, y_top_pt, y_bottom_pt}';


--
-- Name: prospectus_pdf_table_table_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.prospectus_pdf_table ALTER COLUMN table_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.prospectus_pdf_table_table_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: prospectus_prospectus_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.prospectus ALTER COLUMN prospectus_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.prospectus_prospectus_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: room; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room (
    room_id bigint NOT NULL,
    room_number text NOT NULL,
    building text NOT NULL,
    room_type public.room_type DEFAULT 'lecture_room'::public.room_type NOT NULL,
    capacity integer,
    dept_id bigint,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT room_capacity_check CHECK ((capacity >= 0))
);


--
-- Name: room_preference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room_preference (
    preference_id bigint NOT NULL,
    room_id bigint NOT NULL,
    dept_id bigint NOT NULL,
    priority smallint DEFAULT 1 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT room_preference_priority_check CHECK (((priority >= 1) AND (priority <= 3)))
);


--
-- Name: room_preference_preference_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.room_preference ALTER COLUMN preference_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.room_preference_preference_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: room_room_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.room ALTER COLUMN room_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.room_room_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule (
    schedule_id bigint NOT NULL,
    term_id bigint NOT NULL,
    subject_id bigint NOT NULL,
    faculty_id bigint,
    room_id bigint,
    timeslot_id bigint,
    section text,
    load_type public.load_type,
    status public.schedule_status DEFAULT 'draft'::public.schedule_status NOT NULL,
    is_finalized boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['finalized'::public.schedule_status, 'published'::public.schedule_status]))) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    day_of_week public.day_of_week,
    start_time time without time zone,
    end_time time without time zone,
    remarks text,
    section_id bigint,
    twin_group_id bigint,
    dept_id bigint,
    flagged boolean DEFAULT false NOT NULL,
    flagged_by uuid,
    flagged_at timestamp with time zone,
    flag_reason text,
    external_faculty_name text,
    pending_faculty_request_id bigint,
    pending_faculty_dept_id bigint,
    external_room_name text,
    CONSTRAINT chk_schedule_faculty_or_external CHECK (((faculty_id IS NOT NULL) OR (external_faculty_name IS NOT NULL) OR (remarks IS NOT NULL))),
    CONSTRAINT chk_schedule_room_or_external CHECK (((room_id IS NOT NULL) OR (external_room_name IS NOT NULL) OR (remarks IS NOT NULL)))
);


--
-- Name: schedule_schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.schedule ALTER COLUMN schedule_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.schedule_schedule_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: schedule_unscheduled; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_unscheduled (
    unscheduled_id bigint NOT NULL,
    term_id bigint NOT NULL,
    section_id bigint,
    subject_id bigint NOT NULL,
    kind character varying NOT NULL,
    session_index integer DEFAULT 0 NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT schedule_unscheduled_kind_check CHECK (((kind)::text = ANY ((ARRAY['lecture'::character varying, 'lab'::character varying])::text[])))
);


--
-- Name: schedule_unscheduled_unscheduled_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.schedule_unscheduled ALTER COLUMN unscheduled_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.schedule_unscheduled_unscheduled_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: schedule_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_version (
    version_id bigint NOT NULL,
    term_id bigint NOT NULL,
    faculty_id bigint,
    version_number integer NOT NULL,
    snapshot jsonb,
    last_modified_at timestamp with time zone DEFAULT now() NOT NULL,
    finalized_by uuid,
    CONSTRAINT schedule_version_version_number_check CHECK ((version_number > 0))
);


--
-- Name: schedule_version_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.schedule_version ALTER COLUMN version_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.schedule_version_version_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: scheduling_setting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduling_setting (
    setting_key text NOT NULL,
    value jsonb NOT NULL,
    description text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: section; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.section (
    section_id bigint NOT NULL,
    section_code text NOT NULL,
    program_id bigint,
    year_level smallint,
    student_count integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT section_student_count_check CHECK ((student_count >= 0)),
    CONSTRAINT section_year_level_check CHECK (((year_level >= 1) AND (year_level <= 6)))
);


--
-- Name: section_section_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.section ALTER COLUMN section_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.section_section_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: subject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subject (
    subject_id bigint NOT NULL,
    subject_code text NOT NULL,
    title text NOT NULL,
    total_units numeric(4,1) NOT NULL,
    lecture_units numeric(4,1) DEFAULT 0 NOT NULL,
    lab_units numeric(4,1) DEFAULT 0 NOT NULL,
    required_room_type public.room_type,
    dept_id bigint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    source_dept text,
    is_minor boolean DEFAULT false NOT NULL,
    CONSTRAINT subject_lab_units_check CHECK ((lab_units >= (0)::numeric)),
    CONSTRAINT subject_lecture_units_check CHECK ((lecture_units >= (0)::numeric)),
    CONSTRAINT subject_total_units_check CHECK ((total_units >= (0)::numeric))
);


--
-- Name: subject_restriction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subject_restriction (
    restriction_id bigint NOT NULL,
    subject_id_1 bigint NOT NULL,
    subject_id_2 bigint NOT NULL,
    term_id bigint,
    warning_message text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subject_restriction_check CHECK ((subject_id_1 <> subject_id_2))
);


--
-- Name: subject_restriction_restriction_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subject_restriction ALTER COLUMN restriction_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subject_restriction_restriction_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: subject_subject_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.subject ALTER COLUMN subject_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.subject_subject_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: term; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.term (
    term_id bigint NOT NULL,
    term_name text NOT NULL,
    school_year text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    semester public.semester_type,
    CONSTRAINT term_check CHECK ((end_date >= start_date))
);


--
-- Name: term_term_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.term ALTER COLUMN term_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.term_term_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: time_slot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_slot (
    timeslot_id bigint NOT NULL,
    day_of_week public.day_of_week NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    duration interval GENERATED ALWAYS AS ((end_time - start_time)) STORED,
    CONSTRAINT time_slot_check CHECK ((end_time > start_time))
);


--
-- Name: time_slot_timeslot_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.time_slot ALTER COLUMN timeslot_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.time_slot_timeslot_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_notification_setting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_setting (
    user_id uuid NOT NULL,
    trigger_key text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    user_id uuid NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    employee_id text,
    wmsu_id text,
    role public.user_role DEFAULT 'viewer'::public.user_role NOT NULL,
    dept_id bigint,
    is_active boolean DEFAULT true NOT NULL,
    faculty_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_trail audit_trail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_trail
    ADD CONSTRAINT audit_trail_pkey PRIMARY KEY (audit_id);


--
-- Name: auto_generate_lock auto_generate_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_generate_lock
    ADD CONSTRAINT auto_generate_lock_pkey PRIMARY KEY (term_id);


--
-- Name: conversation_member conversation_member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_member
    ADD CONSTRAINT conversation_member_pkey PRIMARY KEY (conversation_id, user_id);


--
-- Name: conversation conversation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT conversation_pkey PRIMARY KEY (conversation_id);


--
-- Name: cross_department_request cross_department_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cross_department_request
    ADD CONSTRAINT cross_department_request_pkey PRIMARY KEY (request_id);


--
-- Name: department department_dept_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department
    ADD CONSTRAINT department_dept_code_key UNIQUE (dept_code);


--
-- Name: department department_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department
    ADD CONSTRAINT department_pkey PRIMARY KEY (dept_id);


--
-- Name: designation designation_designation_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designation
    ADD CONSTRAINT designation_designation_name_key UNIQUE (designation_name);


--
-- Name: designation designation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designation
    ADD CONSTRAINT designation_pkey PRIMARY KEY (designation_id);


--
-- Name: faculty_commitment faculty_commitment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_commitment
    ADD CONSTRAINT faculty_commitment_pkey PRIMARY KEY (commitment_id);


--
-- Name: faculty_commitment faculty_commitment_source_system_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_commitment
    ADD CONSTRAINT faculty_commitment_source_system_external_id_key UNIQUE (source_system, external_id);


--
-- Name: faculty faculty_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty
    ADD CONSTRAINT faculty_email_key UNIQUE (email);


--
-- Name: faculty faculty_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty
    ADD CONSTRAINT faculty_employee_id_key UNIQUE (employee_id);


--
-- Name: faculty faculty_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty
    ADD CONSTRAINT faculty_pkey PRIMARY KEY (faculty_id);


--
-- Name: faculty_preference faculty_preference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_preference
    ADD CONSTRAINT faculty_preference_pkey PRIMARY KEY (preference_id);


--
-- Name: faculty_qualification faculty_qualification_faculty_id_subject_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_qualification
    ADD CONSTRAINT faculty_qualification_faculty_id_subject_id_key UNIQUE (faculty_id, subject_id);


--
-- Name: faculty_qualification faculty_qualification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_qualification
    ADD CONSTRAINT faculty_qualification_pkey PRIMARY KEY (qual_id);


--
-- Name: faculty_request faculty_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_request
    ADD CONSTRAINT faculty_request_pkey PRIMARY KEY (request_id);


--
-- Name: faculty_unavailability faculty_unavailability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_unavailability
    ADD CONSTRAINT faculty_unavailability_pkey PRIMARY KEY (unavailability_id);


--
-- Name: faculty faculty_wmsu_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty
    ADD CONSTRAINT faculty_wmsu_id_key UNIQUE (wmsu_id);


--
-- Name: message message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_pkey PRIMARY KEY (message_id);


--
-- Name: minor_subject_schedule minor_subject_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.minor_subject_schedule
    ADD CONSTRAINT minor_subject_schedule_pkey PRIMARY KEY (minor_id);


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (notification_id);


--
-- Name: program program_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program
    ADD CONSTRAINT program_pkey PRIMARY KEY (program_id);


--
-- Name: program program_program_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program
    ADD CONSTRAINT program_program_code_key UNIQUE (program_code);


--
-- Name: prospectus_pdf prospectus_pdf_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospectus_pdf
    ADD CONSTRAINT prospectus_pdf_pkey PRIMARY KEY (pdf_id);


--
-- Name: prospectus_pdf_table prospectus_pdf_table_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospectus_pdf_table
    ADD CONSTRAINT prospectus_pdf_table_pkey PRIMARY KEY (table_id);


--
-- Name: prospectus prospectus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospectus
    ADD CONSTRAINT prospectus_pkey PRIMARY KEY (prospectus_id);


--
-- Name: prospectus prospectus_program_id_subject_id_year_level_semester_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospectus
    ADD CONSTRAINT prospectus_program_id_subject_id_year_level_semester_key UNIQUE (program_id, subject_id, year_level, semester);


--
-- Name: room room_building_room_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room
    ADD CONSTRAINT room_building_room_number_key UNIQUE (building, room_number);


--
-- Name: room room_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room
    ADD CONSTRAINT room_pkey PRIMARY KEY (room_id);


--
-- Name: room_preference room_preference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_preference
    ADD CONSTRAINT room_preference_pkey PRIMARY KEY (preference_id);


--
-- Name: room_preference room_preference_room_id_dept_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_preference
    ADD CONSTRAINT room_preference_room_id_dept_id_key UNIQUE (room_id, dept_id);


--
-- Name: schedule schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_pkey PRIMARY KEY (schedule_id);


--
-- Name: schedule_unscheduled schedule_unscheduled_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_unscheduled
    ADD CONSTRAINT schedule_unscheduled_pkey PRIMARY KEY (unscheduled_id);


--
-- Name: schedule_version schedule_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_version
    ADD CONSTRAINT schedule_version_pkey PRIMARY KEY (version_id);


--
-- Name: schedule_version schedule_version_term_id_faculty_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_version
    ADD CONSTRAINT schedule_version_term_id_faculty_id_version_number_key UNIQUE (term_id, faculty_id, version_number);


--
-- Name: scheduling_setting scheduling_setting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduling_setting
    ADD CONSTRAINT scheduling_setting_pkey PRIMARY KEY (setting_key);


--
-- Name: section section_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section
    ADD CONSTRAINT section_pkey PRIMARY KEY (section_id);


--
-- Name: section section_section_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section
    ADD CONSTRAINT section_section_code_key UNIQUE (section_code);


--
-- Name: subject subject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject
    ADD CONSTRAINT subject_pkey PRIMARY KEY (subject_id);


--
-- Name: subject_restriction subject_restriction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_restriction
    ADD CONSTRAINT subject_restriction_pkey PRIMARY KEY (restriction_id);


--
-- Name: subject subject_subject_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject
    ADD CONSTRAINT subject_subject_code_key UNIQUE (subject_code);


--
-- Name: term term_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term
    ADD CONSTRAINT term_pkey PRIMARY KEY (term_id);


--
-- Name: term term_term_name_school_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term
    ADD CONSTRAINT term_term_name_school_year_key UNIQUE (term_name, school_year);


--
-- Name: time_slot time_slot_day_of_week_start_time_end_time_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_slot
    ADD CONSTRAINT time_slot_day_of_week_start_time_end_time_key UNIQUE (day_of_week, start_time, end_time);


--
-- Name: time_slot time_slot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_slot
    ADD CONSTRAINT time_slot_pkey PRIMARY KEY (timeslot_id);


--
-- Name: prospectus_pdf_table uq_prospectus_pdf_table_ys; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospectus_pdf_table
    ADD CONSTRAINT uq_prospectus_pdf_table_ys UNIQUE (pdf_id, year_level, semester);


--
-- Name: user_notification_setting user_notification_setting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_setting
    ADD CONSTRAINT user_notification_setting_pkey PRIMARY KEY (user_id, trigger_key);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_faculty_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_faculty_id_key UNIQUE (faculty_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: audit_trail_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_trail_timestamp_idx ON public.audit_trail USING btree ("timestamp" DESC);


--
-- Name: audit_trail_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_trail_user_id_idx ON public.audit_trail USING btree (user_id);


--
-- Name: faculty_commitment_faculty_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_commitment_faculty_id_idx ON public.faculty_commitment USING btree (faculty_id);


--
-- Name: faculty_commitment_term_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_commitment_term_id_idx ON public.faculty_commitment USING btree (term_id);


--
-- Name: faculty_dept_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_dept_id_idx ON public.faculty USING btree (dept_id);


--
-- Name: faculty_designation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_designation_id_idx ON public.faculty USING btree (designation_id);


--
-- Name: faculty_preference_faculty_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_preference_faculty_id_idx ON public.faculty_preference USING btree (faculty_id);


--
-- Name: faculty_qualification_faculty_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_qualification_faculty_id_idx ON public.faculty_qualification USING btree (faculty_id);


--
-- Name: faculty_qualification_subject_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_qualification_subject_id_idx ON public.faculty_qualification USING btree (subject_id);


--
-- Name: faculty_request_faculty_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_request_faculty_id_idx ON public.faculty_request USING btree (faculty_id);


--
-- Name: faculty_request_requesting_dept_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_request_requesting_dept_id_idx ON public.faculty_request USING btree (requesting_dept_id);


--
-- Name: faculty_request_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_request_status_idx ON public.faculty_request USING btree (status) WHERE (status = 'pending'::public.faculty_request_status);


--
-- Name: faculty_request_subject_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_request_subject_id_idx ON public.faculty_request USING btree (subject_id);


--
-- Name: faculty_request_target_dept_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_request_target_dept_id_idx ON public.faculty_request USING btree (target_dept_id);


--
-- Name: faculty_request_term_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX faculty_request_term_id_idx ON public.faculty_request USING btree (term_id);


--
-- Name: idx_auto_generate_lock_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auto_generate_lock_expires ON public.auto_generate_lock USING btree (expires_at);


--
-- Name: idx_conversation_member_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_member_user ON public.conversation_member USING btree (user_id);


--
-- Name: idx_faculty_unavailability_faculty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faculty_unavailability_faculty ON public.faculty_unavailability USING btree (faculty_id);


--
-- Name: idx_faculty_unavailability_faculty_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faculty_unavailability_faculty_day ON public.faculty_unavailability USING btree (faculty_id, day_of_week);


--
-- Name: idx_message_conversation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_conversation_created ON public.message USING btree (conversation_id, created_at DESC);


--
-- Name: idx_notification_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_created_at ON public.notification USING btree (created_at);


--
-- Name: idx_notification_recipient_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_recipient_category ON public.notification USING btree (recipient_id, category);


--
-- Name: idx_notification_recipient_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_recipient_created ON public.notification USING btree (recipient_id, created_at DESC);


--
-- Name: idx_notification_recipient_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_recipient_unread ON public.notification USING btree (recipient_id, created_at DESC) WHERE (is_read = false);


--
-- Name: idx_prospectus_pdf_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prospectus_pdf_dept ON public.prospectus_pdf USING btree (department_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_prospectus_pdf_table_pdf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prospectus_pdf_table_pdf ON public.prospectus_pdf_table USING btree (pdf_id);


--
-- Name: idx_prospectus_pdf_uploaded_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prospectus_pdf_uploaded_by ON public.prospectus_pdf USING btree (uploaded_by) WHERE (deleted_at IS NULL);


--
-- Name: idx_room_preference_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_room_preference_dept ON public.room_preference USING btree (dept_id);


--
-- Name: idx_room_preference_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_room_preference_room ON public.room_preference USING btree (room_id);


--
-- Name: idx_schedule_external_faculty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_external_faculty ON public.schedule USING btree (external_faculty_name) WHERE (external_faculty_name IS NOT NULL);


--
-- Name: idx_schedule_external_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_external_room ON public.schedule USING btree (external_room_name) WHERE (external_room_name IS NOT NULL);


--
-- Name: idx_schedule_flagged; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_flagged ON public.schedule USING btree (flagged) WHERE (flagged = true);


--
-- Name: idx_schedule_pending_faculty_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_pending_faculty_dept ON public.schedule USING btree (pending_faculty_dept_id) WHERE (pending_faculty_dept_id IS NOT NULL);


--
-- Name: idx_schedule_pending_faculty_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_pending_faculty_request ON public.schedule USING btree (pending_faculty_request_id) WHERE (pending_faculty_request_id IS NOT NULL);


--
-- Name: idx_schedule_unscheduled_term; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_unscheduled_term ON public.schedule_unscheduled USING btree (term_id);


--
-- Name: idx_schedule_version_term; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_version_term ON public.schedule_version USING btree (term_id, version_number DESC);


--
-- Name: idx_subject_is_minor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subject_is_minor ON public.subject USING btree (is_minor) WHERE (is_minor = true);


--
-- Name: minor_subject_schedule_term_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX minor_subject_schedule_term_id_idx ON public.minor_subject_schedule USING btree (term_id);


--
-- Name: program_dept_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX program_dept_id_idx ON public.program USING btree (dept_id);


--
-- Name: prospectus_program_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospectus_program_id_idx ON public.prospectus USING btree (program_id);


--
-- Name: prospectus_subject_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospectus_subject_id_idx ON public.prospectus USING btree (subject_id);


--
-- Name: room_dept_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX room_dept_id_idx ON public.room USING btree (dept_id);


--
-- Name: schedule_faculty_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedule_faculty_id_idx ON public.schedule USING btree (faculty_id);


--
-- Name: schedule_room_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedule_room_id_idx ON public.schedule USING btree (room_id);


--
-- Name: schedule_section_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedule_section_id_idx ON public.schedule USING btree (section_id);


--
-- Name: schedule_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedule_status_idx ON public.schedule USING btree (status);


--
-- Name: schedule_subject_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedule_subject_id_idx ON public.schedule USING btree (subject_id);


--
-- Name: schedule_term_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedule_term_id_idx ON public.schedule USING btree (term_id);


--
-- Name: schedule_timeslot_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedule_timeslot_id_idx ON public.schedule USING btree (timeslot_id);


--
-- Name: schedule_version_faculty_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedule_version_faculty_id_idx ON public.schedule_version USING btree (faculty_id);


--
-- Name: schedule_version_finalized_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedule_version_finalized_by_idx ON public.schedule_version USING btree (finalized_by);


--
-- Name: schedule_version_term_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedule_version_term_id_idx ON public.schedule_version USING btree (term_id);


--
-- Name: section_program_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX section_program_id_idx ON public.section USING btree (program_id);


--
-- Name: section_section_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX section_section_code_idx ON public.section USING btree (section_code) WHERE is_active;


--
-- Name: subject_dept_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subject_dept_id_idx ON public.subject USING btree (dept_id);


--
-- Name: subject_restriction_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subject_restriction_created_by_idx ON public.subject_restriction USING btree (created_by);


--
-- Name: subject_restriction_subject_id_1_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subject_restriction_subject_id_1_idx ON public.subject_restriction USING btree (subject_id_1);


--
-- Name: subject_restriction_subject_id_2_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subject_restriction_subject_id_2_idx ON public.subject_restriction USING btree (subject_id_2);


--
-- Name: subject_restriction_term_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subject_restriction_term_id_idx ON public.subject_restriction USING btree (term_id);


--
-- Name: uq_faculty_unavailability_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_faculty_unavailability_external ON public.faculty_unavailability USING btree (faculty_id, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: uq_schedule_faculty_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_schedule_faculty_slot ON public.schedule USING btree (term_id, faculty_id, timeslot_id) WHERE ((faculty_id IS NOT NULL) AND (timeslot_id IS NOT NULL));


--
-- Name: uq_schedule_room_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_schedule_room_slot ON public.schedule USING btree (term_id, room_id, timeslot_id) WHERE ((room_id IS NOT NULL) AND (timeslot_id IS NOT NULL));


--
-- Name: uq_schedule_version_term_wide; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_schedule_version_term_wide ON public.schedule_version USING btree (term_id, version_number) WHERE (faculty_id IS NULL);


--
-- Name: uq_term_single_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_term_single_active ON public.term USING btree (is_active) WHERE is_active;


--
-- Name: users_dept_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_dept_id_idx ON public.users USING btree (dept_id);


--
-- Name: faculty_request trg_faculty_request_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_faculty_request_updated_at BEFORE UPDATE ON public.faculty_request FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: room_preference trg_prevent_owned_room_preference; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_owned_room_preference BEFORE INSERT OR UPDATE ON public.room_preference FOR EACH ROW EXECUTE FUNCTION public.prevent_owned_room_preference();


--
-- Name: prospectus_pdf_table trg_prospectus_pdf_table_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prospectus_pdf_table_touch BEFORE UPDATE ON public.prospectus_pdf_table FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: prospectus_pdf trg_prospectus_pdf_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prospectus_pdf_touch BEFORE UPDATE ON public.prospectus_pdf FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: room_preference trg_room_preference_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_room_preference_updated_at BEFORE UPDATE ON public.room_preference FOR EACH ROW EXECUTE FUNCTION public.update_room_preference_timestamp();


--
-- Name: schedule trg_schedule_status_flow; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_schedule_status_flow BEFORE UPDATE OF status ON public.schedule FOR EACH ROW EXECUTE FUNCTION public.enforce_schedule_status_flow();


--
-- Name: schedule trg_schedule_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_schedule_updated_at BEFORE UPDATE ON public.schedule FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: scheduling_setting trg_scheduling_setting_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_scheduling_setting_updated_at BEFORE UPDATE ON public.scheduling_setting FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: section trg_section_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_section_updated_at BEFORE UPDATE ON public.section FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: audit_trail audit_trail_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_trail
    ADD CONSTRAINT audit_trail_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: auto_generate_lock auto_generate_lock_acquired_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_generate_lock
    ADD CONSTRAINT auto_generate_lock_acquired_by_fkey FOREIGN KEY (acquired_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: auto_generate_lock auto_generate_lock_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_generate_lock
    ADD CONSTRAINT auto_generate_lock_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id) ON DELETE CASCADE;


--
-- Name: conversation_member conversation_member_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_member
    ADD CONSTRAINT conversation_member_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversation(conversation_id) ON DELETE CASCADE;


--
-- Name: conversation_member conversation_member_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_member
    ADD CONSTRAINT conversation_member_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: cross_department_request cross_department_request_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cross_department_request
    ADD CONSTRAINT cross_department_request_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(user_id);


--
-- Name: cross_department_request cross_department_request_faculty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cross_department_request
    ADD CONSTRAINT cross_department_request_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id);


--
-- Name: cross_department_request cross_department_request_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cross_department_request
    ADD CONSTRAINT cross_department_request_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(user_id);


--
-- Name: cross_department_request cross_department_request_requesting_dept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cross_department_request
    ADD CONSTRAINT cross_department_request_requesting_dept_id_fkey FOREIGN KEY (requesting_dept_id) REFERENCES public.department(dept_id);


--
-- Name: cross_department_request cross_department_request_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cross_department_request
    ADD CONSTRAINT cross_department_request_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(subject_id);


--
-- Name: cross_department_request cross_department_request_target_dept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cross_department_request
    ADD CONSTRAINT cross_department_request_target_dept_id_fkey FOREIGN KEY (target_dept_id) REFERENCES public.department(dept_id);


--
-- Name: cross_department_request cross_department_request_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cross_department_request
    ADD CONSTRAINT cross_department_request_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id);


--
-- Name: cross_department_request cross_department_request_timeslot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cross_department_request
    ADD CONSTRAINT cross_department_request_timeslot_id_fkey FOREIGN KEY (timeslot_id) REFERENCES public.time_slot(timeslot_id);


--
-- Name: faculty_commitment faculty_commitment_faculty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_commitment
    ADD CONSTRAINT faculty_commitment_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: faculty_commitment faculty_commitment_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_commitment
    ADD CONSTRAINT faculty_commitment_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: faculty faculty_dept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty
    ADD CONSTRAINT faculty_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.department(dept_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: faculty faculty_designation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty
    ADD CONSTRAINT faculty_designation_id_fkey FOREIGN KEY (designation_id) REFERENCES public.designation(designation_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: faculty_preference faculty_preference_faculty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_preference
    ADD CONSTRAINT faculty_preference_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: faculty_qualification faculty_qualification_faculty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_qualification
    ADD CONSTRAINT faculty_qualification_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: faculty_qualification faculty_qualification_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_qualification
    ADD CONSTRAINT faculty_qualification_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(subject_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: faculty_request faculty_request_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_request
    ADD CONSTRAINT faculty_request_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: faculty_request faculty_request_faculty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_request
    ADD CONSTRAINT faculty_request_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: faculty_request faculty_request_requesting_dept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_request
    ADD CONSTRAINT faculty_request_requesting_dept_id_fkey FOREIGN KEY (requesting_dept_id) REFERENCES public.department(dept_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: faculty_request faculty_request_responded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_request
    ADD CONSTRAINT faculty_request_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: faculty_request faculty_request_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_request
    ADD CONSTRAINT faculty_request_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(subject_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: faculty_request faculty_request_target_dept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_request
    ADD CONSTRAINT faculty_request_target_dept_id_fkey FOREIGN KEY (target_dept_id) REFERENCES public.department(dept_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: faculty_request faculty_request_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_request
    ADD CONSTRAINT faculty_request_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: faculty_unavailability faculty_unavailability_faculty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_unavailability
    ADD CONSTRAINT faculty_unavailability_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id) ON DELETE CASCADE;


--
-- Name: faculty_unavailability faculty_unavailability_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faculty_unavailability
    ADD CONSTRAINT faculty_unavailability_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id) ON DELETE CASCADE;


--
-- Name: message message_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversation(conversation_id) ON DELETE CASCADE;


--
-- Name: message message_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: minor_subject_schedule minor_subject_schedule_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.minor_subject_schedule
    ADD CONSTRAINT minor_subject_schedule_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notification notification_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: program program_dept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program
    ADD CONSTRAINT program_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.department(dept_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: prospectus_pdf prospectus_pdf_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospectus_pdf
    ADD CONSTRAINT prospectus_pdf_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.department(dept_id) ON DELETE CASCADE;


--
-- Name: prospectus_pdf_table prospectus_pdf_table_pdf_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospectus_pdf_table
    ADD CONSTRAINT prospectus_pdf_table_pdf_id_fkey FOREIGN KEY (pdf_id) REFERENCES public.prospectus_pdf(pdf_id) ON DELETE CASCADE;


--
-- Name: prospectus_pdf prospectus_pdf_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospectus_pdf
    ADD CONSTRAINT prospectus_pdf_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: prospectus prospectus_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospectus
    ADD CONSTRAINT prospectus_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.program(program_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: prospectus prospectus_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospectus
    ADD CONSTRAINT prospectus_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(subject_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: room room_dept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room
    ADD CONSTRAINT room_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.department(dept_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: room_preference room_preference_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_preference
    ADD CONSTRAINT room_preference_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: room_preference room_preference_dept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_preference
    ADD CONSTRAINT room_preference_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.department(dept_id) ON DELETE CASCADE;


--
-- Name: room_preference room_preference_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_preference
    ADD CONSTRAINT room_preference_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.room(room_id) ON DELETE CASCADE;


--
-- Name: schedule schedule_dept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.department(dept_id);


--
-- Name: schedule schedule_faculty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: schedule schedule_flagged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_flagged_by_fkey FOREIGN KEY (flagged_by) REFERENCES public.users(user_id);


--
-- Name: schedule schedule_pending_faculty_dept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_pending_faculty_dept_id_fkey FOREIGN KEY (pending_faculty_dept_id) REFERENCES public.department(dept_id) ON DELETE SET NULL;


--
-- Name: schedule schedule_pending_faculty_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_pending_faculty_request_id_fkey FOREIGN KEY (pending_faculty_request_id) REFERENCES public.faculty_request(request_id) ON DELETE SET NULL;


--
-- Name: schedule schedule_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.room(room_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: schedule schedule_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.section(section_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: schedule schedule_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(subject_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: schedule schedule_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: schedule schedule_timeslot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule
    ADD CONSTRAINT schedule_timeslot_id_fkey FOREIGN KEY (timeslot_id) REFERENCES public.time_slot(timeslot_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: schedule_unscheduled schedule_unscheduled_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_unscheduled
    ADD CONSTRAINT schedule_unscheduled_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.section(section_id) ON DELETE CASCADE;


--
-- Name: schedule_unscheduled schedule_unscheduled_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_unscheduled
    ADD CONSTRAINT schedule_unscheduled_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(subject_id) ON DELETE CASCADE;


--
-- Name: schedule_unscheduled schedule_unscheduled_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_unscheduled
    ADD CONSTRAINT schedule_unscheduled_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id) ON DELETE CASCADE;


--
-- Name: schedule_version schedule_version_faculty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_version
    ADD CONSTRAINT schedule_version_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: schedule_version schedule_version_finalized_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_version
    ADD CONSTRAINT schedule_version_finalized_by_fkey FOREIGN KEY (finalized_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: schedule_version schedule_version_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_version
    ADD CONSTRAINT schedule_version_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: section section_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.section
    ADD CONSTRAINT section_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.program(program_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: subject subject_dept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject
    ADD CONSTRAINT subject_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.department(dept_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: subject_restriction subject_restriction_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_restriction
    ADD CONSTRAINT subject_restriction_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: subject_restriction subject_restriction_subject_id_1_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_restriction
    ADD CONSTRAINT subject_restriction_subject_id_1_fkey FOREIGN KEY (subject_id_1) REFERENCES public.subject(subject_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subject_restriction subject_restriction_subject_id_2_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_restriction
    ADD CONSTRAINT subject_restriction_subject_id_2_fkey FOREIGN KEY (subject_id_2) REFERENCES public.subject(subject_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subject_restriction subject_restriction_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_restriction
    ADD CONSTRAINT subject_restriction_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_notification_setting user_notification_setting_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_setting
    ADD CONSTRAINT user_notification_setting_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: users users_dept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.department(dept_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: users users_faculty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: users users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: audit_trail audit_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_insert_own ON public.audit_trail FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: audit_trail audit_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_read ON public.audit_trail FOR SELECT TO authenticated USING ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role])));


--
-- Name: audit_trail; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;

--
-- Name: auto_generate_lock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auto_generate_lock ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_member; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_member ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_member conversation_member_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_member_select_own ON public.conversation_member FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: conversation_member conversation_member_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_member_update_own ON public.conversation_member FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: conversation conversation_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_select_member ON public.conversation FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.conversation_member cm
  WHERE ((cm.conversation_id = conversation.conversation_id) AND (cm.user_id = auth.uid())))));


--
-- Name: cross_department_request; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cross_department_request ENABLE ROW LEVEL SECURITY;

--
-- Name: department; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.department ENABLE ROW LEVEL SECURITY;

--
-- Name: designation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.designation ENABLE ROW LEVEL SECURITY;

--
-- Name: faculty; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faculty ENABLE ROW LEVEL SECURITY;

--
-- Name: faculty_commitment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faculty_commitment ENABLE ROW LEVEL SECURITY;

--
-- Name: faculty_preference; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faculty_preference ENABLE ROW LEVEL SECURITY;

--
-- Name: faculty_qualification; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faculty_qualification ENABLE ROW LEVEL SECURITY;

--
-- Name: faculty_request; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faculty_request ENABLE ROW LEVEL SECURITY;

--
-- Name: faculty_request faculty_request_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY faculty_request_insert ON public.faculty_request FOR INSERT TO authenticated WITH CHECK (((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role])) OR ((public.current_user_role() = 'department_head'::public.user_role) AND (requesting_dept_id = public.current_user_dept()))));


--
-- Name: faculty_request faculty_request_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY faculty_request_read ON public.faculty_request FOR SELECT TO authenticated USING (((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role])) OR (public.current_user_role() = 'department_head'::public.user_role)));


--
-- Name: faculty_request faculty_request_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY faculty_request_update ON public.faculty_request FOR UPDATE TO authenticated USING (((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role])) OR ((public.current_user_role() = 'department_head'::public.user_role) AND ((target_dept_id = public.current_user_dept()) OR (requesting_dept_id = public.current_user_dept())))));


--
-- Name: faculty_unavailability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faculty_unavailability ENABLE ROW LEVEL SECURITY;

--
-- Name: message; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message ENABLE ROW LEVEL SECURITY;

--
-- Name: message message_insert_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_insert_member ON public.message FOR INSERT WITH CHECK (((sender_id = auth.uid()) AND (conversation_id IN ( SELECT conversation_member.conversation_id
   FROM public.conversation_member
  WHERE (conversation_member.user_id = auth.uid())))));


--
-- Name: message message_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_select_member ON public.message FOR SELECT USING ((conversation_id IN ( SELECT conversation_member.conversation_id
   FROM public.conversation_member
  WHERE (conversation_member.user_id = auth.uid()))));


--
-- Name: minor_subject_schedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.minor_subject_schedule ENABLE ROW LEVEL SECURITY;

--
-- Name: notification; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification ENABLE ROW LEVEL SECURITY;

--
-- Name: program; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.program ENABLE ROW LEVEL SECURITY;

--
-- Name: prospectus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospectus ENABLE ROW LEVEL SECURITY;

--
-- Name: prospectus_pdf; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospectus_pdf ENABLE ROW LEVEL SECURITY;

--
-- Name: prospectus_pdf_table; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospectus_pdf_table ENABLE ROW LEVEL SECURITY;

--
-- Name: department read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.department FOR SELECT TO authenticated USING (true);


--
-- Name: designation read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.designation FOR SELECT TO authenticated USING (true);


--
-- Name: faculty read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.faculty FOR SELECT TO authenticated USING (true);


--
-- Name: faculty_commitment read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.faculty_commitment FOR SELECT TO authenticated USING (true);


--
-- Name: faculty_preference read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.faculty_preference FOR SELECT TO authenticated USING (true);


--
-- Name: faculty_qualification read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.faculty_qualification FOR SELECT TO authenticated USING (true);


--
-- Name: minor_subject_schedule read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.minor_subject_schedule FOR SELECT TO authenticated USING (true);


--
-- Name: program read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.program FOR SELECT TO authenticated USING (true);


--
-- Name: prospectus read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.prospectus FOR SELECT TO authenticated USING (true);


--
-- Name: room read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.room FOR SELECT TO authenticated USING (true);


--
-- Name: schedule_version read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.schedule_version FOR SELECT TO authenticated USING (true);


--
-- Name: scheduling_setting read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.scheduling_setting FOR SELECT TO authenticated USING (true);


--
-- Name: subject read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.subject FOR SELECT TO authenticated USING (true);


--
-- Name: subject_restriction read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.subject_restriction FOR SELECT TO authenticated USING (true);


--
-- Name: term read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.term FOR SELECT TO authenticated USING (true);


--
-- Name: time_slot read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_authenticated ON public.time_slot FOR SELECT TO authenticated USING (true);


--
-- Name: room; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.room ENABLE ROW LEVEL SECURITY;

--
-- Name: room_preference; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.room_preference ENABLE ROW LEVEL SECURITY;

--
-- Name: schedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedule ENABLE ROW LEVEL SECURITY;

--
-- Name: schedule schedule_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schedule_read ON public.schedule FOR SELECT TO authenticated USING (true);


--
-- Name: schedule_unscheduled; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedule_unscheduled ENABLE ROW LEVEL SECURITY;

--
-- Name: schedule_version; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedule_version ENABLE ROW LEVEL SECURITY;

--
-- Name: schedule schedule_write_dean_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schedule_write_dean_admin ON public.schedule TO authenticated USING ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role]))) WITH CHECK ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role])));


--
-- Name: schedule schedule_write_dept_head; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schedule_write_dept_head ON public.schedule TO authenticated USING (((public.current_user_role() = 'department_head'::public.user_role) AND (status <> 'published'::public.schedule_status) AND (EXISTS ( SELECT 1
   FROM public.subject s
  WHERE ((s.subject_id = schedule.subject_id) AND (s.dept_id = public.current_user_dept())))))) WITH CHECK (((public.current_user_role() = 'department_head'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.subject s
  WHERE ((s.subject_id = schedule.subject_id) AND (s.dept_id = public.current_user_dept()))))));


--
-- Name: scheduling_setting; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scheduling_setting ENABLE ROW LEVEL SECURITY;

--
-- Name: section; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.section ENABLE ROW LEVEL SECURITY;

--
-- Name: section section_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY section_read ON public.section FOR SELECT TO authenticated USING (true);


--
-- Name: section section_write_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY section_write_admin ON public.section TO authenticated USING ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role, 'department_head'::public.user_role]))) WITH CHECK ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role, 'department_head'::public.user_role])));


--
-- Name: subject; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subject ENABLE ROW LEVEL SECURITY;

--
-- Name: subject_restriction; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subject_restriction ENABLE ROW LEVEL SECURITY;

--
-- Name: term; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.term ENABLE ROW LEVEL SECURITY;

--
-- Name: time_slot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.time_slot ENABLE ROW LEVEL SECURITY;

--
-- Name: user_notification_setting; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_notification_setting ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_admin_write ON public.users TO authenticated USING ((public.current_user_role() = 'administrator'::public.user_role)) WITH CHECK ((public.current_user_role() = 'administrator'::public.user_role));


--
-- Name: users users_select_self_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select_self_or_admin ON public.users FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (public.current_user_role() = 'administrator'::public.user_role)));


--
-- Name: department write_administrator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_administrator ON public.department TO authenticated USING ((public.current_user_role() = 'administrator'::public.user_role)) WITH CHECK ((public.current_user_role() = 'administrator'::public.user_role));


--
-- Name: designation write_administrator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_administrator ON public.designation TO authenticated USING ((public.current_user_role() = 'administrator'::public.user_role)) WITH CHECK ((public.current_user_role() = 'administrator'::public.user_role));


--
-- Name: faculty write_administrator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_administrator ON public.faculty TO authenticated USING ((public.current_user_role() = 'administrator'::public.user_role)) WITH CHECK ((public.current_user_role() = 'administrator'::public.user_role));


--
-- Name: minor_subject_schedule write_administrator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_administrator ON public.minor_subject_schedule TO authenticated USING ((public.current_user_role() = 'administrator'::public.user_role)) WITH CHECK ((public.current_user_role() = 'administrator'::public.user_role));


--
-- Name: program write_administrator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_administrator ON public.program TO authenticated USING ((public.current_user_role() = 'administrator'::public.user_role)) WITH CHECK ((public.current_user_role() = 'administrator'::public.user_role));


--
-- Name: prospectus write_administrator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_administrator ON public.prospectus TO authenticated USING ((public.current_user_role() = 'administrator'::public.user_role)) WITH CHECK ((public.current_user_role() = 'administrator'::public.user_role));


--
-- Name: room write_administrator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_administrator ON public.room TO authenticated USING ((public.current_user_role() = 'administrator'::public.user_role)) WITH CHECK ((public.current_user_role() = 'administrator'::public.user_role));


--
-- Name: scheduling_setting write_administrator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_administrator ON public.scheduling_setting TO authenticated USING ((public.current_user_role() = 'administrator'::public.user_role)) WITH CHECK ((public.current_user_role() = 'administrator'::public.user_role));


--
-- Name: subject write_administrator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_administrator ON public.subject TO authenticated USING ((public.current_user_role() = 'administrator'::public.user_role)) WITH CHECK ((public.current_user_role() = 'administrator'::public.user_role));


--
-- Name: term write_administrator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_administrator ON public.term TO authenticated USING ((public.current_user_role() = 'administrator'::public.user_role)) WITH CHECK ((public.current_user_role() = 'administrator'::public.user_role));


--
-- Name: time_slot write_administrator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_administrator ON public.time_slot TO authenticated USING ((public.current_user_role() = 'administrator'::public.user_role)) WITH CHECK ((public.current_user_role() = 'administrator'::public.user_role));


--
-- Name: faculty_commitment write_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_staff ON public.faculty_commitment TO authenticated USING ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role, 'department_head'::public.user_role]))) WITH CHECK ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role, 'department_head'::public.user_role])));


--
-- Name: faculty_preference write_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_staff ON public.faculty_preference TO authenticated USING ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role, 'department_head'::public.user_role]))) WITH CHECK ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role, 'department_head'::public.user_role])));


--
-- Name: faculty_qualification write_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_staff ON public.faculty_qualification TO authenticated USING ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role, 'department_head'::public.user_role]))) WITH CHECK ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role, 'department_head'::public.user_role])));


--
-- Name: schedule_version write_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_staff ON public.schedule_version TO authenticated USING ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role, 'department_head'::public.user_role]))) WITH CHECK ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role, 'department_head'::public.user_role])));


--
-- Name: subject_restriction write_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY write_staff ON public.subject_restriction TO authenticated USING ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role, 'department_head'::public.user_role]))) WITH CHECK ((public.current_user_role() = ANY (ARRAY['administrator'::public.user_role, 'college_dean'::public.user_role, 'department_head'::public.user_role])));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION auto_generate_lock_key(p_term_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auto_generate_lock_key(p_term_id text) TO anon;
GRANT ALL ON FUNCTION public.auto_generate_lock_key(p_term_id text) TO authenticated;
GRANT ALL ON FUNCTION public.auto_generate_lock_key(p_term_id text) TO service_role;


--
-- Name: FUNCTION cleanup_expired_auto_generate_locks(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_expired_auto_generate_locks() TO anon;
GRANT ALL ON FUNCTION public.cleanup_expired_auto_generate_locks() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_expired_auto_generate_locks() TO service_role;


--
-- Name: FUNCTION current_user_dept(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_user_dept() TO anon;
GRANT ALL ON FUNCTION public.current_user_dept() TO authenticated;
GRANT ALL ON FUNCTION public.current_user_dept() TO service_role;


--
-- Name: FUNCTION current_user_role(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_user_role() TO anon;
GRANT ALL ON FUNCTION public.current_user_role() TO authenticated;
GRANT ALL ON FUNCTION public.current_user_role() TO service_role;


--
-- Name: FUNCTION enforce_schedule_status_flow(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_schedule_status_flow() TO anon;
GRANT ALL ON FUNCTION public.enforce_schedule_status_flow() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_schedule_status_flow() TO service_role;


--
-- Name: FUNCTION get_auto_generate_lock(p_term_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_auto_generate_lock(p_term_id bigint) TO anon;
GRANT ALL ON FUNCTION public.get_auto_generate_lock(p_term_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_auto_generate_lock(p_term_id bigint) TO service_role;


--
-- Name: FUNCTION get_auto_generate_lock_state(p_term_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_auto_generate_lock_state(p_term_id bigint) TO anon;
GRANT ALL ON FUNCTION public.get_auto_generate_lock_state(p_term_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_auto_generate_lock_state(p_term_id bigint) TO service_role;


--
-- Name: FUNCTION handle_new_auth_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_auth_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_auth_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_auth_user() TO service_role;


--
-- Name: FUNCTION mark_auto_generate_pending(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_auto_generate_pending(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO anon;
GRANT ALL ON FUNCTION public.mark_auto_generate_pending(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO authenticated;
GRANT ALL ON FUNCTION public.mark_auto_generate_pending(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO service_role;


--
-- Name: FUNCTION prevent_owned_room_preference(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_owned_room_preference() TO anon;
GRANT ALL ON FUNCTION public.prevent_owned_room_preference() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_owned_room_preference() TO service_role;


--
-- Name: FUNCTION release_auto_generate_lock(p_term_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.release_auto_generate_lock(p_term_id text) TO anon;
GRANT ALL ON FUNCTION public.release_auto_generate_lock(p_term_id text) TO authenticated;
GRANT ALL ON FUNCTION public.release_auto_generate_lock(p_term_id text) TO service_role;


--
-- Name: FUNCTION release_auto_generate_lock(p_term_id bigint, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.release_auto_generate_lock(p_term_id bigint, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.release_auto_generate_lock(p_term_id bigint, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.release_auto_generate_lock(p_term_id bigint, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION touch_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.touch_updated_at() TO anon;
GRANT ALL ON FUNCTION public.touch_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.touch_updated_at() TO service_role;


--
-- Name: FUNCTION try_acquire_auto_generate_lock(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.try_acquire_auto_generate_lock(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO anon;
GRANT ALL ON FUNCTION public.try_acquire_auto_generate_lock(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO authenticated;
GRANT ALL ON FUNCTION public.try_acquire_auto_generate_lock(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO service_role;


--
-- Name: FUNCTION try_auto_generate_lock(p_term_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.try_auto_generate_lock(p_term_id text) TO anon;
GRANT ALL ON FUNCTION public.try_auto_generate_lock(p_term_id text) TO authenticated;
GRANT ALL ON FUNCTION public.try_auto_generate_lock(p_term_id text) TO service_role;


--
-- Name: FUNCTION update_room_preference_timestamp(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_room_preference_timestamp() TO anon;
GRANT ALL ON FUNCTION public.update_room_preference_timestamp() TO authenticated;
GRANT ALL ON FUNCTION public.update_room_preference_timestamp() TO service_role;


--
-- Name: TABLE audit_trail; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_trail TO anon;
GRANT ALL ON TABLE public.audit_trail TO authenticated;
GRANT ALL ON TABLE public.audit_trail TO service_role;


--
-- Name: SEQUENCE audit_trail_audit_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.audit_trail_audit_id_seq TO anon;
GRANT ALL ON SEQUENCE public.audit_trail_audit_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.audit_trail_audit_id_seq TO service_role;


--
-- Name: TABLE auto_generate_lock; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.auto_generate_lock TO anon;
GRANT ALL ON TABLE public.auto_generate_lock TO authenticated;
GRANT ALL ON TABLE public.auto_generate_lock TO service_role;


--
-- Name: TABLE conversation; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation TO anon;
GRANT ALL ON TABLE public.conversation TO authenticated;
GRANT ALL ON TABLE public.conversation TO service_role;


--
-- Name: SEQUENCE conversation_conversation_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.conversation_conversation_id_seq TO anon;
GRANT ALL ON SEQUENCE public.conversation_conversation_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.conversation_conversation_id_seq TO service_role;


--
-- Name: TABLE conversation_member; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_member TO anon;
GRANT ALL ON TABLE public.conversation_member TO authenticated;
GRANT ALL ON TABLE public.conversation_member TO service_role;


--
-- Name: TABLE cross_department_request; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cross_department_request TO anon;
GRANT ALL ON TABLE public.cross_department_request TO authenticated;
GRANT ALL ON TABLE public.cross_department_request TO service_role;


--
-- Name: TABLE department; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.department TO anon;
GRANT ALL ON TABLE public.department TO authenticated;
GRANT ALL ON TABLE public.department TO service_role;


--
-- Name: SEQUENCE department_dept_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.department_dept_id_seq TO anon;
GRANT ALL ON SEQUENCE public.department_dept_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.department_dept_id_seq TO service_role;


--
-- Name: TABLE designation; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.designation TO anon;
GRANT ALL ON TABLE public.designation TO authenticated;
GRANT ALL ON TABLE public.designation TO service_role;


--
-- Name: SEQUENCE designation_designation_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.designation_designation_id_seq TO anon;
GRANT ALL ON SEQUENCE public.designation_designation_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.designation_designation_id_seq TO service_role;


--
-- Name: TABLE faculty; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.faculty TO anon;
GRANT ALL ON TABLE public.faculty TO authenticated;
GRANT ALL ON TABLE public.faculty TO service_role;


--
-- Name: TABLE faculty_commitment; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.faculty_commitment TO anon;
GRANT ALL ON TABLE public.faculty_commitment TO authenticated;
GRANT ALL ON TABLE public.faculty_commitment TO service_role;


--
-- Name: SEQUENCE faculty_commitment_commitment_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.faculty_commitment_commitment_id_seq TO anon;
GRANT ALL ON SEQUENCE public.faculty_commitment_commitment_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.faculty_commitment_commitment_id_seq TO service_role;


--
-- Name: SEQUENCE faculty_faculty_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.faculty_faculty_id_seq TO anon;
GRANT ALL ON SEQUENCE public.faculty_faculty_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.faculty_faculty_id_seq TO service_role;


--
-- Name: TABLE faculty_preference; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.faculty_preference TO anon;
GRANT ALL ON TABLE public.faculty_preference TO authenticated;
GRANT ALL ON TABLE public.faculty_preference TO service_role;


--
-- Name: SEQUENCE faculty_preference_preference_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.faculty_preference_preference_id_seq TO anon;
GRANT ALL ON SEQUENCE public.faculty_preference_preference_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.faculty_preference_preference_id_seq TO service_role;


--
-- Name: TABLE faculty_qualification; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.faculty_qualification TO anon;
GRANT ALL ON TABLE public.faculty_qualification TO authenticated;
GRANT ALL ON TABLE public.faculty_qualification TO service_role;


--
-- Name: SEQUENCE faculty_qualification_qual_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.faculty_qualification_qual_id_seq TO anon;
GRANT ALL ON SEQUENCE public.faculty_qualification_qual_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.faculty_qualification_qual_id_seq TO service_role;


--
-- Name: TABLE faculty_request; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.faculty_request TO anon;
GRANT ALL ON TABLE public.faculty_request TO authenticated;
GRANT ALL ON TABLE public.faculty_request TO service_role;


--
-- Name: SEQUENCE faculty_request_request_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.faculty_request_request_id_seq TO anon;
GRANT ALL ON SEQUENCE public.faculty_request_request_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.faculty_request_request_id_seq TO service_role;


--
-- Name: TABLE faculty_unavailability; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.faculty_unavailability TO anon;
GRANT ALL ON TABLE public.faculty_unavailability TO authenticated;
GRANT ALL ON TABLE public.faculty_unavailability TO service_role;


--
-- Name: SEQUENCE faculty_unavailability_unavailability_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.faculty_unavailability_unavailability_id_seq TO anon;
GRANT ALL ON SEQUENCE public.faculty_unavailability_unavailability_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.faculty_unavailability_unavailability_id_seq TO service_role;


--
-- Name: TABLE message; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.message TO anon;
GRANT ALL ON TABLE public.message TO authenticated;
GRANT ALL ON TABLE public.message TO service_role;


--
-- Name: SEQUENCE message_message_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.message_message_id_seq TO anon;
GRANT ALL ON SEQUENCE public.message_message_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.message_message_id_seq TO service_role;


--
-- Name: TABLE minor_subject_schedule; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.minor_subject_schedule TO anon;
GRANT ALL ON TABLE public.minor_subject_schedule TO authenticated;
GRANT ALL ON TABLE public.minor_subject_schedule TO service_role;


--
-- Name: SEQUENCE minor_subject_schedule_minor_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.minor_subject_schedule_minor_id_seq TO anon;
GRANT ALL ON SEQUENCE public.minor_subject_schedule_minor_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.minor_subject_schedule_minor_id_seq TO service_role;


--
-- Name: TABLE notification; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification TO anon;
GRANT ALL ON TABLE public.notification TO authenticated;
GRANT ALL ON TABLE public.notification TO service_role;


--
-- Name: SEQUENCE notification_notification_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.notification_notification_id_seq TO anon;
GRANT ALL ON SEQUENCE public.notification_notification_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.notification_notification_id_seq TO service_role;


--
-- Name: TABLE program; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.program TO anon;
GRANT ALL ON TABLE public.program TO authenticated;
GRANT ALL ON TABLE public.program TO service_role;


--
-- Name: SEQUENCE program_program_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.program_program_id_seq TO anon;
GRANT ALL ON SEQUENCE public.program_program_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.program_program_id_seq TO service_role;


--
-- Name: TABLE prospectus; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.prospectus TO anon;
GRANT ALL ON TABLE public.prospectus TO authenticated;
GRANT ALL ON TABLE public.prospectus TO service_role;


--
-- Name: TABLE prospectus_pdf; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.prospectus_pdf TO anon;
GRANT ALL ON TABLE public.prospectus_pdf TO authenticated;
GRANT ALL ON TABLE public.prospectus_pdf TO service_role;


--
-- Name: SEQUENCE prospectus_pdf_pdf_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.prospectus_pdf_pdf_id_seq TO anon;
GRANT ALL ON SEQUENCE public.prospectus_pdf_pdf_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.prospectus_pdf_pdf_id_seq TO service_role;


--
-- Name: TABLE prospectus_pdf_table; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.prospectus_pdf_table TO anon;
GRANT ALL ON TABLE public.prospectus_pdf_table TO authenticated;
GRANT ALL ON TABLE public.prospectus_pdf_table TO service_role;


--
-- Name: SEQUENCE prospectus_pdf_table_table_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.prospectus_pdf_table_table_id_seq TO anon;
GRANT ALL ON SEQUENCE public.prospectus_pdf_table_table_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.prospectus_pdf_table_table_id_seq TO service_role;


--
-- Name: SEQUENCE prospectus_prospectus_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.prospectus_prospectus_id_seq TO anon;
GRANT ALL ON SEQUENCE public.prospectus_prospectus_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.prospectus_prospectus_id_seq TO service_role;


--
-- Name: TABLE room; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.room TO anon;
GRANT ALL ON TABLE public.room TO authenticated;
GRANT ALL ON TABLE public.room TO service_role;


--
-- Name: TABLE room_preference; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.room_preference TO anon;
GRANT ALL ON TABLE public.room_preference TO authenticated;
GRANT ALL ON TABLE public.room_preference TO service_role;


--
-- Name: SEQUENCE room_preference_preference_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.room_preference_preference_id_seq TO anon;
GRANT ALL ON SEQUENCE public.room_preference_preference_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.room_preference_preference_id_seq TO service_role;


--
-- Name: SEQUENCE room_room_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.room_room_id_seq TO anon;
GRANT ALL ON SEQUENCE public.room_room_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.room_room_id_seq TO service_role;


--
-- Name: TABLE schedule; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.schedule TO anon;
GRANT ALL ON TABLE public.schedule TO authenticated;
GRANT ALL ON TABLE public.schedule TO service_role;


--
-- Name: SEQUENCE schedule_schedule_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.schedule_schedule_id_seq TO anon;
GRANT ALL ON SEQUENCE public.schedule_schedule_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.schedule_schedule_id_seq TO service_role;


--
-- Name: TABLE schedule_unscheduled; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.schedule_unscheduled TO anon;
GRANT ALL ON TABLE public.schedule_unscheduled TO authenticated;
GRANT ALL ON TABLE public.schedule_unscheduled TO service_role;


--
-- Name: SEQUENCE schedule_unscheduled_unscheduled_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.schedule_unscheduled_unscheduled_id_seq TO anon;
GRANT ALL ON SEQUENCE public.schedule_unscheduled_unscheduled_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.schedule_unscheduled_unscheduled_id_seq TO service_role;


--
-- Name: TABLE schedule_version; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.schedule_version TO anon;
GRANT ALL ON TABLE public.schedule_version TO authenticated;
GRANT ALL ON TABLE public.schedule_version TO service_role;


--
-- Name: SEQUENCE schedule_version_version_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.schedule_version_version_id_seq TO anon;
GRANT ALL ON SEQUENCE public.schedule_version_version_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.schedule_version_version_id_seq TO service_role;


--
-- Name: TABLE scheduling_setting; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scheduling_setting TO anon;
GRANT ALL ON TABLE public.scheduling_setting TO authenticated;
GRANT ALL ON TABLE public.scheduling_setting TO service_role;


--
-- Name: TABLE section; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.section TO anon;
GRANT ALL ON TABLE public.section TO authenticated;
GRANT ALL ON TABLE public.section TO service_role;


--
-- Name: SEQUENCE section_section_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.section_section_id_seq TO anon;
GRANT ALL ON SEQUENCE public.section_section_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.section_section_id_seq TO service_role;


--
-- Name: TABLE subject; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subject TO anon;
GRANT ALL ON TABLE public.subject TO authenticated;
GRANT ALL ON TABLE public.subject TO service_role;


--
-- Name: TABLE subject_restriction; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subject_restriction TO anon;
GRANT ALL ON TABLE public.subject_restriction TO authenticated;
GRANT ALL ON TABLE public.subject_restriction TO service_role;


--
-- Name: SEQUENCE subject_restriction_restriction_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.subject_restriction_restriction_id_seq TO anon;
GRANT ALL ON SEQUENCE public.subject_restriction_restriction_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.subject_restriction_restriction_id_seq TO service_role;


--
-- Name: SEQUENCE subject_subject_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.subject_subject_id_seq TO anon;
GRANT ALL ON SEQUENCE public.subject_subject_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.subject_subject_id_seq TO service_role;


--
-- Name: TABLE term; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.term TO anon;
GRANT ALL ON TABLE public.term TO authenticated;
GRANT ALL ON TABLE public.term TO service_role;


--
-- Name: SEQUENCE term_term_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.term_term_id_seq TO anon;
GRANT ALL ON SEQUENCE public.term_term_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.term_term_id_seq TO service_role;


--
-- Name: TABLE time_slot; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.time_slot TO anon;
GRANT ALL ON TABLE public.time_slot TO authenticated;
GRANT ALL ON TABLE public.time_slot TO service_role;


--
-- Name: SEQUENCE time_slot_timeslot_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.time_slot_timeslot_id_seq TO anon;
GRANT ALL ON SEQUENCE public.time_slot_timeslot_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.time_slot_timeslot_id_seq TO service_role;


--
-- Name: TABLE user_notification_setting; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_notification_setting TO anon;
GRANT ALL ON TABLE public.user_notification_setting TO authenticated;
GRANT ALL ON TABLE public.user_notification_setting TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

--
-- PostgreSQL database dump complete
--



-- Custom trigger on Supabase's auth.users table.
-- Keep this in sync with public.handle_new_auth_user().
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
