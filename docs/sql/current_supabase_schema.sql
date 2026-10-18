-- CoE-NNECT live Supabase schema-only export.
-- Exported 2026-10-18 from PostgreSQL 17.6.
-- No application table rows or sequence values are included.
-- This script targets a fresh Supabase project: managed auth/storage schemas and
-- roles must already exist; Supabase Auth provider settings are configured separately.
-- Only the application public schema is recreated; the Auth signup trigger and
-- Storage bucket configuration are included, but managed Auth/Storage DDL is not.
-- RLS policies do not restrict service_role or direct database connections that
-- use a role with BYPASSRLS privileges.
-- Source inventory: 33 public tables, 156 constraints, 118 indexes, 49 RLS policies.

CREATE SCHEMA IF NOT EXISTS public;


-- Enum types

CREATE TYPE "public"."day_of_week" AS ENUM ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday');
CREATE TYPE "public"."faculty_class" AS ENUM ('regular', 'part_time', 'visiting_lecturer', 'other');
CREATE TYPE "public"."faculty_request_status" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE "public"."load_type" AS ENUM ('lecture', 'laboratory', 'other');
CREATE TYPE "public"."room_type" AS ENUM ('lecture_room', 'laboratory', 'computer_lab', 'drafting_room', 'other', 'any');
CREATE TYPE "public"."schedule_status" AS ENUM ('draft', 'review', 'finalized', 'published');
CREATE TYPE "public"."semester_type" AS ENUM ('1st', '2nd', 'summer');
CREATE TYPE "public"."sync_status" AS ENUM ('pending', 'synced', 'failed');
CREATE TYPE "public"."user_role" AS ENUM ('administrator', 'college_dean', 'department_head', 'viewer');

-- Non-identity sequences


-- Tables and columns

CREATE TABLE "public"."audit_trail" (
  "audit_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "user_id" uuid,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
  "action" text NOT NULL,
  "affected_data" jsonb,
  "source_system" text
);
CREATE TABLE "public"."auto_generate_lock" (
  "term_id" bigint NOT NULL,
  "acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
  "acquired_by" uuid,
  "expires_at" timestamp with time zone NOT NULL,
  "state" text DEFAULT 'running'::text NOT NULL
);
CREATE TABLE "public"."conversation" (
  "conversation_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."conversation_member" (
  "conversation_id" bigint NOT NULL,
  "user_id" uuid NOT NULL,
  "last_read_at" timestamp with time zone,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."cross_department_request" (
  "request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "requesting_dept_id" bigint,
  "target_dept_id" bigint,
  "faculty_id" bigint,
  "subject_id" bigint,
  "term_id" bigint,
  "timeslot_id" bigint,
  "reason" text,
  "status" character varying(50) DEFAULT 'pending'::character varying,
  "requested_by" uuid,
  "approved_by" uuid,
  "resolved_at" timestamp with time zone,
  "remarks" text,
  "created_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE "public"."department" (
  "dept_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "dept_code" text NOT NULL,
  "dept_name" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL
);
CREATE TABLE "public"."designation" (
  "designation_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "designation_name" text NOT NULL,
  "release_hours" numeric(5,2) DEFAULT 0 NOT NULL
);
CREATE TABLE "public"."faculty" (
  "faculty_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "wmsu_id" text,
  "employee_id" text,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "email" text,
  "contact" text,
  "dept_id" bigint,
  "designation_id" bigint,
  "classification" faculty_class DEFAULT 'regular'::faculty_class NOT NULL,
  "required_hours" numeric(5,2),
  "sync_status" sync_status DEFAULT 'pending'::sync_status NOT NULL,
  "last_synced_at" timestamp with time zone,
  "is_active" boolean DEFAULT true NOT NULL
);
CREATE TABLE "public"."faculty_commitment" (
  "commitment_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "faculty_id" bigint NOT NULL,
  "term_id" bigint,
  "day_of_week" day_of_week NOT NULL,
  "start_time" time without time zone NOT NULL,
  "end_time" time without time zone NOT NULL,
  "title" text,
  "source_system" text DEFAULT 'IDP'::text NOT NULL,
  "external_id" text,
  "last_synced_at" timestamp with time zone
);
CREATE TABLE "public"."faculty_preference" (
  "preference_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "faculty_id" bigint NOT NULL,
  "preferred_day" day_of_week NOT NULL,
  "preferred_start_time" time without time zone NOT NULL,
  "preferred_end_time" time without time zone NOT NULL
);
CREATE TABLE "public"."faculty_qualification" (
  "qual_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "faculty_id" bigint NOT NULL,
  "subject_id" bigint NOT NULL,
  "source_system" text
);
CREATE TABLE "public"."faculty_request" (
  "request_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "requesting_dept_id" bigint NOT NULL,
  "target_dept_id" bigint NOT NULL,
  "faculty_id" bigint,
  "subject_id" bigint NOT NULL,
  "term_id" bigint NOT NULL,
  "reason" text NOT NULL,
  "status" faculty_request_status DEFAULT 'pending'::faculty_request_status NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "responded_by" uuid,
  "responded_at" timestamp with time zone,
  "response_remarks" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."faculty_unavailability" (
  "unavailability_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "faculty_id" bigint NOT NULL,
  "term_id" bigint,
  "day_of_week" text NOT NULL,
  "start_time" time without time zone NOT NULL,
  "end_time" time without time zone NOT NULL,
  "reason" text,
  "source" text DEFAULT 'local'::text NOT NULL,
  "external_id" text,
  "synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."message" (
  "message_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "conversation_id" bigint NOT NULL,
  "sender_id" uuid NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."minor_subject_schedule" (
  "minor_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "term_id" bigint NOT NULL,
  "subject_code" text NOT NULL,
  "description" text,
  "source_dept" text,
  "day_of_week" day_of_week,
  "start_time" time without time zone,
  "end_time" time without time zone
);
CREATE TABLE "public"."notification" (
  "notification_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "recipient_id" uuid NOT NULL,
  "trigger_key" text NOT NULL,
  "category" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "entity_type" text,
  "entity_id" text,
  "payload" jsonb,
  "is_read" boolean DEFAULT false NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."program" (
  "program_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "program_code" text NOT NULL,
  "program_name" text NOT NULL,
  "dept_id" bigint NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL
);
CREATE TABLE "public"."prospectus" (
  "prospectus_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "program_id" bigint NOT NULL,
  "subject_id" bigint NOT NULL,
  "year_level" smallint NOT NULL,
  "semester" semester_type NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "lecture_sessions_per_week" smallint DEFAULT 1 NOT NULL,
  "lecture_minutes_per_session" smallint DEFAULT 90 NOT NULL,
  "lab_sessions_per_week" smallint DEFAULT 1 NOT NULL,
  "lab_minutes_per_session" smallint DEFAULT 180 NOT NULL
);
CREATE TABLE "public"."prospectus_pdf" (
  "pdf_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "department_id" bigint NOT NULL,
  "original_filename" text NOT NULL,
  "storage_path" text NOT NULL,
  "storage_bucket" text DEFAULT 'prospectus-pdfs'::text NOT NULL,
  "file_size_bytes" bigint NOT NULL,
  "page_count" integer NOT NULL,
  "page_width_pt" numeric(10,4) NOT NULL,
  "page_height_pt" numeric(10,4) NOT NULL,
  "notes" text,
  "uploaded_by" uuid,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE TABLE "public"."prospectus_pdf_table" (
  "table_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "pdf_id" bigint NOT NULL,
  "year_level" smallint NOT NULL,
  "semester" text NOT NULL,
  "label" text,
  "region_page_index" integer NOT NULL,
  "region_x_start_pt" numeric(10,4) NOT NULL,
  "region_x_end_pt" numeric(10,4) NOT NULL,
  "region_y_start_pt" numeric(10,4) NOT NULL,
  "region_y_end_pt" numeric(10,4) NOT NULL,
  "columns" jsonb NOT NULL,
  "rows" jsonb NOT NULL,
  "subject_count" integer DEFAULT 0 NOT NULL,
  "total_lec_units" integer DEFAULT 0 NOT NULL,
  "total_lab_units" integer DEFAULT 0 NOT NULL,
  "total_units" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."room" (
  "room_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "room_number" text NOT NULL,
  "building" text NOT NULL,
  "room_type" room_type DEFAULT 'lecture_room'::room_type NOT NULL,
  "capacity" integer,
  "dept_id" bigint,
  "is_active" boolean DEFAULT true NOT NULL
);
CREATE TABLE "public"."room_preference" (
  "preference_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "room_id" bigint NOT NULL,
  "dept_id" bigint NOT NULL,
  "priority" smallint DEFAULT 1 NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."schedule" (
  "schedule_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "term_id" bigint NOT NULL,
  "subject_id" bigint NOT NULL,
  "faculty_id" bigint,
  "room_id" bigint,
  "timeslot_id" bigint,
  "section" text,
  "load_type" load_type,
  "status" schedule_status DEFAULT 'draft'::schedule_status NOT NULL,
  "is_finalized" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['finalized'::schedule_status, 'published'::schedule_status]))) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "day_of_week" day_of_week,
  "start_time" time without time zone,
  "end_time" time without time zone,
  "remarks" text,
  "section_id" bigint,
  "twin_group_id" bigint,
  "dept_id" bigint,
  "flagged" boolean DEFAULT false NOT NULL,
  "flagged_by" uuid,
  "flagged_at" timestamp with time zone,
  "flag_reason" text,
  "external_faculty_name" text,
  "pending_faculty_request_id" bigint,
  "pending_faculty_dept_id" bigint,
  "external_room_name" text
);
CREATE TABLE "public"."schedule_unscheduled" (
  "unscheduled_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "term_id" bigint NOT NULL,
  "section_id" bigint,
  "subject_id" bigint NOT NULL,
  "kind" character varying NOT NULL,
  "session_index" integer DEFAULT 0 NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."schedule_version" (
  "version_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "term_id" bigint NOT NULL,
  "faculty_id" bigint,
  "version_number" integer NOT NULL,
  "snapshot" jsonb,
  "last_modified_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finalized_by" uuid
);
CREATE TABLE "public"."scheduling_setting" (
  "setting_key" text NOT NULL,
  "value" jsonb NOT NULL,
  "description" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."section" (
  "section_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "section_code" text NOT NULL,
  "program_id" bigint,
  "year_level" smallint,
  "student_count" integer,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."subject" (
  "subject_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "subject_code" text NOT NULL,
  "title" text NOT NULL,
  "total_units" numeric(4,1) NOT NULL,
  "lecture_units" numeric(4,1) DEFAULT 0 NOT NULL,
  "lab_units" numeric(4,1) DEFAULT 0 NOT NULL,
  "required_room_type" room_type,
  "dept_id" bigint NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "source_dept" text,
  "is_minor" boolean DEFAULT false NOT NULL
);
CREATE TABLE "public"."subject_restriction" (
  "restriction_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "subject_id_1" bigint NOT NULL,
  "subject_id_2" bigint NOT NULL,
  "term_id" bigint,
  "warning_message" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."term" (
  "term_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "term_name" text NOT NULL,
  "school_year" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "semester" semester_type
);
CREATE TABLE "public"."time_slot" (
  "timeslot_id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "day_of_week" day_of_week NOT NULL,
  "start_time" time without time zone NOT NULL,
  "end_time" time without time zone NOT NULL,
  "duration" interval GENERATED ALWAYS AS ((end_time - start_time)) STORED
);
CREATE TABLE "public"."user_notification_setting" (
  "user_id" uuid NOT NULL,
  "trigger_key" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "public"."users" (
  "user_id" uuid NOT NULL,
  "username" text NOT NULL,
  "email" text NOT NULL,
  "employee_id" text,
  "wmsu_id" text,
  "role" user_role DEFAULT 'viewer'::user_role NOT NULL,
  "dept_id" bigint,
  "is_active" boolean DEFAULT true NOT NULL,
  "faculty_id" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Constraints

ALTER TABLE ONLY "public"."audit_trail" ADD CONSTRAINT "audit_trail_pkey" PRIMARY KEY (audit_id);
ALTER TABLE ONLY "public"."audit_trail" ADD CONSTRAINT "audit_trail_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."auto_generate_lock" ADD CONSTRAINT "auto_generate_lock_acquired_by_fkey" FOREIGN KEY (acquired_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."auto_generate_lock" ADD CONSTRAINT "auto_generate_lock_pkey" PRIMARY KEY (term_id);
ALTER TABLE ONLY "public"."auto_generate_lock" ADD CONSTRAINT "auto_generate_lock_state_check" CHECK (state = ANY (ARRAY['running'::text, 'pending_confirm'::text]));
ALTER TABLE ONLY "public"."auto_generate_lock" ADD CONSTRAINT "auto_generate_lock_term_id_fkey" FOREIGN KEY (term_id) REFERENCES term(term_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."conversation" ADD CONSTRAINT "conversation_pkey" PRIMARY KEY (conversation_id);
ALTER TABLE ONLY "public"."conversation_member" ADD CONSTRAINT "conversation_member_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversation(conversation_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."conversation_member" ADD CONSTRAINT "conversation_member_pkey" PRIMARY KEY (conversation_id, user_id);
ALTER TABLE ONLY "public"."conversation_member" ADD CONSTRAINT "conversation_member_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."cross_department_request" ADD CONSTRAINT "cross_department_request_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES users(user_id);
ALTER TABLE ONLY "public"."cross_department_request" ADD CONSTRAINT "cross_department_request_faculty_id_fkey" FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id);
ALTER TABLE ONLY "public"."cross_department_request" ADD CONSTRAINT "cross_department_request_pkey" PRIMARY KEY (request_id);
ALTER TABLE ONLY "public"."cross_department_request" ADD CONSTRAINT "cross_department_request_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES users(user_id);
ALTER TABLE ONLY "public"."cross_department_request" ADD CONSTRAINT "cross_department_request_requesting_dept_id_fkey" FOREIGN KEY (requesting_dept_id) REFERENCES department(dept_id);
ALTER TABLE ONLY "public"."cross_department_request" ADD CONSTRAINT "cross_department_request_subject_id_fkey" FOREIGN KEY (subject_id) REFERENCES subject(subject_id);
ALTER TABLE ONLY "public"."cross_department_request" ADD CONSTRAINT "cross_department_request_target_dept_id_fkey" FOREIGN KEY (target_dept_id) REFERENCES department(dept_id);
ALTER TABLE ONLY "public"."cross_department_request" ADD CONSTRAINT "cross_department_request_term_id_fkey" FOREIGN KEY (term_id) REFERENCES term(term_id);
ALTER TABLE ONLY "public"."cross_department_request" ADD CONSTRAINT "cross_department_request_timeslot_id_fkey" FOREIGN KEY (timeslot_id) REFERENCES time_slot(timeslot_id);
ALTER TABLE ONLY "public"."department" ADD CONSTRAINT "department_dept_code_key" UNIQUE (dept_code);
ALTER TABLE ONLY "public"."department" ADD CONSTRAINT "department_pkey" PRIMARY KEY (dept_id);
ALTER TABLE ONLY "public"."designation" ADD CONSTRAINT "designation_designation_name_key" UNIQUE (designation_name);
ALTER TABLE ONLY "public"."designation" ADD CONSTRAINT "designation_pkey" PRIMARY KEY (designation_id);
ALTER TABLE ONLY "public"."designation" ADD CONSTRAINT "designation_release_hours_check" CHECK (release_hours >= 0::numeric);
ALTER TABLE ONLY "public"."faculty" ADD CONSTRAINT "faculty_dept_id_fkey" FOREIGN KEY (dept_id) REFERENCES department(dept_id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."faculty" ADD CONSTRAINT "faculty_designation_id_fkey" FOREIGN KEY (designation_id) REFERENCES designation(designation_id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."faculty" ADD CONSTRAINT "faculty_email_key" UNIQUE (email);
ALTER TABLE ONLY "public"."faculty" ADD CONSTRAINT "faculty_employee_id_key" UNIQUE (employee_id);
ALTER TABLE ONLY "public"."faculty" ADD CONSTRAINT "faculty_pkey" PRIMARY KEY (faculty_id);
ALTER TABLE ONLY "public"."faculty" ADD CONSTRAINT "faculty_required_hours_check" CHECK (required_hours >= 0::numeric);
ALTER TABLE ONLY "public"."faculty" ADD CONSTRAINT "faculty_wmsu_id_key" UNIQUE (wmsu_id);
ALTER TABLE ONLY "public"."faculty_commitment" ADD CONSTRAINT "faculty_commitment_check" CHECK (end_time > start_time);
ALTER TABLE ONLY "public"."faculty_commitment" ADD CONSTRAINT "faculty_commitment_faculty_id_fkey" FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."faculty_commitment" ADD CONSTRAINT "faculty_commitment_pkey" PRIMARY KEY (commitment_id);
ALTER TABLE ONLY "public"."faculty_commitment" ADD CONSTRAINT "faculty_commitment_source_system_external_id_key" UNIQUE (source_system, external_id);
ALTER TABLE ONLY "public"."faculty_commitment" ADD CONSTRAINT "faculty_commitment_term_id_fkey" FOREIGN KEY (term_id) REFERENCES term(term_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."faculty_preference" ADD CONSTRAINT "faculty_preference_check" CHECK (preferred_end_time > preferred_start_time);
ALTER TABLE ONLY "public"."faculty_preference" ADD CONSTRAINT "faculty_preference_faculty_id_fkey" FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."faculty_preference" ADD CONSTRAINT "faculty_preference_pkey" PRIMARY KEY (preference_id);
ALTER TABLE ONLY "public"."faculty_qualification" ADD CONSTRAINT "faculty_qualification_faculty_id_fkey" FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."faculty_qualification" ADD CONSTRAINT "faculty_qualification_faculty_id_subject_id_key" UNIQUE (faculty_id, subject_id);
ALTER TABLE ONLY "public"."faculty_qualification" ADD CONSTRAINT "faculty_qualification_pkey" PRIMARY KEY (qual_id);
ALTER TABLE ONLY "public"."faculty_qualification" ADD CONSTRAINT "faculty_qualification_subject_id_fkey" FOREIGN KEY (subject_id) REFERENCES subject(subject_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."faculty_request" ADD CONSTRAINT "faculty_request_check" CHECK (requesting_dept_id <> target_dept_id);
ALTER TABLE ONLY "public"."faculty_request" ADD CONSTRAINT "faculty_request_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."faculty_request" ADD CONSTRAINT "faculty_request_faculty_id_fkey" FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."faculty_request" ADD CONSTRAINT "faculty_request_pkey" PRIMARY KEY (request_id);
ALTER TABLE ONLY "public"."faculty_request" ADD CONSTRAINT "faculty_request_requesting_dept_id_fkey" FOREIGN KEY (requesting_dept_id) REFERENCES department(dept_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."faculty_request" ADD CONSTRAINT "faculty_request_responded_by_fkey" FOREIGN KEY (responded_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."faculty_request" ADD CONSTRAINT "faculty_request_subject_id_fkey" FOREIGN KEY (subject_id) REFERENCES subject(subject_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."faculty_request" ADD CONSTRAINT "faculty_request_target_dept_id_fkey" FOREIGN KEY (target_dept_id) REFERENCES department(dept_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."faculty_request" ADD CONSTRAINT "faculty_request_term_id_fkey" FOREIGN KEY (term_id) REFERENCES term(term_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."faculty_unavailability" ADD CONSTRAINT "chk_unavailability_day" CHECK (day_of_week = ANY (ARRAY['Monday'::text, 'Tuesday'::text, 'Wednesday'::text, 'Thursday'::text, 'Friday'::text, 'Saturday'::text, 'Sunday'::text]));
ALTER TABLE ONLY "public"."faculty_unavailability" ADD CONSTRAINT "chk_unavailability_time_order" CHECK (end_time > start_time);
ALTER TABLE ONLY "public"."faculty_unavailability" ADD CONSTRAINT "faculty_unavailability_faculty_id_fkey" FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."faculty_unavailability" ADD CONSTRAINT "faculty_unavailability_pkey" PRIMARY KEY (unavailability_id);
ALTER TABLE ONLY "public"."faculty_unavailability" ADD CONSTRAINT "faculty_unavailability_source_check" CHECK (source = ANY (ARRAY['local'::text, 'idp'::text]));
ALTER TABLE ONLY "public"."faculty_unavailability" ADD CONSTRAINT "faculty_unavailability_term_id_fkey" FOREIGN KEY (term_id) REFERENCES term(term_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."message" ADD CONSTRAINT "message_body_check" CHECK (char_length(body) >= 1 AND char_length(body) <= 2000);
ALTER TABLE ONLY "public"."message" ADD CONSTRAINT "message_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversation(conversation_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."message" ADD CONSTRAINT "message_pkey" PRIMARY KEY (message_id);
ALTER TABLE ONLY "public"."message" ADD CONSTRAINT "message_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."minor_subject_schedule" ADD CONSTRAINT "minor_subject_schedule_check" CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time);
ALTER TABLE ONLY "public"."minor_subject_schedule" ADD CONSTRAINT "minor_subject_schedule_pkey" PRIMARY KEY (minor_id);
ALTER TABLE ONLY "public"."minor_subject_schedule" ADD CONSTRAINT "minor_subject_schedule_term_id_fkey" FOREIGN KEY (term_id) REFERENCES term(term_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."notification" ADD CONSTRAINT "notification_pkey" PRIMARY KEY (notification_id);
ALTER TABLE ONLY "public"."notification" ADD CONSTRAINT "notification_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."program" ADD CONSTRAINT "program_dept_id_fkey" FOREIGN KEY (dept_id) REFERENCES department(dept_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."program" ADD CONSTRAINT "program_pkey" PRIMARY KEY (program_id);
ALTER TABLE ONLY "public"."program" ADD CONSTRAINT "program_program_code_key" UNIQUE (program_code);
ALTER TABLE ONLY "public"."prospectus" ADD CONSTRAINT "prospectus_lab_minutes_per_session_check" CHECK (lab_minutes_per_session >= 60 AND lab_minutes_per_session <= 300);
ALTER TABLE ONLY "public"."prospectus" ADD CONSTRAINT "prospectus_lab_sessions_per_week_check" CHECK (lab_sessions_per_week >= 1 AND lab_sessions_per_week <= 3);
ALTER TABLE ONLY "public"."prospectus" ADD CONSTRAINT "prospectus_lecture_minutes_per_session_check" CHECK (lecture_minutes_per_session >= 30 AND lecture_minutes_per_session <= 240);
ALTER TABLE ONLY "public"."prospectus" ADD CONSTRAINT "prospectus_lecture_sessions_per_week_check" CHECK (lecture_sessions_per_week >= 1 AND lecture_sessions_per_week <= 5);
ALTER TABLE ONLY "public"."prospectus" ADD CONSTRAINT "prospectus_pkey" PRIMARY KEY (prospectus_id);
ALTER TABLE ONLY "public"."prospectus" ADD CONSTRAINT "prospectus_program_id_fkey" FOREIGN KEY (program_id) REFERENCES program(program_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."prospectus" ADD CONSTRAINT "prospectus_program_id_subject_id_year_level_semester_key" UNIQUE (program_id, subject_id, year_level, semester);
ALTER TABLE ONLY "public"."prospectus" ADD CONSTRAINT "prospectus_subject_id_fkey" FOREIGN KEY (subject_id) REFERENCES subject(subject_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."prospectus" ADD CONSTRAINT "prospectus_year_level_check" CHECK (year_level >= 1 AND year_level <= 6);
ALTER TABLE ONLY "public"."prospectus_pdf" ADD CONSTRAINT "prospectus_pdf_department_id_fkey" FOREIGN KEY (department_id) REFERENCES department(dept_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."prospectus_pdf" ADD CONSTRAINT "prospectus_pdf_page_count_check" CHECK (page_count > 0);
ALTER TABLE ONLY "public"."prospectus_pdf" ADD CONSTRAINT "prospectus_pdf_pkey" PRIMARY KEY (pdf_id);
ALTER TABLE ONLY "public"."prospectus_pdf" ADD CONSTRAINT "prospectus_pdf_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."prospectus_pdf_table" ADD CONSTRAINT "prospectus_pdf_table_pdf_id_fkey" FOREIGN KEY (pdf_id) REFERENCES prospectus_pdf(pdf_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."prospectus_pdf_table" ADD CONSTRAINT "prospectus_pdf_table_pkey" PRIMARY KEY (table_id);
ALTER TABLE ONLY "public"."prospectus_pdf_table" ADD CONSTRAINT "prospectus_pdf_table_region_page_index_check" CHECK (region_page_index >= 0);
ALTER TABLE ONLY "public"."prospectus_pdf_table" ADD CONSTRAINT "prospectus_pdf_table_semester_check" CHECK (semester = ANY (ARRAY['1st'::text, '2nd'::text, 'summer'::text]));
ALTER TABLE ONLY "public"."prospectus_pdf_table" ADD CONSTRAINT "prospectus_pdf_table_year_level_check" CHECK (year_level >= 1 AND year_level <= 6);
ALTER TABLE ONLY "public"."prospectus_pdf_table" ADD CONSTRAINT "uq_prospectus_pdf_table_ys" UNIQUE (pdf_id, year_level, semester);
ALTER TABLE ONLY "public"."room" ADD CONSTRAINT "room_building_room_number_key" UNIQUE (building, room_number);
ALTER TABLE ONLY "public"."room" ADD CONSTRAINT "room_capacity_check" CHECK (capacity >= 0);
ALTER TABLE ONLY "public"."room" ADD CONSTRAINT "room_dept_id_fkey" FOREIGN KEY (dept_id) REFERENCES department(dept_id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."room" ADD CONSTRAINT "room_pkey" PRIMARY KEY (room_id);
ALTER TABLE ONLY "public"."room_preference" ADD CONSTRAINT "room_preference_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."room_preference" ADD CONSTRAINT "room_preference_dept_id_fkey" FOREIGN KEY (dept_id) REFERENCES department(dept_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."room_preference" ADD CONSTRAINT "room_preference_pkey" PRIMARY KEY (preference_id);
ALTER TABLE ONLY "public"."room_preference" ADD CONSTRAINT "room_preference_priority_check" CHECK (priority >= 1 AND priority <= 3);
ALTER TABLE ONLY "public"."room_preference" ADD CONSTRAINT "room_preference_room_id_dept_id_key" UNIQUE (room_id, dept_id);
ALTER TABLE ONLY "public"."room_preference" ADD CONSTRAINT "room_preference_room_id_fkey" FOREIGN KEY (room_id) REFERENCES room(room_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."schedule" ADD CONSTRAINT "chk_schedule_faculty_or_external" CHECK (faculty_id IS NOT NULL OR external_faculty_name IS NOT NULL OR remarks IS NOT NULL);
ALTER TABLE ONLY "public"."schedule" ADD CONSTRAINT "chk_schedule_room_or_external" CHECK (room_id IS NOT NULL OR external_room_name IS NOT NULL OR remarks IS NOT NULL);
ALTER TABLE ONLY "public"."schedule" ADD CONSTRAINT "schedule_dept_id_fkey" FOREIGN KEY (dept_id) REFERENCES department(dept_id);
ALTER TABLE ONLY "public"."schedule" ADD CONSTRAINT "schedule_faculty_id_fkey" FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."schedule" ADD CONSTRAINT "schedule_flagged_by_fkey" FOREIGN KEY (flagged_by) REFERENCES users(user_id);
ALTER TABLE ONLY "public"."schedule" ADD CONSTRAINT "schedule_pending_faculty_dept_id_fkey" FOREIGN KEY (pending_faculty_dept_id) REFERENCES department(dept_id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."schedule" ADD CONSTRAINT "schedule_pending_faculty_request_id_fkey" FOREIGN KEY (pending_faculty_request_id) REFERENCES faculty_request(request_id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."schedule" ADD CONSTRAINT "schedule_pkey" PRIMARY KEY (schedule_id);
ALTER TABLE ONLY "public"."schedule" ADD CONSTRAINT "schedule_room_id_fkey" FOREIGN KEY (room_id) REFERENCES room(room_id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."schedule" ADD CONSTRAINT "schedule_section_id_fkey" FOREIGN KEY (section_id) REFERENCES section(section_id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."schedule" ADD CONSTRAINT "schedule_subject_id_fkey" FOREIGN KEY (subject_id) REFERENCES subject(subject_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."schedule" ADD CONSTRAINT "schedule_term_id_fkey" FOREIGN KEY (term_id) REFERENCES term(term_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."schedule" ADD CONSTRAINT "schedule_timeslot_id_fkey" FOREIGN KEY (timeslot_id) REFERENCES time_slot(timeslot_id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."schedule_unscheduled" ADD CONSTRAINT "schedule_unscheduled_kind_check" CHECK (kind::text = ANY (ARRAY['lecture'::character varying, 'lab'::character varying]::text[]));
ALTER TABLE ONLY "public"."schedule_unscheduled" ADD CONSTRAINT "schedule_unscheduled_pkey" PRIMARY KEY (unscheduled_id);
ALTER TABLE ONLY "public"."schedule_unscheduled" ADD CONSTRAINT "schedule_unscheduled_section_id_fkey" FOREIGN KEY (section_id) REFERENCES section(section_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."schedule_unscheduled" ADD CONSTRAINT "schedule_unscheduled_subject_id_fkey" FOREIGN KEY (subject_id) REFERENCES subject(subject_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."schedule_unscheduled" ADD CONSTRAINT "schedule_unscheduled_term_id_fkey" FOREIGN KEY (term_id) REFERENCES term(term_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."schedule_version" ADD CONSTRAINT "schedule_version_faculty_id_fkey" FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."schedule_version" ADD CONSTRAINT "schedule_version_finalized_by_fkey" FOREIGN KEY (finalized_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."schedule_version" ADD CONSTRAINT "schedule_version_pkey" PRIMARY KEY (version_id);
ALTER TABLE ONLY "public"."schedule_version" ADD CONSTRAINT "schedule_version_term_id_faculty_id_version_number_key" UNIQUE (term_id, faculty_id, version_number);
ALTER TABLE ONLY "public"."schedule_version" ADD CONSTRAINT "schedule_version_term_id_fkey" FOREIGN KEY (term_id) REFERENCES term(term_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."schedule_version" ADD CONSTRAINT "schedule_version_version_number_check" CHECK (version_number > 0);
ALTER TABLE ONLY "public"."scheduling_setting" ADD CONSTRAINT "scheduling_setting_pkey" PRIMARY KEY (setting_key);
ALTER TABLE ONLY "public"."section" ADD CONSTRAINT "section_pkey" PRIMARY KEY (section_id);
ALTER TABLE ONLY "public"."section" ADD CONSTRAINT "section_program_id_fkey" FOREIGN KEY (program_id) REFERENCES program(program_id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."section" ADD CONSTRAINT "section_section_code_key" UNIQUE (section_code);
ALTER TABLE ONLY "public"."section" ADD CONSTRAINT "section_student_count_check" CHECK (student_count >= 0);
ALTER TABLE ONLY "public"."section" ADD CONSTRAINT "section_year_level_check" CHECK (year_level >= 1 AND year_level <= 6);
ALTER TABLE ONLY "public"."subject" ADD CONSTRAINT "subject_dept_id_fkey" FOREIGN KEY (dept_id) REFERENCES department(dept_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."subject" ADD CONSTRAINT "subject_lab_units_check" CHECK (lab_units >= 0::numeric);
ALTER TABLE ONLY "public"."subject" ADD CONSTRAINT "subject_lecture_units_check" CHECK (lecture_units >= 0::numeric);
ALTER TABLE ONLY "public"."subject" ADD CONSTRAINT "subject_pkey" PRIMARY KEY (subject_id);
ALTER TABLE ONLY "public"."subject" ADD CONSTRAINT "subject_subject_code_key" UNIQUE (subject_code);
ALTER TABLE ONLY "public"."subject" ADD CONSTRAINT "subject_total_units_check" CHECK (total_units >= 0::numeric);
ALTER TABLE ONLY "public"."subject_restriction" ADD CONSTRAINT "subject_restriction_check" CHECK (subject_id_1 <> subject_id_2);
ALTER TABLE ONLY "public"."subject_restriction" ADD CONSTRAINT "subject_restriction_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."subject_restriction" ADD CONSTRAINT "subject_restriction_pkey" PRIMARY KEY (restriction_id);
ALTER TABLE ONLY "public"."subject_restriction" ADD CONSTRAINT "subject_restriction_subject_id_1_fkey" FOREIGN KEY (subject_id_1) REFERENCES subject(subject_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."subject_restriction" ADD CONSTRAINT "subject_restriction_subject_id_2_fkey" FOREIGN KEY (subject_id_2) REFERENCES subject(subject_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."subject_restriction" ADD CONSTRAINT "subject_restriction_term_id_fkey" FOREIGN KEY (term_id) REFERENCES term(term_id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY "public"."term" ADD CONSTRAINT "term_check" CHECK (end_date >= start_date);
ALTER TABLE ONLY "public"."term" ADD CONSTRAINT "term_pkey" PRIMARY KEY (term_id);
ALTER TABLE ONLY "public"."term" ADD CONSTRAINT "term_term_name_school_year_key" UNIQUE (term_name, school_year);
ALTER TABLE ONLY "public"."time_slot" ADD CONSTRAINT "time_slot_check" CHECK (end_time > start_time);
ALTER TABLE ONLY "public"."time_slot" ADD CONSTRAINT "time_slot_day_of_week_start_time_end_time_key" UNIQUE (day_of_week, start_time, end_time);
ALTER TABLE ONLY "public"."time_slot" ADD CONSTRAINT "time_slot_pkey" PRIMARY KEY (timeslot_id);
ALTER TABLE ONLY "public"."user_notification_setting" ADD CONSTRAINT "user_notification_setting_pkey" PRIMARY KEY (user_id, trigger_key);
ALTER TABLE ONLY "public"."user_notification_setting" ADD CONSTRAINT "user_notification_setting_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."users" ADD CONSTRAINT "users_dept_id_fkey" FOREIGN KEY (dept_id) REFERENCES department(dept_id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."users" ADD CONSTRAINT "users_email_key" UNIQUE (email);
ALTER TABLE ONLY "public"."users" ADD CONSTRAINT "users_faculty_id_fkey" FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY "public"."users" ADD CONSTRAINT "users_faculty_id_key" UNIQUE (faculty_id);
ALTER TABLE ONLY "public"."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (user_id);
ALTER TABLE ONLY "public"."users" ADD CONSTRAINT "users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."users" ADD CONSTRAINT "users_username_key" UNIQUE (username);

-- Standalone indexes

CREATE INDEX audit_trail_timestamp_idx ON public.audit_trail USING btree ("timestamp" DESC);
CREATE INDEX audit_trail_user_id_idx ON public.audit_trail USING btree (user_id);
CREATE INDEX idx_auto_generate_lock_expires ON public.auto_generate_lock USING btree (expires_at);
CREATE INDEX idx_conversation_member_user ON public.conversation_member USING btree (user_id);
CREATE INDEX faculty_dept_id_idx ON public.faculty USING btree (dept_id);
CREATE INDEX faculty_designation_id_idx ON public.faculty USING btree (designation_id);
CREATE INDEX faculty_commitment_faculty_id_idx ON public.faculty_commitment USING btree (faculty_id);
CREATE INDEX faculty_commitment_term_id_idx ON public.faculty_commitment USING btree (term_id);
CREATE INDEX faculty_preference_faculty_id_idx ON public.faculty_preference USING btree (faculty_id);
CREATE INDEX faculty_qualification_faculty_id_idx ON public.faculty_qualification USING btree (faculty_id);
CREATE INDEX faculty_qualification_subject_id_idx ON public.faculty_qualification USING btree (subject_id);
CREATE INDEX faculty_request_faculty_id_idx ON public.faculty_request USING btree (faculty_id);
CREATE INDEX faculty_request_requesting_dept_id_idx ON public.faculty_request USING btree (requesting_dept_id);
CREATE INDEX faculty_request_status_idx ON public.faculty_request USING btree (status) WHERE (status = 'pending'::faculty_request_status);
CREATE INDEX faculty_request_subject_id_idx ON public.faculty_request USING btree (subject_id);
CREATE INDEX faculty_request_target_dept_id_idx ON public.faculty_request USING btree (target_dept_id);
CREATE INDEX faculty_request_term_id_idx ON public.faculty_request USING btree (term_id);
CREATE INDEX idx_faculty_unavailability_faculty ON public.faculty_unavailability USING btree (faculty_id);
CREATE INDEX idx_faculty_unavailability_faculty_day ON public.faculty_unavailability USING btree (faculty_id, day_of_week);
CREATE UNIQUE INDEX uq_faculty_unavailability_external ON public.faculty_unavailability USING btree (faculty_id, external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX idx_message_conversation_created ON public.message USING btree (conversation_id, created_at DESC);
CREATE INDEX minor_subject_schedule_term_id_idx ON public.minor_subject_schedule USING btree (term_id);
CREATE INDEX idx_notification_created_at ON public.notification USING btree (created_at);
CREATE INDEX idx_notification_recipient_category ON public.notification USING btree (recipient_id, category);
CREATE INDEX idx_notification_recipient_created ON public.notification USING btree (recipient_id, created_at DESC);
CREATE INDEX idx_notification_recipient_unread ON public.notification USING btree (recipient_id, created_at DESC) WHERE (is_read = false);
CREATE INDEX program_dept_id_idx ON public.program USING btree (dept_id);
CREATE INDEX prospectus_program_id_idx ON public.prospectus USING btree (program_id);
CREATE INDEX prospectus_subject_id_idx ON public.prospectus USING btree (subject_id);
CREATE INDEX idx_prospectus_pdf_dept ON public.prospectus_pdf USING btree (department_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_prospectus_pdf_uploaded_by ON public.prospectus_pdf USING btree (uploaded_by) WHERE (deleted_at IS NULL);
CREATE INDEX idx_prospectus_pdf_table_pdf ON public.prospectus_pdf_table USING btree (pdf_id);
CREATE INDEX room_dept_id_idx ON public.room USING btree (dept_id);
CREATE INDEX idx_room_preference_dept ON public.room_preference USING btree (dept_id);
CREATE INDEX idx_room_preference_room ON public.room_preference USING btree (room_id);
CREATE INDEX idx_schedule_external_faculty ON public.schedule USING btree (external_faculty_name) WHERE (external_faculty_name IS NOT NULL);
CREATE INDEX idx_schedule_external_room ON public.schedule USING btree (external_room_name) WHERE (external_room_name IS NOT NULL);
CREATE INDEX idx_schedule_flagged ON public.schedule USING btree (flagged) WHERE (flagged = true);
CREATE INDEX idx_schedule_pending_faculty_dept ON public.schedule USING btree (pending_faculty_dept_id) WHERE (pending_faculty_dept_id IS NOT NULL);
CREATE INDEX idx_schedule_pending_faculty_request ON public.schedule USING btree (pending_faculty_request_id) WHERE (pending_faculty_request_id IS NOT NULL);
CREATE INDEX schedule_faculty_id_idx ON public.schedule USING btree (faculty_id);
CREATE INDEX schedule_room_id_idx ON public.schedule USING btree (room_id);
CREATE INDEX schedule_section_id_idx ON public.schedule USING btree (section_id);
CREATE INDEX schedule_status_idx ON public.schedule USING btree (status);
CREATE INDEX schedule_subject_id_idx ON public.schedule USING btree (subject_id);
CREATE INDEX schedule_term_id_idx ON public.schedule USING btree (term_id);
CREATE INDEX schedule_timeslot_id_idx ON public.schedule USING btree (timeslot_id);
CREATE UNIQUE INDEX uq_schedule_faculty_slot ON public.schedule USING btree (term_id, faculty_id, timeslot_id) WHERE ((faculty_id IS NOT NULL) AND (timeslot_id IS NOT NULL));
CREATE UNIQUE INDEX uq_schedule_room_slot ON public.schedule USING btree (term_id, room_id, timeslot_id) WHERE ((room_id IS NOT NULL) AND (timeslot_id IS NOT NULL));
CREATE INDEX idx_schedule_unscheduled_term ON public.schedule_unscheduled USING btree (term_id);
CREATE INDEX idx_schedule_version_term ON public.schedule_version USING btree (term_id, version_number DESC);
CREATE INDEX schedule_version_faculty_id_idx ON public.schedule_version USING btree (faculty_id);
CREATE INDEX schedule_version_finalized_by_idx ON public.schedule_version USING btree (finalized_by);
CREATE INDEX schedule_version_term_id_idx ON public.schedule_version USING btree (term_id);
CREATE UNIQUE INDEX uq_schedule_version_term_wide ON public.schedule_version USING btree (term_id, version_number) WHERE (faculty_id IS NULL);
CREATE INDEX section_program_id_idx ON public.section USING btree (program_id);
CREATE INDEX section_section_code_idx ON public.section USING btree (section_code) WHERE is_active;
CREATE INDEX idx_subject_is_minor ON public.subject USING btree (is_minor) WHERE (is_minor = true);
CREATE INDEX subject_dept_id_idx ON public.subject USING btree (dept_id);
CREATE INDEX subject_restriction_created_by_idx ON public.subject_restriction USING btree (created_by);
CREATE INDEX subject_restriction_subject_id_1_idx ON public.subject_restriction USING btree (subject_id_1);
CREATE INDEX subject_restriction_subject_id_2_idx ON public.subject_restriction USING btree (subject_id_2);
CREATE INDEX subject_restriction_term_id_idx ON public.subject_restriction USING btree (term_id);
CREATE UNIQUE INDEX uq_term_single_active ON public.term USING btree (is_active) WHERE is_active;
CREATE INDEX users_dept_id_idx ON public.users USING btree (dept_id);

-- Views


-- Functions and procedures

CREATE OR REPLACE FUNCTION public.auto_generate_lock_key(p_term_id text)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select ('x' || substr(md5('auto_generate:' || p_term_id), 1, 16))::bit(64)::bigint;
$function$;
CREATE OR REPLACE FUNCTION public.cleanup_expired_auto_generate_locks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_deleted int;
begin
  delete from public.auto_generate_lock
  where expires_at < now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;
CREATE OR REPLACE FUNCTION public.current_user_dept()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select dept_id from public.users where user_id = auth.uid() and is_active;
$function$;
CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from public.users where user_id = auth.uid() and is_active;
$function$;
CREATE OR REPLACE FUNCTION public.enforce_schedule_status_flow()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.get_auto_generate_lock(p_term_id bigint)
 RETURNS TABLE(held_by uuid, state text, expires_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select acquired_by, state, expires_at
  from public.auto_generate_lock
  where term_id = p_term_id
    and expires_at > now();
$function$;
CREATE OR REPLACE FUNCTION public.get_auto_generate_lock_state(p_term_id bigint)
 RETURNS TABLE(held_by uuid, state text, expires_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select acquired_by, state, expires_at
  from public.auto_generate_lock
  where term_id = p_term_id;
$function$;
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.mark_auto_generate_pending(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer DEFAULT 600)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.auto_generate_lock
  set state = 'pending_confirm',
      expires_at = now() + (p_ttl_seconds || ' seconds')::interval
  where term_id = p_term_id
    and acquired_by = p_user_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.prevent_owned_room_preference()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.release_auto_generate_lock(p_term_id bigint, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.auto_generate_lock
  where term_id = p_term_id
    and acquired_by = p_user_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.release_auto_generate_lock(p_term_id text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  select pg_advisory_unlock(public.auto_generate_lock_key(p_term_id));
$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.try_acquire_auto_generate_lock(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer DEFAULT 120)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.try_auto_generate_lock(p_term_id text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  select pg_try_advisory_lock(public.auto_generate_lock_key(p_term_id));
$function$;
CREATE OR REPLACE FUNCTION public.update_room_preference_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Triggers, including Supabase Auth profile creation

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
CREATE TRIGGER trg_faculty_request_updated_at BEFORE UPDATE ON faculty_request FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_prospectus_pdf_touch BEFORE UPDATE ON prospectus_pdf FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_prospectus_pdf_table_touch BEFORE UPDATE ON prospectus_pdf_table FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_prevent_owned_room_preference BEFORE INSERT OR UPDATE ON room_preference FOR EACH ROW EXECUTE FUNCTION prevent_owned_room_preference();
CREATE TRIGGER trg_room_preference_updated_at BEFORE UPDATE ON room_preference FOR EACH ROW EXECUTE FUNCTION update_room_preference_timestamp();
CREATE TRIGGER trg_schedule_status_flow BEFORE UPDATE OF status ON schedule FOR EACH ROW EXECUTE FUNCTION enforce_schedule_status_flow();
CREATE TRIGGER trg_schedule_updated_at BEFORE UPDATE ON schedule FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_scheduling_setting_updated_at BEFORE UPDATE ON scheduling_setting FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_section_updated_at BEFORE UPDATE ON section FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS enablement and policies

ALTER TABLE "public"."audit_trail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."auto_generate_lock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."conversation_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cross_department_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."designation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."faculty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."faculty_commitment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."faculty_preference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."faculty_qualification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."faculty_request" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."faculty_unavailability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."minor_subject_schedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."program" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."prospectus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."prospectus_pdf" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."prospectus_pdf_table" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."room" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."room_preference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."schedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."schedule_unscheduled" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."schedule_version" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scheduling_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subject_restriction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."term" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."time_slot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_notification_setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_insert_own" ON "public"."audit_trail" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "audit_read" ON "public"."audit_trail" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role])));
CREATE POLICY "conversation_select_member" ON "public"."conversation" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM conversation_member cm
  WHERE ((cm.conversation_id = conversation.conversation_id) AND (cm.user_id = auth.uid())))));
CREATE POLICY "conversation_member_select_own" ON "public"."conversation_member" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((user_id = auth.uid()));
CREATE POLICY "conversation_member_update_own" ON "public"."conversation_member" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "read_authenticated" ON "public"."department" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_administrator" ON "public"."department" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "read_authenticated" ON "public"."designation" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_administrator" ON "public"."designation" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "read_authenticated" ON "public"."faculty" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_administrator" ON "public"."faculty" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "read_authenticated" ON "public"."faculty_commitment" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_staff" ON "public"."faculty_commitment" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role, 'department_head'::user_role]))) WITH CHECK ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role, 'department_head'::user_role])));
CREATE POLICY "read_authenticated" ON "public"."faculty_preference" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_staff" ON "public"."faculty_preference" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role, 'department_head'::user_role]))) WITH CHECK ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role, 'department_head'::user_role])));
CREATE POLICY "read_authenticated" ON "public"."faculty_qualification" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_staff" ON "public"."faculty_qualification" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role, 'department_head'::user_role]))) WITH CHECK ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role, 'department_head'::user_role])));
CREATE POLICY "faculty_request_insert" ON "public"."faculty_request" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role])) OR ((current_user_role() = 'department_head'::user_role) AND (requesting_dept_id = current_user_dept()))));
CREATE POLICY "faculty_request_read" ON "public"."faculty_request" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role])) OR (current_user_role() = 'department_head'::user_role)));
CREATE POLICY "faculty_request_update" ON "public"."faculty_request" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role])) OR ((current_user_role() = 'department_head'::user_role) AND ((target_dept_id = current_user_dept()) OR (requesting_dept_id = current_user_dept())))));
CREATE POLICY "message_insert_member" ON "public"."message" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((sender_id = auth.uid()) AND (conversation_id IN ( SELECT conversation_member.conversation_id
   FROM conversation_member
  WHERE (conversation_member.user_id = auth.uid())))));
CREATE POLICY "message_select_member" ON "public"."message" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((conversation_id IN ( SELECT conversation_member.conversation_id
   FROM conversation_member
  WHERE (conversation_member.user_id = auth.uid()))));
CREATE POLICY "read_authenticated" ON "public"."minor_subject_schedule" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_administrator" ON "public"."minor_subject_schedule" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "read_authenticated" ON "public"."program" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_administrator" ON "public"."program" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "read_authenticated" ON "public"."prospectus" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_administrator" ON "public"."prospectus" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "read_authenticated" ON "public"."room" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_administrator" ON "public"."room" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "schedule_read" ON "public"."schedule" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "schedule_write_dean_admin" ON "public"."schedule" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role]))) WITH CHECK ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role])));
CREATE POLICY "schedule_write_dept_head" ON "public"."schedule" AS PERMISSIVE FOR ALL TO "authenticated" USING (((current_user_role() = 'department_head'::user_role) AND (status <> 'published'::schedule_status) AND (EXISTS ( SELECT 1
   FROM subject s
  WHERE ((s.subject_id = schedule.subject_id) AND (s.dept_id = current_user_dept())))))) WITH CHECK (((current_user_role() = 'department_head'::user_role) AND (EXISTS ( SELECT 1
   FROM subject s
  WHERE ((s.subject_id = schedule.subject_id) AND (s.dept_id = current_user_dept()))))));
CREATE POLICY "read_authenticated" ON "public"."schedule_version" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_staff" ON "public"."schedule_version" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role, 'department_head'::user_role]))) WITH CHECK ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role, 'department_head'::user_role])));
CREATE POLICY "read_authenticated" ON "public"."scheduling_setting" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_administrator" ON "public"."scheduling_setting" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "section_read" ON "public"."section" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "section_write_admin" ON "public"."section" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role, 'department_head'::user_role]))) WITH CHECK ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role, 'department_head'::user_role])));
CREATE POLICY "read_authenticated" ON "public"."subject" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_administrator" ON "public"."subject" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "read_authenticated" ON "public"."subject_restriction" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_staff" ON "public"."subject_restriction" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role, 'department_head'::user_role]))) WITH CHECK ((current_user_role() = ANY (ARRAY['administrator'::user_role, 'college_dean'::user_role, 'department_head'::user_role])));
CREATE POLICY "read_authenticated" ON "public"."term" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_administrator" ON "public"."term" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "read_authenticated" ON "public"."time_slot" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "write_administrator" ON "public"."time_slot" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "users_admin_write" ON "public"."users" AS PERMISSIVE FOR ALL TO "authenticated" USING ((current_user_role() = 'administrator'::user_role)) WITH CHECK ((current_user_role() = 'administrator'::user_role));
CREATE POLICY "users_select_self_or_admin" ON "public"."users" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((user_id = auth.uid()) OR (current_user_role() = 'administrator'::user_role)));

-- Rewrite rules


-- Comments

COMMENT ON COLUMN "public"."prospectus_pdf_table"."columns" IS 'Array of {role: code|title|prereq|lec|lab|total, x_start_pt, x_end_pt}';
COMMENT ON COLUMN "public"."prospectus_pdf_table"."rows" IS 'Array of {row_id: string, y_top_pt, y_bottom_pt}';
COMMENT ON TABLE "public"."prospectus_pdf" IS 'Uploaded prospectus PDFs. One per department typically; multiple allowed for audit.';
COMMENT ON TABLE "public"."prospectus_pdf_table" IS 'User-drawn table mappings inside a prospectus PDF.';

-- Explicit schema and object grants

GRANT CREATE, USAGE ON SCHEMA "public" TO "pg_database_owner";
GRANT USAGE ON SCHEMA "public" TO PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."department_dept_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."department_dept_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."department_dept_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."department_dept_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."designation_designation_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."designation_designation_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."designation_designation_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."designation_designation_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."time_slot_timeslot_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."time_slot_timeslot_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."time_slot_timeslot_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."time_slot_timeslot_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."program_program_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."program_program_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."program_program_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."program_program_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."prospectus_prospectus_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."prospectus_prospectus_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."prospectus_prospectus_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."prospectus_prospectus_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_faculty_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_faculty_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_faculty_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_faculty_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_qualification_qual_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_qualification_qual_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_qualification_qual_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_qualification_qual_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_commitment_commitment_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_commitment_commitment_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_commitment_commitment_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_commitment_commitment_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_preference_preference_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_preference_preference_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_preference_preference_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_preference_preference_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."room_room_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."room_room_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."room_room_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."room_room_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."audit_trail_audit_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."audit_trail_audit_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."audit_trail_audit_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."audit_trail_audit_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."schedule_schedule_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."schedule_schedule_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."schedule_schedule_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."schedule_schedule_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."schedule_version_version_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."schedule_version_version_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."schedule_version_version_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."schedule_version_version_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."minor_subject_schedule_minor_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."minor_subject_schedule_minor_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."minor_subject_schedule_minor_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."minor_subject_schedule_minor_id_seq" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."department" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."department" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."department" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."department" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."designation" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."designation" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."designation" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."designation" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."subject_restriction_restriction_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."subject_restriction_restriction_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."subject_restriction_restriction_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."subject_restriction_restriction_id_seq" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."time_slot" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."time_slot" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."time_slot" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."time_slot" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scheduling_setting" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scheduling_setting" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scheduling_setting" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scheduling_setting" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."program" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."program" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."program" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."program" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."room" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."room" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."room" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."room" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."minor_subject_schedule" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."minor_subject_schedule" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."minor_subject_schedule" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."minor_subject_schedule" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_qualification" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_qualification" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_qualification" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_qualification" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_preference" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_preference" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_preference" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_preference" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_commitment" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_commitment" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_commitment" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_commitment" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."subject_restriction" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."subject_restriction" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."subject_restriction" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."subject_restriction" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."schedule_version" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."schedule_version" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."schedule_version" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."schedule_version" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_trail" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_trail" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_trail" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_trail" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_request" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_request" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_request" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_request" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."section" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."section" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."section" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."section" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."section_section_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."section_section_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."section_section_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."section_section_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_request_request_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_request_request_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_request_request_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_request_request_id_seq" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."term" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."term" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."term" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."term" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."subject" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."subject" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."subject" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."subject" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."schedule_unscheduled" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."schedule_unscheduled" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."schedule_unscheduled" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."schedule_unscheduled" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."schedule" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."schedule" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."schedule" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."schedule" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cross_department_request" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cross_department_request" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cross_department_request" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cross_department_request" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."subject_subject_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."subject_subject_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."subject_subject_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."subject_subject_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."term_term_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."term_term_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."term_term_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."term_term_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."schedule_unscheduled_unscheduled_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."schedule_unscheduled_unscheduled_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."schedule_unscheduled_unscheduled_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."schedule_unscheduled_unscheduled_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."conversation_conversation_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."conversation_conversation_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."conversation_conversation_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."conversation_conversation_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."message_message_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."message_message_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."message_message_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."message_message_id_seq" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."conversation" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."conversation" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."conversation" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."conversation" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."conversation_member" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."conversation_member" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."conversation_member" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."conversation_member" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."message" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."message" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."message" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."message" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."prospectus_pdf" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."prospectus_pdf" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."prospectus_pdf" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."prospectus_pdf" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."prospectus_pdf_table" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."prospectus_pdf_table" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."prospectus_pdf_table" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."prospectus_pdf_table" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."auto_generate_lock" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."auto_generate_lock" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."auto_generate_lock" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."auto_generate_lock" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."prospectus_pdf_table_table_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."prospectus_pdf_table_table_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."prospectus_pdf_table_table_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."prospectus_pdf_table_table_id_seq" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."prospectus" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."prospectus" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."prospectus" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."prospectus" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."prospectus_pdf_pdf_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."prospectus_pdf_pdf_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."prospectus_pdf_pdf_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."prospectus_pdf_pdf_id_seq" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."notification_notification_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."notification_notification_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."notification_notification_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."notification_notification_id_seq" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notification" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notification" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notification" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notification" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_notification_setting" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_notification_setting" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_notification_setting" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_notification_setting" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_unavailability_unavailability_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_unavailability_unavailability_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_unavailability_unavailability_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."faculty_unavailability_unavailability_id_seq" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_unavailability" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_unavailability" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_unavailability" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."faculty_unavailability" TO "service_role";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."room_preference_preference_id_seq" TO "postgres";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."room_preference_preference_id_seq" TO "anon";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."room_preference_preference_id_seq" TO "authenticated";
GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."room_preference_preference_id_seq" TO "service_role";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."room_preference" TO "postgres";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."room_preference" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."room_preference" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."room_preference" TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."current_user_role"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."current_user_role"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."current_user_role"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."current_user_dept"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."current_user_dept"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."current_user_dept"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."current_user_dept"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."current_user_dept"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."enforce_schedule_status_flow"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."enforce_schedule_status_flow"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."enforce_schedule_status_flow"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."enforce_schedule_status_flow"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."enforce_schedule_status_flow"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."cleanup_expired_auto_generate_locks"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."cleanup_expired_auto_generate_locks"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."cleanup_expired_auto_generate_locks"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."cleanup_expired_auto_generate_locks"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."cleanup_expired_auto_generate_locks"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."handle_new_auth_user"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."handle_new_auth_user"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."auto_generate_lock_key"(p_term_id text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."auto_generate_lock_key"(p_term_id text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."auto_generate_lock_key"(p_term_id text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."auto_generate_lock_key"(p_term_id text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."auto_generate_lock_key"(p_term_id text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."try_auto_generate_lock"(p_term_id text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."try_auto_generate_lock"(p_term_id text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."try_auto_generate_lock"(p_term_id text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."try_auto_generate_lock"(p_term_id text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."try_auto_generate_lock"(p_term_id text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."release_auto_generate_lock"(p_term_id text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."release_auto_generate_lock"(p_term_id text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."release_auto_generate_lock"(p_term_id text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."release_auto_generate_lock"(p_term_id text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."release_auto_generate_lock"(p_term_id text) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."release_auto_generate_lock"(p_term_id bigint, p_user_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."release_auto_generate_lock"(p_term_id bigint, p_user_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."release_auto_generate_lock"(p_term_id bigint, p_user_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."release_auto_generate_lock"(p_term_id bigint, p_user_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."release_auto_generate_lock"(p_term_id bigint, p_user_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."try_acquire_auto_generate_lock"(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."try_acquire_auto_generate_lock"(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."try_acquire_auto_generate_lock"(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."try_acquire_auto_generate_lock"(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."try_acquire_auto_generate_lock"(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_auto_generate_lock_state"(p_term_id bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_auto_generate_lock_state"(p_term_id bigint) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_auto_generate_lock_state"(p_term_id bigint) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_auto_generate_lock_state"(p_term_id bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_auto_generate_lock_state"(p_term_id bigint) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."mark_auto_generate_pending"(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."mark_auto_generate_pending"(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."mark_auto_generate_pending"(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."mark_auto_generate_pending"(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."mark_auto_generate_pending"(p_term_id bigint, p_user_id uuid, p_ttl_seconds integer) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_auto_generate_lock"(p_term_id bigint) TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."get_auto_generate_lock"(p_term_id bigint) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."get_auto_generate_lock"(p_term_id bigint) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."get_auto_generate_lock"(p_term_id bigint) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_auto_generate_lock"(p_term_id bigint) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."prevent_owned_room_preference"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."prevent_owned_room_preference"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."prevent_owned_room_preference"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."prevent_owned_room_preference"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."prevent_owned_room_preference"() TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."update_room_preference_timestamp"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."update_room_preference_timestamp"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."update_room_preference_timestamp"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."update_room_preference_timestamp"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."update_room_preference_timestamp"() TO "service_role";

-- Default privileges

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT EXECUTE ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT EXECUTE ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT EXECUTE ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_auth_admin" IN SCHEMA "auth" GRANT EXECUTE ON FUNCTIONS TO "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql_public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql_public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql_public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql_public" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql_public" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql_public" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql_public" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql_public" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql_public" GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql_public" GRANT EXECUTE ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql_public" GRANT EXECUTE ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql_public" GRANT EXECUTE ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "postgres" WITH GRANT OPTION;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT EXECUTE ON FUNCTIONS TO "postgres" WITH GRANT OPTION;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "extensions" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "postgres" WITH GRANT OPTION;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql" GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql" GRANT EXECUTE ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql" GRANT EXECUTE ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql" GRANT EXECUTE ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "graphql" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "realtime" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "realtime" GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "realtime" GRANT EXECUTE ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "realtime" GRANT EXECUTE ON FUNCTIONS TO "dashboard_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "realtime" GRANT INSERT, SELECT ON TABLES TO "postgres" WITH GRANT OPTION;
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "realtime" GRANT DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "realtime" GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "dashboard_user";

-- Supabase Storage bucket configuration (bucket metadata only)

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES ('prospectus-pdfs','prospectus-pdfs',FALSE,NULL,NULL) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,public=EXCLUDED.public,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
