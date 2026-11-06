-- Keep the role-gated RLS write policies in sync with the new
-- college_secretary role.
--
-- The NestJS API talks to Postgres through DATABASE_URL and therefore
-- bypasses RLS, but any direct Supabase client (SQL editor, scripts,
-- future clients) must still see the secretary as an authorised writer.
--
-- Approvals (faculty_request), the audit trail and schedules stay
-- Dean-only on purpose.

-- Sections
ALTER POLICY section_write_admin ON public.section
  USING (
    public.current_user_role() = ANY (
      ARRAY['administrator', 'college_dean', 'college_secretary', 'department_head']::public.user_role[]
    )
  )
  WITH CHECK (
    public.current_user_role() = ANY (
      ARRAY['administrator', 'college_dean', 'college_secretary', 'department_head']::public.user_role[]
    )
  );

-- Faculty commitments
ALTER POLICY write_staff ON public.faculty_commitment
  USING (
    public.current_user_role() = ANY (
      ARRAY['administrator', 'college_dean', 'college_secretary', 'department_head']::public.user_role[]
    )
  )
  WITH CHECK (
    public.current_user_role() = ANY (
      ARRAY['administrator', 'college_dean', 'college_secretary', 'department_head']::public.user_role[]
    )
  );

-- Faculty preferences
ALTER POLICY write_staff ON public.faculty_preference
  USING (
    public.current_user_role() = ANY (
      ARRAY['administrator', 'college_dean', 'college_secretary', 'department_head']::public.user_role[]
    )
  )
  WITH CHECK (
    public.current_user_role() = ANY (
      ARRAY['administrator', 'college_dean', 'college_secretary', 'department_head']::public.user_role[]
    )
  );

-- Faculty qualifications
ALTER POLICY write_staff ON public.faculty_qualification
  USING (
    public.current_user_role() = ANY (
      ARRAY['administrator', 'college_dean', 'college_secretary', 'department_head']::public.user_role[]
    )
  )
  WITH CHECK (
    public.current_user_role() = ANY (
      ARRAY['administrator', 'college_dean', 'college_secretary', 'department_head']::public.user_role[]
    )
  );

-- Subject restrictions
ALTER POLICY write_staff ON public.subject_restriction
  USING (
    public.current_user_role() = ANY (
      ARRAY['administrator', 'college_dean', 'college_secretary', 'department_head']::public.user_role[]
    )
  )
  WITH CHECK (
    public.current_user_role() = ANY (
      ARRAY['administrator', 'college_dean', 'college_secretary', 'department_head']::public.user_role[]
    )
  );
