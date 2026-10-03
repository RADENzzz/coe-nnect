-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.department (
  dept_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  dept_code text NOT NULL UNIQUE,
  dept_name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT department_pkey PRIMARY KEY (dept_id)
);
CREATE TABLE public.designation (
  designation_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  designation_name text NOT NULL UNIQUE,
  release_hours numeric NOT NULL DEFAULT 0 CHECK (release_hours >= 0::numeric),
  CONSTRAINT designation_pkey PRIMARY KEY (designation_id)
);
CREATE TABLE public.term (
  term_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  term_name text NOT NULL,
  school_year text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  CONSTRAINT term_pkey PRIMARY KEY (term_id)
);
CREATE TABLE public.time_slot (
  timeslot_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  day_of_week USER-DEFINED NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  duration interval DEFAULT (end_time - start_time),
  CONSTRAINT time_slot_pkey PRIMARY KEY (timeslot_id)
);
CREATE TABLE public.scheduling_setting (
  setting_key text NOT NULL,
  value jsonb NOT NULL,
  description text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT scheduling_setting_pkey PRIMARY KEY (setting_key)
);
CREATE TABLE public.program (
  program_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  program_code text NOT NULL UNIQUE,
  program_name text NOT NULL,
  dept_id bigint NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT program_pkey PRIMARY KEY (program_id),
  CONSTRAINT program_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.department(dept_id)
);
CREATE TABLE public.subject (
  subject_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  subject_code text NOT NULL UNIQUE,
  title text NOT NULL,
  total_units numeric NOT NULL CHECK (total_units >= 0::numeric),
  lecture_units numeric NOT NULL DEFAULT 0 CHECK (lecture_units >= 0::numeric),
  lab_units numeric NOT NULL DEFAULT 0 CHECK (lab_units >= 0::numeric),
  required_room_type USER-DEFINED,
  dept_id bigint NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT subject_pkey PRIMARY KEY (subject_id),
  CONSTRAINT subject_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.department(dept_id)
);
CREATE TABLE public.prospectus (
  prospectus_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  program_id bigint NOT NULL,
  subject_id bigint NOT NULL,
  year_level smallint NOT NULL CHECK (year_level >= 1 AND year_level <= 6),
  semester USER-DEFINED NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT prospectus_pkey PRIMARY KEY (prospectus_id),
  CONSTRAINT prospectus_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.program(program_id),
  CONSTRAINT prospectus_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(subject_id)
);
CREATE TABLE public.faculty (
  faculty_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  wmsu_id text UNIQUE,
  employee_id text UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text UNIQUE,
  contact text,
  dept_id bigint,
  designation_id bigint,
  classification USER-DEFINED NOT NULL DEFAULT 'regular'::faculty_class,
  required_hours numeric CHECK (required_hours >= 0::numeric),
  sync_status USER-DEFINED NOT NULL DEFAULT 'pending'::sync_status,
  last_synced_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT faculty_pkey PRIMARY KEY (faculty_id),
  CONSTRAINT faculty_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.department(dept_id),
  CONSTRAINT faculty_designation_id_fkey FOREIGN KEY (designation_id) REFERENCES public.designation(designation_id)
);
CREATE TABLE public.faculty_qualification (
  qual_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  faculty_id bigint NOT NULL,
  subject_id bigint NOT NULL,
  source_system text,
  CONSTRAINT faculty_qualification_pkey PRIMARY KEY (qual_id),
  CONSTRAINT faculty_qualification_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id),
  CONSTRAINT faculty_qualification_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(subject_id)
);
CREATE TABLE public.faculty_preference (
  preference_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  faculty_id bigint NOT NULL,
  preferred_day USER-DEFINED NOT NULL,
  preferred_start_time time without time zone NOT NULL,
  preferred_end_time time without time zone NOT NULL,
  CONSTRAINT faculty_preference_pkey PRIMARY KEY (preference_id),
  CONSTRAINT faculty_preference_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id)
);
CREATE TABLE public.faculty_commitment (
  commitment_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  faculty_id bigint NOT NULL,
  term_id bigint,
  day_of_week USER-DEFINED NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  title text,
  source_system text NOT NULL DEFAULT 'IDP'::text,
  external_id text,
  last_synced_at timestamp with time zone,
  CONSTRAINT faculty_commitment_pkey PRIMARY KEY (commitment_id),
  CONSTRAINT faculty_commitment_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id),
  CONSTRAINT faculty_commitment_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id)
);
CREATE TABLE public.users (
  user_id uuid NOT NULL,
  username text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  employee_id text,
  wmsu_id text,
  role USER-DEFINED NOT NULL DEFAULT 'viewer'::user_role,
  dept_id bigint,
  is_active boolean NOT NULL DEFAULT true,
  faculty_id bigint UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (user_id),
  CONSTRAINT users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT users_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.department(dept_id),
  CONSTRAINT users_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id)
);
CREATE TABLE public.audit_trail (
  audit_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  action text NOT NULL,
  affected_data jsonb,
  source_system text,
  CONSTRAINT audit_trail_pkey PRIMARY KEY (audit_id),
  CONSTRAINT audit_trail_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.room (
  room_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  room_number text NOT NULL,
  building text NOT NULL,
  room_type USER-DEFINED NOT NULL DEFAULT 'lecture_room'::room_type,
  capacity integer CHECK (capacity >= 0),
  dept_id bigint,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT room_pkey PRIMARY KEY (room_id),
  CONSTRAINT room_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.department(dept_id)
);
CREATE TABLE public.schedule (
  schedule_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  term_id bigint NOT NULL,
  subject_id bigint NOT NULL,
  faculty_id bigint,
  room_id bigint,
  timeslot_id bigint,
  section text,
  load_type USER-DEFINED,
  status USER-DEFINED NOT NULL DEFAULT 'draft'::schedule_status,
  is_finalized boolean DEFAULT (status = ANY (ARRAY['finalized'::schedule_status, 'published'::schedule_status])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  day_of_week USER-DEFINED,
  start_time time without time zone,
  end_time time without time zone,
  remarks text,
  CONSTRAINT schedule_pkey PRIMARY KEY (schedule_id),
  CONSTRAINT schedule_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id),
  CONSTRAINT schedule_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subject(subject_id),
  CONSTRAINT schedule_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id),
  CONSTRAINT schedule_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.room(room_id),
  CONSTRAINT schedule_timeslot_id_fkey FOREIGN KEY (timeslot_id) REFERENCES public.time_slot(timeslot_id)
);
CREATE TABLE public.schedule_version (
  version_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  term_id bigint NOT NULL,
  faculty_id bigint,
  version_number integer NOT NULL CHECK (version_number > 0),
  snapshot jsonb,
  last_modified_at timestamp with time zone NOT NULL DEFAULT now(),
  finalized_by uuid,
  CONSTRAINT schedule_version_pkey PRIMARY KEY (version_id),
  CONSTRAINT schedule_version_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id),
  CONSTRAINT schedule_version_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES public.faculty(faculty_id),
  CONSTRAINT schedule_version_finalized_by_fkey FOREIGN KEY (finalized_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.minor_subject_schedule (
  minor_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  term_id bigint NOT NULL,
  subject_code text NOT NULL,
  description text,
  source_dept text,
  day_of_week USER-DEFINED,
  start_time time without time zone,
  end_time time without time zone,
  CONSTRAINT minor_subject_schedule_pkey PRIMARY KEY (minor_id),
  CONSTRAINT minor_subject_schedule_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id)
);
CREATE TABLE public.subject_restriction (
  restriction_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  subject_id_1 bigint NOT NULL,
  subject_id_2 bigint NOT NULL,
  term_id bigint,
  warning_message text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT subject_restriction_pkey PRIMARY KEY (restriction_id),
  CONSTRAINT subject_restriction_subject_id_1_fkey FOREIGN KEY (subject_id_1) REFERENCES public.subject(subject_id),
  CONSTRAINT subject_restriction_subject_id_2_fkey FOREIGN KEY (subject_id_2) REFERENCES public.subject(subject_id),
  CONSTRAINT subject_restriction_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.term(term_id),
  CONSTRAINT subject_restriction_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id)
);

