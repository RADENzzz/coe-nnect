-- =====================================================================
-- CoE-NNECT: College of Engineering Scheduling System (WMSU)
-- Supabase / PostgreSQL schema  (v2 - aligned with README)
-- Run in: Supabase Dashboard > SQL Editor
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Enum types
-- ---------------------------------------------------------------------
-- README roles: College Dean, Department Head, Administrator.
-- 'viewer' is the no-privilege default for accounts created without an explicit role.
create type public.user_role            as enum ('administrator', 'college_dean', 'department_head');
create type public.day_of_week          as enum ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday');
create type public.load_type            as enum ('lecture', 'laboratory', 'other');
create type public.room_type            as enum ('lecture_room', 'laboratory', 'computer_lab', 'drafting_room', 'other');
create type public.sync_status          as enum ('pending', 'synced', 'failed');
create type public.semester_type        as enum ('1st', '2nd', 'summer');
create type public.faculty_class        as enum ('regular', 'part_time', 'visiting_lecturer', 'other');
-- README workflow: Draft -> Review -> Finalize -> Publish
create type public.schedule_status      as enum ('draft', 'review', 'finalized', 'published');

-- ---------------------------------------------------------------------
-- 1. Shared helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Lookup / core tables
-- ---------------------------------------------------------------------
create table public.department (
  dept_id     bigint generated always as identity primary key,
  dept_code   text not null unique,
  dept_name   text not null,
  description text,
  is_active   boolean not null default true
);

create table public.designation (
  designation_id   bigint generated always as identity primary key,
  designation_name text not null unique,
  release_hours    numeric(5,2) not null default 0 check (release_hours >= 0)
);

create table public.term (
  term_id     bigint generated always as identity primary key,
  term_name   text not null,
  school_year text not null,                       -- e.g. '2026-2027'
  start_date  date not null,
  end_date    date not null,
  is_active   boolean not null default false,
  check (end_date >= start_date),
  unique (term_name, school_year)
);
-- only one active term at a time
create unique index uq_term_single_active on public.term (is_active) where is_active;

create table public.time_slot (
  timeslot_id bigint generated always as identity primary key,
  day_of_week public.day_of_week not null,
  start_time  time not null,
  end_time    time not null,
  duration    interval generated always as (end_time - start_time) stored,
  check (end_time > start_time),
  unique (day_of_week, start_time, end_time)
);

-- Tunable limits used by @coe-nnect/constraint-rules
-- (e.g. max_consecutive_hours, visiting_lecturer_max_hours, lab_split_hours).
create table public.scheduling_setting (
  setting_key text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);
create trigger trg_scheduling_setting_updated_at
  before update on public.scheduling_setting
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Academic structure
-- ---------------------------------------------------------------------
create table public.program (
  program_id   bigint generated always as identity primary key,
  program_code text not null unique,
  program_name text not null,
  dept_id      bigint not null references public.department(dept_id) on update cascade on delete restrict,
  is_active    boolean not null default true
);

create table public.subject (
  subject_id         bigint generated always as identity primary key,
  subject_code       text not null unique,
  title              text not null,
  total_units        numeric(4,1) not null check (total_units >= 0),
  lecture_units      numeric(4,1) not null default 0 check (lecture_units >= 0),
  lab_units          numeric(4,1) not null default 0 check (lab_units >= 0),
  required_room_type public.room_type,             -- for room-type validation (lab subjects -> laboratory, etc.)
  dept_id            bigint not null references public.department(dept_id) on update cascade on delete restrict,
  is_active          boolean not null default true
);

create table public.prospectus (
  prospectus_id bigint generated always as identity primary key,
  program_id    bigint not null references public.program(program_id) on update cascade on delete cascade,
  subject_id    bigint not null references public.subject(subject_id) on update cascade on delete cascade,
  year_level    smallint not null check (year_level between 1 and 6),
  semester      public.semester_type not null,
  is_active     boolean not null default true,
  unique (program_id, subject_id, year_level, semester)
);

-- ---------------------------------------------------------------------
-- 4. Faculty
-- ---------------------------------------------------------------------
create table public.faculty (
  faculty_id     bigint generated always as identity primary key,
  wmsu_id        text unique,
  employee_id    text unique,
  first_name     text not null,
  last_name      text not null,
  email          text unique,
  contact        text,
  dept_id        bigint references public.department(dept_id) on update cascade on delete set null,
  designation_id bigint references public.designation(designation_id) on update cascade on delete set null,
  classification public.faculty_class not null default 'regular',
  required_hours numeric(5,2) check (required_hours >= 0),
  sync_status    public.sync_status not null default 'pending',
  last_synced_at timestamptz,
  is_active      boolean not null default true
);

create table public.faculty_qualification (
  qual_id       bigint generated always as identity primary key,
  faculty_id    bigint not null references public.faculty(faculty_id) on update cascade on delete cascade,
  subject_id    bigint not null references public.subject(subject_id) on update cascade on delete cascade,
  source_system text,
  unique (faculty_id, subject_id)
);

create table public.faculty_preference (
  preference_id        bigint generated always as identity primary key,
  faculty_id           bigint not null references public.faculty(faculty_id) on update cascade on delete cascade,
  preferred_day        public.day_of_week not null,
  preferred_start_time time not null,
  preferred_end_time   time not null,
  check (preferred_end_time > preferred_start_time)
);

-- Non-class commitments pulled from the IDP (Individual Daily Program) system.
create table public.faculty_commitment (
  commitment_id bigint generated always as identity primary key,
  faculty_id    bigint not null references public.faculty(faculty_id) on update cascade on delete cascade,
  term_id       bigint references public.term(term_id) on update cascade on delete cascade,
  day_of_week   public.day_of_week not null,
  start_time    time not null,
  end_time      time not null,
  title         text,
  source_system text not null default 'IDP',
  external_id   text,                              -- id in the IDP system, for idempotent syncing
  last_synced_at timestamptz,
  check (end_time > start_time),
  unique (source_system, external_id)
);

-- ---------------------------------------------------------------------
-- 5. Users (linked to Supabase Auth) + audit trail
--    password_hash from the ERD is NOT stored: credentials live in auth.users.
--    There is NO public sign-up: accounts are created by an Administrator.
-- ---------------------------------------------------------------------
create table public.users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,
  email       text not null unique,
  employee_id text,
  wmsu_id     text,
  role        public.user_role not null default 'viewer',
  dept_id     bigint references public.department(dept_id) on update cascade on delete set null,  -- scope for department heads
  is_active   boolean not null default true,
  faculty_id  bigint unique references public.faculty(faculty_id) on update cascade on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create table public.audit_trail (
  audit_id      bigint generated always as identity primary key,
  user_id       uuid references public.users(user_id) on delete set null,
  "timestamp"   timestamptz not null default now(),
  action        text not null,
  affected_data jsonb,
  source_system text
);

-- ---------------------------------------------------------------------
-- 6. Rooms
-- ---------------------------------------------------------------------
create table public.room (
  room_id     bigint generated always as identity primary key,
  room_number text not null,
  building    text not null,
  room_type   public.room_type not null default 'lecture_room',
  capacity    integer check (capacity >= 0),
  dept_id     bigint references public.department(dept_id) on update cascade on delete set null,
  is_active   boolean not null default true,
  unique (building, room_number)
);

-- ---------------------------------------------------------------------
-- 7. Scheduling
-- ---------------------------------------------------------------------
create table public.schedule (
  schedule_id  bigint generated always as identity primary key,
  term_id      bigint not null references public.term(term_id) on update cascade on delete cascade,
  subject_id   bigint not null references public.subject(subject_id) on update cascade on delete restrict,
  faculty_id   bigint references public.faculty(faculty_id) on update cascade on delete set null,
  room_id      bigint references public.room(room_id) on update cascade on delete set null,
  timeslot_id  bigint references public.time_slot(timeslot_id) on update cascade on delete set null,
  section      text,
  load_type    public.load_type,
  status       public.schedule_status not null default 'draft',
  -- kept from the ERD, derived from the workflow status
  is_finalized boolean generated always as (status in ('finalized','published')) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_schedule_updated_at
  before update on public.schedule
  for each row execute function public.set_updated_at();

-- Hard conflict guards (README: no overlapping faculty / room classes).
-- These block exact same-slot double-booking; partial overlaps across
-- different time_slot rows still need to be checked by constraint-rules.
create unique index uq_schedule_room_slot
  on public.schedule (term_id, room_id, timeslot_id)
  where room_id is not null and timeslot_id is not null;
create unique index uq_schedule_faculty_slot
  on public.schedule (term_id, faculty_id, timeslot_id)
  where faculty_id is not null and timeslot_id is not null;

-- Enforce Draft <-> Review <-> Finalized <-> Published transitions
create or replace function public.enforce_schedule_status_flow()
returns trigger language plpgsql as $$
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
    ('published','finalized')      -- unpublish
  ) then
    return new;
  end if;

  raise exception 'Invalid schedule status change: % -> %', old.status, new.status;
end;
$$;
create trigger trg_schedule_status_flow
  before update of status on public.schedule
  for each row execute function public.enforce_schedule_status_flow();

create table public.schedule_version (
  version_id       bigint generated always as identity primary key,
  term_id          bigint not null references public.term(term_id) on update cascade on delete cascade,
  faculty_id       bigint references public.faculty(faculty_id) on update cascade on delete cascade,
  version_number   integer not null check (version_number > 0),
  snapshot         jsonb,                          -- optional copy of the schedule rows at this version
  last_modified_at timestamptz not null default now(),
  finalized_by     uuid references public.users(user_id) on delete set null,
  unique (term_id, faculty_id, version_number)
);

create table public.minor_subject_schedule (
  minor_id     bigint generated always as identity primary key,
  term_id      bigint not null references public.term(term_id) on update cascade on delete cascade,
  subject_code text not null,
  description  text,
  source_dept  text,
  day_of_week  public.day_of_week,
  start_time   time,
  end_time     time,
  check (end_time is null or start_time is null or end_time > start_time)
);

create table public.subject_restriction (
  restriction_id  bigint generated always as identity primary key,
  subject_id_1    bigint not null references public.subject(subject_id) on update cascade on delete cascade,
  subject_id_2    bigint not null references public.subject(subject_id) on update cascade on delete cascade,
  term_id         bigint references public.term(term_id) on update cascade on delete cascade,
  warning_message text,
  is_active       boolean not null default true,
  created_by      uuid references public.users(user_id) on delete set null,
  created_at      timestamptz not null default now(),
  check (subject_id_1 <> subject_id_2)
);

-- ---------------------------------------------------------------------
-- 8. Indexes on foreign keys
-- ---------------------------------------------------------------------
create index on public.program (dept_id);
create index on public.subject (dept_id);
create index on public.prospectus (program_id);
create index on public.prospectus (subject_id);
create index on public.faculty (dept_id);
create index on public.faculty (designation_id);
create index on public.faculty_qualification (faculty_id);
create index on public.faculty_qualification (subject_id);
create index on public.faculty_preference (faculty_id);
create index on public.faculty_commitment (faculty_id);
create index on public.faculty_commitment (term_id);
create index on public.users (dept_id);
create index on public.audit_trail (user_id);
create index on public.audit_trail ("timestamp" desc);
create index on public.room (dept_id);
create index on public.schedule (term_id);
create index on public.schedule (subject_id);
create index on public.schedule (faculty_id);
create index on public.schedule (room_id);
create index on public.schedule (timeslot_id);
create index on public.schedule (status);
create index on public.schedule_version (term_id);
create index on public.schedule_version (faculty_id);
create index on public.schedule_version (finalized_by);
create index on public.minor_subject_schedule (term_id);
create index on public.subject_restriction (subject_id_1);
create index on public.subject_restriction (subject_id_2);
create index on public.subject_restriction (term_id);
create index on public.subject_restriction (created_by);

-- ---------------------------------------------------------------------
-- 9. Row Level Security (starter policies - tighten as needed)
--    NOTE: the NestJS backend bypasses RLS if it connects with the
--    service_role key or a direct Postgres connection. RLS protects
--    access made through Supabase client libraries / PostgREST.
-- ---------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.users where user_id = auth.uid() and is_active;
$$;

create or replace function public.current_user_dept()
returns bigint
language sql stable security definer set search_path = public as $$
  select dept_id from public.users where user_id = auth.uid() and is_active;
$$;

do $$
declare
  t text;
begin
  -- Everyone signed in can read; ADMINISTRATOR manages these.
  foreach t in array array[
    'department','designation','term','time_slot','scheduling_setting',
    'program','subject','prospectus','faculty','room','minor_subject_schedule'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "read_authenticated" on public.%I for select to authenticated using (true)', t);
    execute format(
      'create policy "write_administrator" on public.%I for all to authenticated
         using (public.current_user_role() = ''administrator'')
         with check (public.current_user_role() = ''administrator'')', t);
  end loop;

  -- Faculty-related data & restrictions: administrator + department head (+ dean).
  foreach t in array array[
    'faculty_qualification','faculty_preference','faculty_commitment','subject_restriction','schedule_version'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "read_authenticated" on public.%I for select to authenticated using (true)', t);
    execute format(
      'create policy "write_staff" on public.%I for all to authenticated
         using (public.current_user_role() in (''administrator'',''college_dean'',''department_head''))
         with check (public.current_user_role() in (''administrator'',''college_dean'',''department_head''))', t);
  end loop;
end $$;

-- schedule: dean/admin edit anything; department heads edit only their own
-- department's subjects, and cannot touch published rows.
alter table public.schedule enable row level security;
create policy "schedule_read" on public.schedule for select to authenticated using (true);
create policy "schedule_write_dean_admin" on public.schedule for all to authenticated
  using (public.current_user_role() in ('administrator','college_dean'))
  with check (public.current_user_role() in ('administrator','college_dean'));
create policy "schedule_write_dept_head" on public.schedule for all to authenticated
  using (
    public.current_user_role() = 'department_head'
    and status <> 'published'
    and exists (select 1 from public.subject s
                where s.subject_id = schedule.subject_id
                  and s.dept_id = public.current_user_dept())
  )
  with check (
    public.current_user_role() = 'department_head'
    and exists (select 1 from public.subject s
                where s.subject_id = schedule.subject_id
                  and s.dept_id = public.current_user_dept())
  );

-- users: read own row (admins read all); only admins modify
alter table public.users enable row level security;
create policy "users_select_self_or_admin" on public.users for select to authenticated
  using (user_id = auth.uid() or public.current_user_role() = 'administrator');
create policy "users_admin_write" on public.users for all to authenticated
  using (public.current_user_role() = 'administrator')
  with check (public.current_user_role() = 'administrator');

-- audit_trail: admins & dean read; signed-in users insert their own entries
alter table public.audit_trail enable row level security;
create policy "audit_read" on public.audit_trail for select to authenticated
  using (public.current_user_role() in ('administrator','college_dean'));
create policy "audit_insert_own" on public.audit_trail for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 10. Admin-provisioned accounts (the site has NO public sign-up)
--
--   Setup: Supabase Dashboard > Authentication > Sign In / Providers >
--   turn OFF "Allow new users to sign up". Then only an Administrator
--   (via the NestJS backend using the service_role key, or the Dashboard)
--   can create accounts.
--
--   When an account is created, this trigger builds the matching
--   public.users profile from the auth user's *app_metadata*, which only
--   admin/service-role calls can set (users cannot edit it themselves).
--   Example backend call (supabase-js, service role):
--
--     supabase.auth.admin.createUser({
--       email: 'head.ce@wmsu.edu.ph',
--       password: '<temporary password>',
--       email_confirm: true,
--       app_metadata: { role: 'department_head', dept_id: 3, username: 'head.ce' }
--     });
--
--   Recognised keys: role, dept_id, faculty_id, username, employee_id, wmsu_id.
--   Missing role -> 'viewer'. Missing username -> email prefix.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
begin
  insert into public.users (user_id, username, email, role, dept_id, faculty_id, employee_id, wmsu_id)
  values (
    new.id,
    coalesce(nullif(meta->>'username', ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce(nullif(meta->>'role', '')::public.user_role, 'viewer'),
    nullif(meta->>'dept_id', '')::bigint,
    nullif(meta->>'faculty_id', '')::bigint,
    nullif(meta->>'employee_id', ''),
    nullif(meta->>'wmsu_id', '')
  );
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- FIRST ADMIN (bootstrap): create one user in Dashboard > Authentication > Users,
-- then promote them once from the SQL Editor:
--   update public.users set role = 'administrator' where email = 'you@wmsu.edu.ph';

-- ---------------------------------------------------------------------
-- 11. Optional starter data
-- ---------------------------------------------------------------------
-- insert into public.scheduling_setting (setting_key, value, description) values
--   ('max_consecutive_hours',        '3',  'Max consecutive class hours per faculty'),
--   ('visiting_lecturer_max_hours',  '12', 'Weekly teaching cap for visiting lecturers');