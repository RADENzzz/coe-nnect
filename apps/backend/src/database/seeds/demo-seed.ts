import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findAuthUserByEmail(email: string) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) return null;
  return (
    (data?.users ?? []).find(
      (u) => (u as { email?: string }).email?.toLowerCase() === email.toLowerCase(),
    ) ?? null
  );
}

// ─────────────────────────────────────────────
// Demo credentials — all dept heads share this password for convenience
// ─────────────────────────────────────────────
const DEMO_PASSWORD = 'Demo!2345';

// ─────────────────────────────────────────────
// Data to seed
// ─────────────────────────────────────────────
const DEPARTMENTS = [
  {
    dept_code: 'BSCPE',
    dept_name: 'Computer Engineering',
    description: 'Department of Computer Engineering',
  },
  {
    dept_code: 'EE',
    dept_name: 'Electrical Engineering',
    description: 'Department of Electrical Engineering',
  },
  {
    dept_code: 'ME',
    dept_name: 'Mechanical Engineering',
    description: 'Department of Mechanical Engineering',
  },
];

const FACULTY = [
  // CpE
  {
    wmsu_id: 'WMSU-001',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    email: 'juan.dc@wmsu.edu.ph',
    dept_code: 'BSCPE',
    classification: 'regular',
    required_hours: 18,
  },
  {
    wmsu_id: 'WMSU-002',
    first_name: 'Maria',
    last_name: 'Santos',
    email: 'maria.s@wmsu.edu.ph',
    dept_code: 'BSCPE',
    classification: 'regular',
    required_hours: 18,
  },
  {
    wmsu_id: 'WMSU-003',
    first_name: 'Pedro',
    last_name: 'Reyes',
    email: 'pedro.r@wmsu.edu.ph',
    dept_code: 'BSCPE',
    classification: 'regular',
    required_hours: 18,
  },
  // EE
  {
    wmsu_id: 'WMSU-004',
    first_name: 'Ana',
    last_name: 'Ramos',
    email: 'ana.r@wmsu.edu.ph',
    dept_code: 'EE',
    classification: 'regular',
    required_hours: 18,
  },
  {
    wmsu_id: 'WMSU-005',
    first_name: 'Luis',
    last_name: 'Tan',
    email: 'luis.t@wmsu.edu.ph',
    dept_code: 'EE',
    classification: 'regular',
    required_hours: 18,
  },
  // ME
  {
    wmsu_id: 'WMSU-006',
    first_name: 'Carlo',
    last_name: 'Mendez',
    email: 'carlo.m@wmsu.edu.ph',
    dept_code: 'ME',
    classification: 'regular',
    required_hours: 18,
  },
];

const SUBJECTS = [
  // CpE — pure lecture
  {
    subject_code: 'CPE 101',
    title: 'Programming Logic & Design',
    total_units: 3,
    lecture_units: 3,
    lab_units: 0,
    required_room_type: null,
    dept_code: 'BSCPE',
  },
  // CpE — combined lecture + lab
  {
    subject_code: 'CPE 102',
    title: 'Computer Programming 2',
    total_units: 4,
    lecture_units: 3,
    lab_units: 1,
    required_room_type: null,
    dept_code: 'BSCPE',
  },
  // CpE — pure lab
  {
    subject_code: 'CPE 103',
    title: 'Digital Logic Laboratory',
    total_units: 1,
    lecture_units: 0,
    lab_units: 1,
    required_room_type: 'laboratory',
    dept_code: 'BSCPE',
  },
  // CpE — 2-unit lab
  {
    subject_code: 'CPE 104',
    title: 'Data Structures & Algorithms',
    total_units: 2,
    lecture_units: 0,
    lab_units: 2,
    required_room_type: 'computer_lab',
    dept_code: 'BSCPE',
  },
  // EE — pure lecture
  {
    subject_code: 'EE 101',
    title: 'Circuit Analysis I',
    total_units: 3,
    lecture_units: 3,
    lab_units: 0,
    required_room_type: null,
    dept_code: 'EE',
  },
  // EE — combined
  {
    subject_code: 'EE 102',
    title: 'Electronics I',
    total_units: 4,
    lecture_units: 3,
    lab_units: 1,
    required_room_type: null,
    dept_code: 'EE',
  },
  // ME — pure lecture
  {
    subject_code: 'ME 101',
    title: 'Engineering Mechanics',
    total_units: 3,
    lecture_units: 3,
    lab_units: 0,
    required_room_type: null,
    dept_code: 'ME',
  },
  // General Ed — cross-dept usage
  {
    subject_code: 'MATH 101',
    title: 'Engineering Calculus I',
    total_units: 3,
    lecture_units: 3,
    lab_units: 0,
    required_room_type: null,
    dept_code: 'BSCPE',
  },
  {
    subject_code: 'PHYS 101',
    title: 'Physics for Engineers',
    total_units: 4,
    lecture_units: 3,
    lab_units: 1,
    required_room_type: null,
    dept_code: 'BSCPE',
  },
];

const SECTIONS = [
  { section_code: 'CpE-1A', year_level: 1, student_count: 42 },
  { section_code: 'CpE-1B', year_level: 1, student_count: 40 },
  { section_code: 'CpE-2A', year_level: 2, student_count: 38 },
  { section_code: 'CpE-3A', year_level: 3, student_count: 35 },
  { section_code: 'EE-1A', year_level: 1, student_count: 30 },
];

const SETTINGS = [
  { setting_key: 'operating_hours_start', value: '07:00' },
  { setting_key: 'operating_hours_end', value: '19:00' },
  { setting_key: 'max_consecutive_hours', value: 3 },
  { setting_key: 'min_break_minutes', value: 30 },
  { setting_key: 'lunch_start', value: '12:00' },
  { setting_key: 'lunch_end', value: '13:00' },
  { setting_key: 'lunch_break_minutes', value: 60 },
  { setting_key: 'lunch_break_overlap_minutes', value: 30 },
  { setting_key: 'visiting_lecturer_max_hours', value: 24 },
  { setting_key: 'default_required_hours', value: 18 },
  { setting_key: 'release_hours_granularity', value: 3 },
  { setting_key: 'lab_split_hours', value: 3 },
  { setting_key: 'lecture_block_minutes', value: 90 },
  { setting_key: 'daytime_priority_end_hour', value: '17:30' },
];

const USERS = [
  {
    email: 'admin@wmsu.edu.ph',
    username: 'admin',
    role: 'administrator',
    dept_code: null,
  },
  {
    email: 'head.cpe@wmsu.edu.ph',
    username: 'head.cpe',
    role: 'department_head',
    dept_code: 'BSCPE',
  },
  {
    email: 'head.ee@wmsu.edu.ph',
    username: 'head.ee',
    role: 'department_head',
    dept_code: 'EE',
  },
  {
    email: 'head.me@wmsu.edu.ph',
    username: 'head.me',
    role: 'department_head',
    dept_code: 'ME',
  },
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
async function upsertByCode(table: string, codeCol: string, rows: any[]) {
  // Not using Supabase upsert because we need to look up existing IDs.
  const out: Record<string, string> = {};
  for (const row of rows) {
    const { data: existing } = await supabase
      .from(table)
      .select('*')
      .eq(codeCol, row[codeCol])
      .maybeSingle();

    if (existing) {
      const idCol = Object.keys(existing).find((k) => k.endsWith('_id'))!;
      out[row[codeCol]] = String(existing[idCol]);
      continue;
    }

    const { data, error } = await supabase.from(table).insert(row).select().single();
    if (error || !data) {
      console.error(`Failed to insert into ${table}:`, error?.message);
      process.exit(1);
    }
    const idCol = Object.keys(data).find((k) => k.endsWith('_id'))!;
    out[row[codeCol]] = String(data[idCol]);
  }
  return out;
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  console.log('\n=== CoE-NNECT: Demo Seed ===\n');

  // 1. Departments
  console.log('Upserting departments…');
  const deptIds = await upsertByCode('department', 'dept_code', DEPARTMENTS);
  console.log('  →', deptIds);

  // 2. Faculty
  console.log('Upserting faculty…');
  for (const f of FACULTY) {
    const deptId = deptIds[f.dept_code];
    const { data: existing } = await supabase
      .from('faculty')
      .select('faculty_id')
      .eq('wmsu_id', f.wmsu_id)
      .maybeSingle();
    if (existing) continue;

    const { error } = await supabase.from('faculty').insert({
      wmsu_id: f.wmsu_id,
      first_name: f.first_name,
      last_name: f.last_name,
      email: f.email,
      dept_id: deptId,
      classification: f.classification,
      required_hours: f.required_hours,
    });
    if (error) {
      console.error(`Faculty ${f.first_name} ${f.last_name}:`, error.message);
      process.exit(1);
    }
  }

  // 3. Subjects
  console.log('Upserting subjects…');
  for (const s of SUBJECTS) {
    const deptId = deptIds[s.dept_code];
    const { data: existing } = await supabase
      .from('subject')
      .select('subject_id')
      .eq('subject_code', s.subject_code)
      .maybeSingle();
    if (existing) continue;

    const { error } = await supabase.from('subject').insert({
      subject_code: s.subject_code,
      title: s.title,
      total_units: s.total_units,
      lecture_units: s.lecture_units,
      lab_units: s.lab_units,
      required_room_type: s.required_room_type,
      dept_id: deptId,
    });
    if (error) {
      console.error(`Subject ${s.subject_code}:`, error.message);
      process.exit(1);
    }
  }

  // 4. Sections
  console.log('Upserting sections…');
  for (const s of SECTIONS) {
    const { data: existing } = await supabase
      .from('section')
      .select('section_id')
      .eq('section_code', s.section_code)
      .maybeSingle();
    if (existing) continue;

    const { error } = await supabase.from('section').insert({
      section_code: s.section_code,
      year_level: s.year_level,
      student_count: s.student_count,
    });
    if (error) {
      console.error(`Section ${s.section_code}:`, error.message);
      process.exit(1);
    }
  }

  // 5. Scheduling settings
  console.log('Upserting scheduling settings…');
  for (const s of SETTINGS) {
    const { error } = await supabase.from('scheduling_setting').upsert(
      {
        setting_key: s.setting_key,
        value: s.value,
      },
      { onConflict: 'setting_key' },
    );
    if (error) {
      console.error(`Setting ${s.setting_key}:`, error.message);
      process.exit(1);
    }
  }

  // 6. Users — via admin API so app_metadata lands correctly
  console.log('Creating users…');
  for (const u of USERS) {
    const deptId = u.dept_code ? deptIds[u.dept_code] : null;

    // Check if user already exists in auth
    const { data: list } = await supabase.auth.admin.listUsers();
    const existing = await findAuthUserByEmail(u.email);

    if (existing) {
      console.log(`  ${u.email} already exists — updating metadata`);
      await supabase.auth.admin.updateUserById(existing.id, {
        app_metadata: {
          role: u.role,
          username: u.username,
          dept_id: deptId,
          faculty_id: null,
        },
      });
      await supabase
        .from('users')
        .update({ role: u.role, dept_id: deptId, username: u.username })
        .eq('user_id', existing.id);
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      app_metadata: {
        role: u.role,
        username: u.username,
        dept_id: deptId,
        faculty_id: null,
      },
    });
    if (error) {
      console.error(`User ${u.email}:`, error.message);
      process.exit(1);
    }

    // Wait a beat for the trigger to fire
    await new Promise((r) => setTimeout(r, 300));

    // Ensure the trigger populated public.users with the right values
    await supabase
      .from('users')
      .update({ role: u.role, dept_id: deptId, username: u.username })
      .eq('user_id', data.user.id);

    console.log(`  Created ${u.email}`);
  }

  // 7. Add a cross-dept subject restriction as a demo
  console.log('Adding demo subject restriction…');
  const mathId = Object.values(deptIds).length ? null : null; // placeholder
  const { data: mathSubj } = await supabase
    .from('subject')
    .select('subject_id')
    .eq('subject_code', 'MATH 101')
    .maybeSingle();
  const { data: physSubj } = await supabase
    .from('subject')
    .select('subject_id')
    .eq('subject_code', 'PHYS 101')
    .maybeSingle();

  if (mathSubj && physSubj) {
    const { data: existingRestr } = await supabase
      .from('subject_restriction')
      .select('restriction_id')
      .eq('subject_id_1', mathSubj.subject_id)
      .eq('subject_id_2', physSubj.subject_id)
      .maybeSingle();

    if (!existingRestr) {
      await supabase.from('subject_restriction').insert({
        subject_id_1: mathSubj.subject_id,
        subject_id_2: physSubj.subject_id,
        warning_message:
          'MATH 101 and PHYS 101 are commonly taken together by irregular students — avoid clashes.',
        is_active: true,
      });
    }
  }

  console.log('\n=== Seed complete ===\n');
  console.log('Demo credentials:');
  console.log(`  Password (all users): ${DEMO_PASSWORD}`);
  console.log('');
  console.log('  Administrator   admin@wmsu.edu.ph');
  console.log('  CpE Dept Head   head.cpe@wmsu.edu.ph');
  console.log('  EE Dept Head    head.ee@wmsu.edu.ph');
  console.log('  ME Dept Head    head.me@wmsu.edu.ph');
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});