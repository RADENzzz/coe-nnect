-- ================================================================
-- CoE-NNECT — Prospectus PDF Workspace
-- Migration: 2026-10-11
-- Purpose: Store uploaded prospectus PDFs + user-drawn table
--          mappings. Each PDF is a self-contained workspace;
--          tables are labeled (year_level, semester).
-- ================================================================

-- ----------------------------------------------------------------
-- Table 1: prospectus_pdf
-- One row per uploaded PDF workspace.
-- ----------------------------------------------------------------
create table if not exists public.prospectus_pdf (
  pdf_id              bigint generated always as identity primary key,
  department_id       bigint not null references public.department(dept_id) on delete cascade,
  original_filename   text not null,
  storage_path        text not null,              -- e.g. 'prospectus-pdfs/dept-1/1697.../file.pdf'
  storage_bucket      text not null default 'prospectus-pdfs',
  file_size_bytes     bigint not null,
  page_count          int not null check (page_count > 0),
  page_width_pt       numeric(10, 4) not null,    -- PDF points, first page
  page_height_pt      numeric(10, 4) not null,
  notes               text,
  uploaded_by         uuid references public.users(user_id) on delete set null,
  uploaded_at         timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz                  -- soft delete
);

create index if not exists idx_prospectus_pdf_dept
  on public.prospectus_pdf (department_id)
  where deleted_at is null;

create index if not exists idx_prospectus_pdf_uploaded_by
  on public.prospectus_pdf (uploaded_by)
  where deleted_at is null;

comment on table public.prospectus_pdf is
  'Uploaded prospectus PDFs. One per department typically; multiple allowed for audit.';

-- ----------------------------------------------------------------
-- Table 2: prospectus_pdf_table
-- One row per (year_level, semester) mapping inside a PDF.
-- Max 3 rows per year per PDF (1st, 2nd, summer).
-- ----------------------------------------------------------------
create table if not exists public.prospectus_pdf_table (
  table_id            bigint generated always as identity primary key,
  pdf_id              bigint not null references public.prospectus_pdf(pdf_id) on delete cascade,
  year_level          smallint not null check (year_level between 1 and 6),
  semester            text not null check (semester in ('1st', '2nd', 'summer')),
  label               text,                        -- optional display override
  region_page_index   int not null check (region_page_index >= 0),
  region_x_start_pt   numeric(10, 4) not null,
  region_x_end_pt     numeric(10, 4) not null,
  region_y_start_pt   numeric(10, 4) not null,     -- PDF points, origin bottom-left
  region_y_end_pt     numeric(10, 4) not null,
  columns             jsonb not null,              -- [{role, x_start_pt, x_end_pt}, ...]
  rows                jsonb not null,              -- [{row_id, y_top_pt, y_bottom_pt}, ...]
  subject_count       int not null default 0,      -- cached, updated on save
  total_lec_units     int not null default 0,
  total_lab_units     int not null default 0,
  total_units         int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_prospectus_pdf_table_ys
    unique (pdf_id, year_level, semester)
);

create index if not exists idx_prospectus_pdf_table_pdf
  on public.prospectus_pdf_table (pdf_id);

comment on table public.prospectus_pdf_table is
  'User-drawn table mappings inside a prospectus PDF.';

comment on column public.prospectus_pdf_table.columns is
  'Array of {role: code|title|prereq|lec|lab|total, x_start_pt, x_end_pt}';

comment on column public.prospectus_pdf_table.rows is
  'Array of {row_id: string, y_top_pt, y_bottom_pt}';

-- ----------------------------------------------------------------
-- updated_at trigger (reusable for both tables)
-- ----------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_prospectus_pdf_touch on public.prospectus_pdf;
create trigger trg_prospectus_pdf_touch
  before update on public.prospectus_pdf
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_prospectus_pdf_table_touch on public.prospectus_pdf_table;
create trigger trg_prospectus_pdf_table_touch
  before update on public.prospectus_pdf_table
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------
-- Supabase Storage bucket (run once; comment out if bucket exists)
-- ----------------------------------------------------------------
-- insert into storage.buckets (id, name, public)
-- values ('prospectus-pdfs', 'prospectus-pdfs', false)
-- on conflict (id) do nothing;