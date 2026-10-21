import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

import { loadE2eEnv, optionalEnv, requireEnv } from './env';

/**
 * Deterministic data for the browser workflow tests.
 *
 * This seeds a dedicated E2E Supabase project (or a disposable local stack).
 * It never calls the demo seed and never creates the hidden administrator.
 */
export const E2E_DATA = {
  deptCode: 'E2E',
  deptName: 'E2E Engineering',
  programCode: 'BSE2E',
  programName: 'BS E2E Engineering',
  subjectCode: 'E2E 101',
  subjectTitle: 'E2E Scheduling Fundamentals',
  sectionCode: 'E2E-1A',
  facultyEmployeeId: 'E2E-FAC-001',
  facultyEmail: 'e2e.faculty@example.com',
  facultyFirstName: 'E2E',
  facultyLastName: 'Instructor',
  roomBuilding: 'E2E Building',
  roomNumber: 'E2E-101',
  termName: 'E2E First Semester',
  schoolYear: '2026-2027',
  headEmail: 'e2e.head@example.com',
  deanEmail: 'e2e.dean@example.com',
  defaultPassword: 'E2e!Passw0rd',
} as const;

/**
 * The plotted class. H-11 requires a standard 90-minute lecture block, so the
 * seed and the browser workflow must agree on these values.
 */
export const E2E_SCHEDULE = {
  day: 'Monday',
  startTime: '10:00',
  endTime: '11:30',
  startLabel: '10:00 AM',
  endLabel: '11:30 AM',
  durationMinutes: 90,
} as const;

export interface E2eState {
  departmentId: string;
  deptCode: string;         // <-- ADDED
  programId: string;
  subjectId: string;
  subjectCode: string;
  subjectTitle: string;
  termId: string;
  sectionCode: string;
  facultyId: string;
  roomId: string;
  headEmail: string;
  headPassword: string;
  deanEmail: string;
  deanPassword: string;
}

export const STATE_PATH = resolve(
  process.cwd(),
  'e2e',
  '.auth',
  'state.json',
);

type Db = SupabaseClient<any, 'public', any>;

function firstRow<T = Record<string, any>>(
  data: T[] | null,
): T | undefined {
  return data?.[0];
}

async function findFirst(
  db: Db,
  table: string,
  columns: string[],
  filters: Record<string, string>,
): Promise<Record<string, any> | null> {
  let query: any = db.from(table).select(columns.join(', '));
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }

  const { data, error } = await query.limit(1);
  if (error) {
    throw new Error(`Could not read ${table}: ${error.message}`);
  }
  return firstRow(data as Record<string, any>[] | null) ?? null;
}

async function insertRow(
  db: Db,
  table: string,
  values: Record<string, unknown>,
  idColumn: string,
): Promise<string> {
  const { data, error } = await db
    .from(table)
    .insert(values)
    .select(idColumn)
    .single();

  if (error || !data) {
    throw new Error(`Could not insert ${table}: ${error?.message ?? 'no row'}`);
  }
  return String((data as unknown as Record<string, unknown>)[idColumn]);
}

async function updateRow(
  db: Db,
  table: string,
  idColumn: string,
  id: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from(table)
    .update(values)
    .eq(idColumn, id);

  if (error) {
    throw new Error(`Could not update ${table}: ${error.message}`);
  }
}

async function deleteByTerm(
  db: Db,
  table: string,
  termId: string,
): Promise<void> {
  const { error } = await db.from(table).delete().eq('term_id', termId);
  if (error) {
    throw new Error(`Could not clear ${table}: ${error.message}`);
  }
}

async function ensureDepartment(db: Db): Promise<string> {
  const existing = await findFirst(db, 'department', ['dept_id'], {
    dept_code: E2E_DATA.deptCode,
  });
  const values = {
    dept_code: E2E_DATA.deptCode,
    dept_name: E2E_DATA.deptName,
    description: 'Disposable department for Playwright workflow tests.',
    is_active: true, 
  };

  if (existing) {
    await updateRow(
      db,
      'department',
      'dept_id',
      String(existing.dept_id),
      values,
    );
    return String(existing.dept_id);
  }
  return insertRow(db, 'department', values, 'dept_id');
}

async function ensureProgram(db: Db, deptId: string): Promise<string> {
  const existing = await findFirst(db, 'program', ['program_id'], {
    program_code: E2E_DATA.programCode,
  });
  const values = {
    program_code: E2E_DATA.programCode,
    program_name: E2E_DATA.programName,
    dept_id: deptId,
    is_active: true,
  };

  if (existing) {
    await updateRow(
      db,
      'program',
      'program_id',
      String(existing.program_id),
      values,
    );
    return String(existing.program_id);
  }
  return insertRow(db, 'program', values, 'program_id');
}

async function ensureSubject(db: Db, deptId: string): Promise<string> {
  const existing = await findFirst(db, 'subject', ['subject_id'], {
    subject_code: E2E_DATA.subjectCode,
  });
  const values = {
    subject_code: E2E_DATA.subjectCode,
    title: E2E_DATA.subjectTitle,
    total_units: 3,
    lecture_units: 3,
    lab_units: 0,
    required_room_type: null,
    dept_id: deptId,
    is_active: true,
    is_minor: false,
  };

  if (existing) {
    await updateRow(
      db,
      'subject',
      'subject_id',
      String(existing.subject_id),
      values,
    );
    return String(existing.subject_id);
  }
  return insertRow(db, 'subject', values, 'subject_id');
}

async function ensureTerm(db: Db): Promise<string> {
  // A test project should have exactly one active term. Deactivate anything
  // left over from a previous run before activating the E2E term.
  const { error: deactivateError } = await db
    .from('term')
    .update({ is_active: false })
    .neq('term_id', 0);
  if (deactivateError) {
    throw new Error(`Could not deactivate terms: ${deactivateError.message}`);
  }

  const existing = await findFirst(db, 'term', ['term_id'], {
    term_name: E2E_DATA.termName,
    school_year: E2E_DATA.schoolYear,
  });
  const values = {
    term_name: E2E_DATA.termName,
    school_year: E2E_DATA.schoolYear,
    start_date: '2026-08-01',
    end_date: '2026-12-20',
    is_active: true,
    semester: '1st',
  };

  if (existing) {
    await updateRow(db, 'term', 'term_id', String(existing.term_id), values);
    return String(existing.term_id);
  }
  return insertRow(db, 'term', values, 'term_id');
}

async function ensureFaculty(db: Db, deptId: string): Promise<string> {
  const existing = await findFirst(db, 'faculty', ['faculty_id'], {
    employee_id: E2E_DATA.facultyEmployeeId,
  });
  const values = {
    wmsu_id: 'E2E-WMSU-001',
    employee_id: E2E_DATA.facultyEmployeeId,
    first_name: E2E_DATA.facultyFirstName,
    last_name: E2E_DATA.facultyLastName,
    email: E2E_DATA.facultyEmail,
    dept_id: deptId,
    classification: 'regular',
    required_hours: 24,
    is_active: true,
  };

  if (existing) {
    await updateRow(
      db,
      'faculty',
      'faculty_id',
      String(existing.faculty_id),
      values,
    );
    return String(existing.faculty_id);
  }
  return insertRow(db, 'faculty', values, 'faculty_id');
}

async function ensureRoom(db: Db, deptId: string): Promise<string> {
  const existing = await findFirst(db, 'room', ['room_id'], {
    building: E2E_DATA.roomBuilding,
    room_number: E2E_DATA.roomNumber,
  });
  const values = {
    room_number: E2E_DATA.roomNumber,
    building: E2E_DATA.roomBuilding,
    room_type: 'lecture_room',
    capacity: 40,
    dept_id: deptId,
    is_active: true,
  };

  if (existing) {
    await updateRow(db, 'room', 'room_id', String(existing.room_id), values);
    return String(existing.room_id);
  }
  return insertRow(db, 'room', values, 'room_id');
}

async function ensureSection(db: Db, programId: string): Promise<string> {
  const existing = await findFirst(db, 'section', ['section_id'], {
    section_code: E2E_DATA.sectionCode,
  });
  const values = {
    section_code: E2E_DATA.sectionCode,
    program_id: programId,
    year_level: 1,
    student_count: 30,
    is_active: true,
  };

  if (existing) {
    await updateRow(
      db,
      'section',
      'section_id',
      String(existing.section_id),
      values,
    );
    return String(existing.section_id);
  }
  return insertRow(db, 'section', values, 'section_id');
}

async function ensureProspectus(
  db: Db,
  programId: string,
  subjectId: string,
): Promise<void> {
  const filters: Record<string, string> = {
    program_id: programId,
    subject_id: subjectId,
    year_level: '1',
    semester: '1st',
  };
  const existing = await findFirst(
    db,
    'prospectus',
    ['prospectus_id'],
    filters,
  );
  const values = {
    program_id: programId,
    subject_id: subjectId,
    year_level: 1,
    semester: '1st',
    is_active: true,
    lecture_sessions_per_week: 1,
    lecture_minutes_per_session: E2E_SCHEDULE.durationMinutes,
    lab_sessions_per_week: 1,
    lab_minutes_per_session: 180,
  };

  if (existing) {
    await updateRow(
      db,
      'prospectus',
      'prospectus_id',
      String(existing.prospectus_id),
      values,
    );
    return;
  }
  await insertRow(db, 'prospectus', values, 'prospectus_id');
}

async function clearTermWork(
  db: Db,
  termId: string,
): Promise<void> {
  await deleteByTerm(db, 'schedule', termId);
  await deleteByTerm(db, 'schedule_version', termId);
  await deleteByTerm(db, 'schedule_unscheduled', termId);
  await deleteByTerm(db, 'auto_generate_lock', termId);
  await deleteByTerm(db, 'faculty_request', termId);
}

async function ensureUser(
  db: Db,
  params: {
    email: string;
    password: string;
    username: string;
    role: 'department_head' | 'college_dean';
    deptId: string | null;
  },
): Promise<string> {
  const { data: userList, error: listError } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) {
    throw new Error(`Could not list auth users: ${listError.message}`);
  }

  const existing = userList.users.find(
    (user) => user.email?.toLowerCase() === params.email.toLowerCase(),
  );

  const appMetadata = {
    ...(existing?.app_metadata ?? {}),
    role: params.role,
    username: params.username,
    dept_id: params.deptId ? String(params.deptId) : null,
  };
  const userMetadata = {
    ...(existing?.user_metadata ?? {}),
    full_name: params.username,
    role: params.role,
  };

  let userId: string;
  if (existing) {
    const { data, error } = await db.auth.admin.updateUserById(existing.id, {
      password: params.password,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: userMetadata,
      ban_duration: 'none',   // ALWAYS unban on seed
    });
    if (error || !data.user) {
      throw new Error(`Could not update E2E user: ${error?.message ?? 'no user'}`);
    }
    userId = data.user.id;
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: params.email,
      password: params.password,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: userMetadata,
    });
    if (error || !data.user) {
      throw new Error(`Could not create E2E user: ${error?.message ?? 'no user'}`);
    }
    userId = data.user.id;
  }

  const { error: profileError } = await db
    .from('users')
    .delete()
    .eq('email', params.email)
    .neq('user_id', userId);
  if (profileError) {
    throw new Error(`Could not clean stale profile: ${profileError.message}`);
  }

  const { error: upsertError } = await db.from('users').upsert(
    {
      user_id: userId,
      username: params.username,
      email: params.email,
      role: params.role,
      dept_id: params.deptId,
      is_active: true,
    },
    { onConflict: 'user_id' },
  );
  if (upsertError) {
    throw new Error(`Could not upsert profile: ${upsertError.message}`);
  }

  return userId;
}

export async function seedE2eData(): Promise<E2eState> {
  loadE2eEnv();

  const supabaseUrl = requireEnv('E2E_SUPABASE_URL');
  const serviceRoleKey = requireEnv('E2E_SUPABASE_SERVICE_ROLE_KEY');
  requireEnv('E2E_SUPABASE_ANON_KEY');

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const headEmail = optionalEnv('E2E_HEAD_EMAIL', E2E_DATA.headEmail);
  const deanEmail = optionalEnv('E2E_DEAN_EMAIL', E2E_DATA.deanEmail);
  const headPassword = optionalEnv(
    'E2E_HEAD_PASSWORD',
    E2E_DATA.defaultPassword,
  );
  const deanPassword = optionalEnv(
    'E2E_DEAN_PASSWORD',
    E2E_DATA.defaultPassword,
  );

  const departmentId = await ensureDepartment(db);
  const programId = await ensureProgram(db, departmentId);
  const subjectId = await ensureSubject(db, departmentId);
  const termId = await ensureTerm(db);
  const facultyId = await ensureFaculty(db, departmentId);
  const roomId = await ensureRoom(db, departmentId);

  await ensureSection(db, programId);
  await ensureProspectus(db, programId, subjectId);
  await clearTermWork(db, termId);

  await ensureUser(db, {
    email: headEmail,
    password: headPassword,
    username: 'e2e-head',
    role: 'department_head',
    deptId: departmentId,
  });
  await ensureUser(db, {
    email: deanEmail,
    password: deanPassword,
    username: 'e2e-dean',
    role: 'college_dean',
    deptId: null,
  });

  const state: E2eState = {
    departmentId,
    deptCode: E2E_DATA.deptCode,  // <-- ADDED
    programId,
    subjectId,
    subjectCode: E2E_DATA.subjectCode,
    subjectTitle: E2E_DATA.subjectTitle,
    termId,
    sectionCode: E2E_DATA.sectionCode,
    facultyId,
    roomId,
    headEmail,
    headPassword,
    deanEmail,
    deanPassword,
  };

  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');

  return state;
}

export function loadE2eState(): E2eState {
  if (!existsSync(STATE_PATH)) {
    throw new Error(
      'E2E state is missing. Playwright global setup must seed the test project first.',
    );
  }
  return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as E2eState;
}