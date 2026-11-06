-- Add the College Secretary role.
--
-- The secretary is a college-wide operational role: everything the
-- College Dean can do, except approvals, audit trail, reports and the
-- hidden dev tools.
--
-- This migration ONLY adds the enum value. Postgres forbids referencing
-- a freshly added enum value in the same transaction that adds it, so
-- the RLS policy updates live in 20261106000100_grant_college_secretary_rls.sql.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'college_secretary';
