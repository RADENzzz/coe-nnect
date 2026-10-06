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
//
// Seed order mirrors the SRS academic-structure flow:
//   Departments → Subjects → Programs → Prospectus → Sections
//   → Faculty → Users → Settings → Restrictions
//

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
  {
    dept_code: 'CE',
    dept_name: 'Civil Engineering',
    description: 'Department of Civil Engineering',
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
  {
    subject_code: 'CPE 102',
    title: 'Computer Programming 2',
    total_units: 4,
    lecture_units: 3,
    lab_units: 1,
    required_room_type: null,
    dept_code: 'BSCPE',
  },
  {
    subject_code: 'CPE 103',
    title: 'Digital Logic Laboratory',
    total_units: 1,
    lecture_units: 0,
    lab_units: 1,
    required_room_type: 'laboratory',
    dept_code: 'BSCPE',
  },
  {
    subject_code: 'CPE 104',
    title: 'Data Structures & Algorithms',
    total_units: 2,
    lecture_units: 0,
    lab_units: 2,
    required_room_type: 'computer_lab',
    dept_code: 'BSCPE',
  },
  // EE
  {
    subject_code: 'EE 101',
    title: 'Circuit Analysis I',
    total_units: 3,
    lecture_units: 3,
    lab_units: 0,
    required_room_type: null,
    dept_code: 'EE',
  },
  {
    subject_code: 'EE 102',
    title: 'Electronics I',
    total_units: 4,
    lecture_units: 3,
    lab_units: 1,
    required_room_type: null,
    dept_code: 'EE',
  },
  // ME
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

const PROGRAMS = [
  {
    program_code: 'BSCPE',
    program_name: 'BS Computer Engineering',
    dept_code: 'BSCPE',
  },
  {
    program_code: 'BSEE',
    program_name: 'BS Electrical Engineering',
    dept_code: 'EE',
  },
  {
    program_code: 'BSME',
    program_name: 'BS Mechanical Engineering',
    dept_code: 'ME',
  },
  {
    program_code: 'BSCE',
    program_name: 'BS Civil Engineering',
    dept_code: 'CE',
  },
];

// Prospectus entries: [program_code, subject_code, year_level, semester]
// Semester is one of: '1st' | '2nd' | 'summer'
const PROSPECTUS = [
  { program_code: 'BSCPE', subject_code: 'CPE 101', year_level: 1, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'MATH 101', year_level: 1, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 102', year_level: 1, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'PHYS 101', year_level: 1, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE 103', year_level: 2, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 104', year_level: 2, semester: '2nd' },
  { program_code: 'BSEE', subject_code: 'EE 101', year_level: 1, semester: '1st' },
  { program_code: 'BSEE', subject_code: 'EE 102', year_level: 1, semester: '2nd' },
];

// NOTE: student_count removed per PM note (Oct 2026) — a section's
// student count does not reliably indicate which subjects its students take.
const SECTIONS = [
  { section_code: 'CpE-1A', year_level: 1, student_count: 42 },
  { section_code: 'CpE-1B', year_level: 1, student_count: 40 },
  { section_code: 'CpE-2A', year_level: 2, student_count: 38 },
  { section_code: 'CpE-3A', year_level: 3, student_count: 35 },
  { section_code: 'EE-1A', year_level: 1, student_count: 30 },
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

// Faculty qualifications — FR 3.1.8
// Once a faculty member has at least one qualification, rule F-5 restricts
// them to only these subjects. Faculty with no qualifications on file are
// considered "unrestricted" (rule F-5 passes for anything).
const QUALIFICATIONS = [
  { wmsu_id: 'WMSU-001', subject_code: 'CPE 101' },
  { wmsu_id: 'WMSU-001', subject_code: 'CPE 102' },
  { wmsu_id: 'WMSU-002', subject_code: 'CPE 103' },
  { wmsu_id: 'WMSU-002', subject_code: 'CPE 104' },
  { wmsu_id: 'WMSU-003', subject_code: 'CPE 101' },
  { wmsu_id: 'WMSU-003', subject_code: 'MATH 101' },
  { wmsu_id: 'WMSU-004', subject_code: 'EE 101' },
  { wmsu_id: 'WMSU-004', subject_code: 'EE 102' },
  { wmsu_id: 'WMSU-005', subject_code: 'EE 101' },
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

// Designations — FR 7.1.4
// Release hours are granted in multiples of 3 per Sir Jhil's rules doc.
const DESIGNATIONS = [
  { designation_name: 'Department Head', release_hours: 3 },
  { designation_name: 'TWG Member', release_hours: 6 },
];

const USERS = [
  {
    email: 'admin@wmsu.edu.ph',
    username: 'admin',
    role: 'administrator',
    dept_code: null,
    wmsu_id: null,
  },
  {
    email: 'head.cpe@wmsu.edu.ph',
    username: 'head.cpe',
    role: 'department_head',
    dept_code: 'BSCPE',
    wmsu_id: 'WMSU-001', // Juan Dela Cruz
  },
  {
    email: 'head.ee@wmsu.edu.ph',
    username: 'head.ee',
    role: 'department_head',
    dept_code: 'EE',
    wmsu_id: 'WMSU-004', // Ana Ramos
  },
  {
    email: 'head.me@wmsu.edu.ph',
    username: 'head.me',
    role: 'department_head',
    dept_code: 'ME',
    wmsu_id: 'WMSU-006', // Carlo Mendez
  },
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
async function upsertByCode(table: string, codeCol: string, rows: any[]) {
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
  console.log('Flow: Departments → Subjects → Programs → Prospectus → Sections → Faculty → Users → Settings → Restrictions\n');

  // ─────────────────────────────────────
  // STEP 1: Departments (FR 2.1.1)
  // ─────────────────────────────────────
  console.log('[1/9] Upserting departments…');
  const deptIds = await upsertByCode('department', 'dept_code', DEPARTMENTS);
  console.log('  →', deptIds);

  // ─────────────────────────────────────
  // STEP 2: Subjects (FR 2.1.2)
  // ─────────────────────────────────────
  console.log('[2/9] Upserting subjects…');
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
  console.log('  → subjects ready');

  // ─────────────────────────────────────
  // STEP 3: Programs (prerequisite for prospectus + sections)
  // ─────────────────────────────────────
  console.log('[3/9] Upserting programs…');
  const programIds: Record<string, string> = {};
  for (const p of PROGRAMS) {
    const deptId = deptIds[p.dept_code];
    if (!deptId) {
      console.error(
        `  ❌ FAILED: program ${p.program_code} — dept "${p.dept_code}" not found in DEPARTMENTS. Add it first.`,
      );
      process.exit(1);
    }
    const { data: existing } = await supabase
      .from('program')
      .select('program_id')
      .eq('program_code', p.program_code)
      .maybeSingle();

    if (existing) {
      programIds[p.program_code] = String(existing.program_id);
      continue;
    }

    const { data, error } = await supabase
      .from('program')
      .insert({
        program_code: p.program_code,
        program_name: p.program_name,
        dept_id: deptId,
      })
      .select()
      .single();

    if (error || !data) {
      console.error(`Program ${p.program_code}:`, error?.message);
      process.exit(1);
    }
    programIds[p.program_code] = String(data.program_id);
  }
  console.log('  →', programIds);

  // ─────────────────────────────────────
  // STEP 4: Prospectus (FR 2.1.3)
  // ─────────────────────────────────────
  console.log('[4/9] Upserting prospectus entries…');
  const { data: subjectRows } = await supabase
    .from('subject')
    .select('subject_id, subject_code');
  const subjectIdByCode: Record<string, string> = {};
  for (const row of subjectRows ?? []) {
    subjectIdByCode[row.subject_code] = String(row.subject_id);
  }

  let prospectusInserted = 0;
  for (const entry of PROSPECTUS) {
    const programId = programIds[entry.program_code];
    const subjectId = subjectIdByCode[entry.subject_code];
    if (!programId || !subjectId) {
      console.warn(
        `  Skipping prospectus ${entry.program_code}/${entry.subject_code}: missing FK`,
      );
      continue;
    }

    const { data: existing } = await supabase
      .from('prospectus')
      .select('prospectus_id')
      .eq('program_id', programId)
      .eq('subject_id', subjectId)
      .eq('year_level', entry.year_level)
      .eq('semester', entry.semester)
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase.from('prospectus').insert({
      program_id: programId,
      subject_id: subjectId,
      year_level: entry.year_level,
      semester: entry.semester,
      is_active: true,
    });

    if (error) {
      console.error(
        `Prospectus ${entry.program_code}/${entry.subject_code}:`,
        error.message,
      );
      process.exit(1);
    }
    prospectusInserted++;
  }
  console.log(`  → ${prospectusInserted} new prospectus entries`);

  // ─────────────────────────────────────
  // STEP 5: Sections
  // ─────────────────────────────────────
  console.log('[5/9] Upserting sections…');
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
      // student_count intentionally omitted — see PM note (Oct 2026).
    });
    if (error) {
      console.error(`Section ${s.section_code}:`, error.message);
      process.exit(1);
    }
  }
  console.log('  → sections ready');

  // ─────────────────────────────────────
  // STEP 6: Faculty
  // ─────────────────────────────────────
  console.log('[6/9] Upserting faculty…');
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
  console.log('  → faculty ready');

  // ─────────────────────────────────────
  // STEP 7: Users
  // ─────────────────────────────────────
  console.log('[7/9] Creating users…');
    const { data: facultyRowsForUsers } = await supabase
    .from('faculty')
    .select('faculty_id, wmsu_id, first_name');
  const facultyIdByWmsuForUsers: Record<string, { id: string; firstName: string }> = {};
  for (const row of facultyRowsForUsers ?? []) {
    if (row.wmsu_id) {
      facultyIdByWmsuForUsers[row.wmsu_id] = {
        id: String(row.faculty_id),
        firstName: row.first_name,
      };
    }
  }
  for (const u of USERS) {
    const deptId = u.dept_code ? deptIds[u.dept_code] : null;
    const deptMeta = u.dept_code
      ? DEPARTMENTS.find((d) => d.dept_code === u.dept_code)
      : null;
    const facultyLink = u.wmsu_id ? facultyIdByWmsuForUsers[u.wmsu_id] : null;
    const facultyId = facultyLink?.id ?? null;
    const firstName = facultyLink?.firstName ?? u.username;

    const existing = await findAuthUserByEmail(u.email);

    if (existing) {
      console.log(`  ${u.email} already exists — updating metadata`);
      await supabase.auth.admin.updateUserById(existing.id, {
        app_metadata: {
          role: u.role,
          username: u.username,
          dept_id: deptId,
          dept_code: u.dept_code ?? null,
          dept_name: deptMeta?.dept_name ?? null,
          faculty_id: facultyId,
          first_name: firstName,
        },
      });
      await supabase
        .from('users')
        .update({
          role: u.role,
          dept_id: deptId,
          faculty_id: facultyId,
          username: u.username,
        })
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
        dept_code: u.dept_code ?? null,
        dept_name: deptMeta?.dept_name ?? null,
        faculty_id: facultyId,
        first_name: firstName,
      },
    });
    if (error) {
      console.error(`User ${u.email}:`, error.message);
      process.exit(1);
    }

    await new Promise((r) => setTimeout(r, 300));

    await supabase
      .from('users')
      .update({
        role: u.role,
        dept_id: deptId,
        faculty_id: facultyId,
        username: u.username,
      })
      .eq('user_id', data.user.id);

    console.log(`  Created ${u.email}`);
  }

    // ─────────────────────────────────────
  // STEP 7b: Faculty Qualifications (FR 3.1.8)
  // ─────────────────────────────────────
  console.log('[7b/9] Upserting faculty qualifications…');
  // Build lookups once
  const { data: facultyRows } = await supabase
    .from('faculty')
    .select('faculty_id, wmsu_id');
  const facultyIdByWmsu: Record<string, string> = {};
  for (const row of facultyRows ?? []) {
    if (row.wmsu_id) facultyIdByWmsu[row.wmsu_id] = String(row.faculty_id);
  }

  let qualsInserted = 0;
  for (const q of QUALIFICATIONS) {
    const facultyId = facultyIdByWmsu[q.wmsu_id];
    const subjectId = subjectIdByCode[q.subject_code];
    if (!facultyId || !subjectId) {
      console.warn(
        `  Skipping qualification ${q.wmsu_id}/${q.subject_code}: missing FK`,
      );
      continue;
    }

    const { data: existing } = await supabase
      .from('faculty_qualification')
      .select('qual_id')
      .eq('faculty_id', facultyId)
      .eq('subject_id', subjectId)
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase.from('faculty_qualification').insert({
      faculty_id: facultyId,
      subject_id: subjectId,
      source_system: null,
    });
    if (error) {
      console.error(
        `Qualification ${q.wmsu_id}/${q.subject_code}:`,
        error.message,
      );
      process.exit(1);
    }
    qualsInserted++;
  }
  console.log(`  → ${qualsInserted} new qualifications`);

  // ─────────────────────────────────────
  // STEP 8: Scheduling settings
  // ─────────────────────────────────────
  console.log('[8/9] Upserting scheduling settings…');
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
  console.log('  → settings ready');

    // ─────────────────────────────────────
  // STEP 8b: Designations (FR 7.1.4)
  // ─────────────────────────────────────
  console.log('[8b/9] Upserting designations…');
  for (const d of DESIGNATIONS) {
    const { data: existing } = await supabase
      .from('designation')
      .select('designation_id')
      .eq('designation_name', d.designation_name)
      .maybeSingle();

    if (existing) continue;

    const { error } = await supabase.from('designation').insert({
      designation_name: d.designation_name,
      release_hours: d.release_hours,
    });
    if (error) {
      console.error(`Designation ${d.designation_name}:`, error.message);
      process.exit(1);
    }
  }
  console.log('  → designations ready');

  // ─────────────────────────────────────
  // STEP 9: Demo subject restriction
  // ─────────────────────────────────────
  console.log('[9/9] Adding demo subject restriction…');
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
  console.log('  → restriction ready');

  // ─────────────────────────────────────
  // Summary
  // ─────────────────────────────────────
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