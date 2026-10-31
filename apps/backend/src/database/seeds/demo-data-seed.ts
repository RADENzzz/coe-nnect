/**
 * CoE-NNECT — Full Demo Data Seed
 * ─────────────────────────────────────────────────────────────────────────
 * Level A: academic data for all four departments (designations, programs,
 * subjects, prospectus, faculty + quals/prefs/unavail, rooms, room
 * preferences for shared rooms, sections, one active term).
 *
 * Level B (withSchedules=true) is NOT implemented — see the comment on
 * seedSchedulesAndRequests at the bottom of this file. Building it correctly
 * requires the schedule entity, and the current draft would have failed on
 * NOT NULL columns (subject_id) and written rows the conflict engine ignores
 * (no timeslot, no pending_faculty_request_id linkage). Failing loudly beats
 * silently writing a broken schedule.
 *
 * PREREQUISITES
 *   - Base seed already ran: `pnpm --filter @coe-nnect/backend seed:demo`
 *     (creates the 4 departments + 6 user accounts).
 *   - .env has SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *
 * IDEMPOTENCY
 *   - Academic tables (designation, program, subject, prospectus, room,
 *     faculty, section, term): existence check on a natural key → update
 *     or insert.
 *   - faculty_qualification: upsert on (faculty_id, subject_id).
 *   - faculty_preference / faculty_unavailability: delete-then-insert
 *     scoped to a single faculty (narrow scope, no marker needed).
 *   - room_preference: existence check on (room_id, dept_id).
 *
 * SAFETY
 *   - No TRUNCATE. No DELETE on academic tables. Updates existing rows.
 *   - No auth.users touched. No dev account touched.
 *   - If a prerequisite is missing (dept not seeded), logs and skips that
 *     block rather than throwing.
 *
 * ORDER OF OPERATIONS (FK-safe)
 *   1. designations
 *   2. programs
 *   3. subjects
 *   4. prospectus
 *   5. rooms
 *   6. room preferences (shared rooms only)
 *   7. faculty (+ quals, prefs, unavail)
 *   8. sections
 *   9. term (active)
 *  10. [NOT IMPLEMENTED] schedules / requests / flags / versions
 *
 * NOT SEEDED — minor_subject_schedule
 *   The intended workflow is that the DH manually plots minors as real
 *   `schedule` rows. `minor_subject_schedule` only registers EXTERNAL
 *   fixed-time commitments for the solver to avoid (H-12); seeding it
 *   would (a) make H-12 fire on every CPE candidate because the table is
 *   term-wide, not section-scoped, and (b) NOT satisfy
 *   findUnplottedMinors, which checks `schedule.subject_id`, not this
 *   table. Leave it empty; the pre-flight "N minors not plotted" warning
 *   is the intended guard rail.
 *
 * SCHEMA NOTES (from test_2.sql)
 *   - term unique constraint is (term_name, school_year) — NOT including
 *     semester. Idempotency check must match that, and any found row's
 *     semester is overwritten to match the seed's intent.
 *   - uq_term_single_active: only one row may have is_active = true. The
 *     seeder deactivates any existing active term before activating its own.
 *   - section.student_count, not expected_enrollment.
 *   - faculty_preference.preferred_day and schedule.day_of_week are the
 *     public.day_of_week enum ('Monday', not 'MON').
 *   - faculty_unavailability.day_of_week is text with a CHECK constraint
 *     (also full names). term_id is nullable.
 *   - subject.title (not subject_title).
 *   - prospectus multi-session columns have CHECK constraints that the
 *     schema defaults (1/90/1/180) satisfy — this seeder relies on them.
 *
 * USAGE
 *   Local:    pnpm --filter @coe-nnect/backend seed:demo:full
 *   Via job:  POST /v1/dev-tools/seed-demo-full  (see DevToolsService)
 *   With B:   SEED_WITH_SCHEDULES=1 pnpm --filter @coe-nnect/backend seed:demo:full
 *             — currently throws. See seedSchedulesAndRequests().
 */

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

const WITH_SCHEDULES =
  process.env.SEED_WITH_SCHEDULES === '1' ||
  process.argv.includes('--with-schedules');

const ACTIVE_TERM = {
  term_name: '1st Semester',
  school_year: '2026-2027',
  semester: '1st' as const,
  start_date: '2026-08-03',
  end_date: '2026-12-19',
};

// ─────────────────────────────────────────────────────────────────────────
// Reference data
// ─────────────────────────────────────────────────────────────────────────

const DESIGNATIONS: Array<{ name: string; release_hours: number }> = [
  { name: 'Department Head', release_hours: 9 },
  { name: 'Assistant Dean', release_hours: 6 },
  { name: 'Research Coordinator', release_hours: 3 },
  { name: 'Outreach Coordinator', release_hours: 3 },
  { name: 'Regular Faculty', release_hours: 0 },
];

const PROGRAMS: Array<{
  dept_code: string;
  program_code: string;
  program_name: string;
}> = [
  { dept_code: 'CPE', program_code: 'BSCPE', program_name: 'BS Computer Engineering' },
  { dept_code: 'EE', program_code: 'BSEE', program_name: 'BS Electrical Engineering' },
  { dept_code: 'GE', program_code: 'BSGE', program_name: 'BS Geodetic Engineering' },
  { dept_code: 'ENVE', program_code: 'BSENVE', program_name: 'BS Environmental Engineering' },
];

type SubjectDef = {
  code: string;
  title: string;
  lec: number;
  lab: number;
  required_room_type: string | null;
  is_minor?: boolean;
  source_dept?: string;
  placements: Array<{ year: 1 | 2 | 3 | 4; semester: '1st' | '2nd' }>;
};

const SUBJECTS: Record<string, SubjectDef[]> = {
  CPE: [
    { code: 'CPE 111', title: 'Computer Engineering as a Discipline', lec: 2, lab: 1, required_room_type: 'computer_lab', placements: [{ year: 1, semester: '1st' }] },
    { code: 'CPE 113', title: 'Programming Logic and Design',         lec: 2, lab: 1, required_room_type: 'computer_lab', placements: [{ year: 1, semester: '1st' }] },
    { code: 'MATH 100', title: 'College Algebra',                     lec: 3, lab: 0, required_room_type: 'lecture_room', is_minor: true, source_dept: 'Mathematics', placements: [{ year: 1, semester: '1st' }] },
    { code: 'US 101',  title: 'Understanding the Self',               lec: 3, lab: 0, required_room_type: 'lecture_room', is_minor: true, source_dept: 'Liberal Arts', placements: [{ year: 1, semester: '1st' }] },
    { code: 'PATHFit 1', title: 'Movement Competency Training',       lec: 2, lab: 0, required_room_type: 'other',        is_minor: true, source_dept: 'Physical Education', placements: [{ year: 1, semester: '1st' }] },
    { code: 'CPE 121', title: 'Object-Oriented Programming',          lec: 2, lab: 1, required_room_type: 'computer_lab', placements: [{ year: 1, semester: '2nd' }] },
    { code: 'CPE 123', title: 'Discrete Structures',                  lec: 3, lab: 0, required_room_type: 'lecture_room', placements: [{ year: 1, semester: '2nd' }] },
    { code: 'CPE 211', title: 'Data Structures and Algorithms',       lec: 2, lab: 1, required_room_type: 'computer_lab', placements: [{ year: 2, semester: '1st' }] },
    { code: 'CPE 213', title: 'Logic Circuit and Design',             lec: 2, lab: 1, required_room_type: 'laboratory',   placements: [{ year: 2, semester: '1st' }] },
    { code: 'CPE 215', title: 'Numerical Methods',                    lec: 3, lab: 0, required_room_type: 'lecture_room', placements: [{ year: 2, semester: '1st' }] },
    { code: 'CPE 221', title: 'Computer Architecture and Organization', lec: 2, lab: 1, required_room_type: 'laboratory', placements: [{ year: 2, semester: '2nd' }] },
    { code: 'CPE 223', title: 'Operating Systems',                    lec: 2, lab: 1, required_room_type: 'computer_lab', placements: [{ year: 2, semester: '2nd' }] },
    { code: 'CPE 311', title: 'Software Engineering',                 lec: 2, lab: 1, required_room_type: 'computer_lab', placements: [{ year: 3, semester: '1st' }] },
    { code: 'CPE 313', title: 'Microprocessors',                      lec: 2, lab: 1, required_room_type: 'laboratory',   placements: [{ year: 3, semester: '1st' }] },
    { code: 'CPE 315', title: 'Computer Networks',                    lec: 2, lab: 1, required_room_type: 'computer_lab', placements: [{ year: 3, semester: '1st' }] },
    { code: 'CPE 411', title: 'Capstone Project 1',                   lec: 1, lab: 2, required_room_type: 'computer_lab', placements: [{ year: 4, semester: '1st' }] },
    { code: 'CPE 413', title: 'Technopreneurship',                    lec: 3, lab: 0, required_room_type: 'lecture_room', placements: [{ year: 4, semester: '1st' }] },
  ],
  EE: [
    { code: 'EE 111',  title: 'Introduction to Electrical Engineering', lec: 2, lab: 1, required_room_type: 'laboratory',   placements: [{ year: 1, semester: '1st' }] },
    { code: 'EE 113',  title: 'Engineering Drawing',                    lec: 1, lab: 1, required_room_type: 'drafting_room', placements: [{ year: 1, semester: '1st' }] },
    { code: 'EE 211',  title: 'Circuit Analysis I',                     lec: 2, lab: 1, required_room_type: 'laboratory',   placements: [{ year: 2, semester: '1st' }] },
    { code: 'EE 213',  title: 'Electrical Measurements',                lec: 2, lab: 1, required_room_type: 'laboratory',   placements: [{ year: 2, semester: '1st' }] },
    { code: 'EE 221',  title: 'Circuit Analysis II',                    lec: 2, lab: 1, required_room_type: 'laboratory',   placements: [{ year: 2, semester: '2nd' }] },
    { code: 'EE 311',  title: 'Electromagnetic Fields',                 lec: 3, lab: 0, required_room_type: 'lecture_room', placements: [{ year: 3, semester: '1st' }] },
    { code: 'EE 313',  title: 'Power Systems Analysis',                 lec: 2, lab: 1, required_room_type: 'laboratory',   placements: [{ year: 3, semester: '1st' }] },
    { code: 'EE 411',  title: 'Capstone Design Project',                lec: 1, lab: 2, required_room_type: 'laboratory',   placements: [{ year: 4, semester: '1st' }] },
  ],
  GE: [
    { code: 'GE 111',  title: 'Fundamentals of Surveying',              lec: 2, lab: 1, required_room_type: 'laboratory',    placements: [{ year: 1, semester: '1st' }] },
    { code: 'GE 113',  title: 'Geodetic Engineering Orientation',       lec: 1, lab: 0, required_room_type: 'lecture_room',  placements: [{ year: 1, semester: '1st' }] },
    { code: 'GE 211',  title: 'Surveying Fieldwork',                    lec: 1, lab: 2, required_room_type: 'other',         placements: [{ year: 2, semester: '1st' }] },
    { code: 'GE 213',  title: 'Cartography',                            lec: 2, lab: 1, required_room_type: 'computer_lab',  placements: [{ year: 2, semester: '1st' }] },
    { code: 'GE 311',  title: 'Geodetic Positioning',                   lec: 2, lab: 1, required_room_type: 'laboratory',    placements: [{ year: 3, semester: '1st' }] },
    { code: 'GE 411',  title: 'Geodetic Engineering Capstone',          lec: 1, lab: 2, required_room_type: 'laboratory',    placements: [{ year: 4, semester: '1st' }] },
  ],
  ENVE: [
    { code: 'ENVE 111', title: 'Intro to Environmental Engineering',    lec: 2, lab: 1, required_room_type: 'laboratory',   placements: [{ year: 1, semester: '1st' }] },
    { code: 'ENVE 113', title: 'Environmental Chemistry',               lec: 2, lab: 1, required_room_type: 'laboratory',   placements: [{ year: 1, semester: '1st' }] },
    { code: 'ENVE 211', title: 'Water Supply Engineering',              lec: 2, lab: 1, required_room_type: 'laboratory',   placements: [{ year: 2, semester: '1st' }] },
    { code: 'ENVE 213', title: 'Environmental Microbiology',            lec: 2, lab: 1, required_room_type: 'laboratory',   placements: [{ year: 2, semester: '1st' }] },
    { code: 'ENVE 311', title: 'Air Pollution Control',                 lec: 3, lab: 0, required_room_type: 'lecture_room', placements: [{ year: 3, semester: '1st' }] },
    { code: 'ENVE 411', title: 'Environmental Engineering Design',      lec: 1, lab: 2, required_room_type: 'laboratory',   placements: [{ year: 4, semester: '1st' }] },
  ],
};

const FACULTY: Record<
  string,
  Array<{
    first_name: string;
    last_name: string;
    email_local: string;
    classification: 'regular' | 'part_time' | 'visiting_lecturer' | 'other';
    designation?: string;
  }>
> = {
  CPE: [
    { first_name: 'Alvin',    last_name: 'Lorenzo',    email_local: 'a.lorenzo',    classification: 'regular', designation: 'Department Head' },
    { first_name: 'Bianca',   last_name: 'Santos',     email_local: 'b.santos',     classification: 'regular' },
    { first_name: 'Carlo',    last_name: 'Dela Cruz',  email_local: 'c.delacruz',   classification: 'regular' },
    { first_name: 'Divina',   last_name: 'Reyes',      email_local: 'd.reyes',      classification: 'regular' },
    { first_name: 'Enrico',   last_name: 'Bautista',   email_local: 'e.bautista',   classification: 'part_time' },
  ],
  EE: [
    { first_name: 'Federico', last_name: 'Mendoza',    email_local: 'f.mendoza',    classification: 'regular', designation: 'Department Head' },
    { first_name: 'Grace',    last_name: 'Aquino',     email_local: 'g.aquino',     classification: 'regular' },
    { first_name: 'Hector',   last_name: 'Villanueva', email_local: 'h.villanueva', classification: 'regular' },
  ],
  GE: [
    { first_name: 'Isabel',   last_name: 'Ramos',      email_local: 'i.ramos',      classification: 'regular', designation: 'Department Head' },
    { first_name: 'Joaquin',  last_name: 'Pascual',    email_local: 'j.pascual',    classification: 'regular' },
  ],
  ENVE: [
    { first_name: 'Karla',    last_name: 'Nuñez',      email_local: 'k.nunez',      classification: 'regular', designation: 'Department Head' },
    { first_name: 'Lorenzo',  last_name: 'Castro',     email_local: 'l.castro',     classification: 'regular' },
    { first_name: 'Marisol',  last_name: 'Tolentino',  email_local: 'm.tolentino',  classification: 'part_time' },
  ],
};

const ROOMS: Array<{
  building: string;
  room_number: string;
  room_type: string;
  capacity: number;
  dept_code: string | null;
}> = [
  // CPE-owned
  { building: 'Engineering Bldg', room_number: 'CPE-LAB1', room_type: 'computer_lab', capacity: 40, dept_code: 'CPE' },
  { building: 'Engineering Bldg', room_number: 'CPE-LAB2', room_type: 'computer_lab', capacity: 40, dept_code: 'CPE' },
  { building: 'Engineering Bldg', room_number: 'CPE-LEC1', room_type: 'lecture_room', capacity: 50, dept_code: 'CPE' },
  // EE-owned
  { building: 'Engineering Bldg', room_number: 'EE-LAB1',  room_type: 'laboratory',   capacity: 35, dept_code: 'EE' },
  { building: 'Engineering Bldg', room_number: 'EE-LEC1',  room_type: 'lecture_room', capacity: 50, dept_code: 'EE' },
  // GE-owned
  { building: 'Engineering Bldg', room_number: 'GE-LAB1',  room_type: 'laboratory',   capacity: 35, dept_code: 'GE' },
  { building: 'Engineering Bldg', room_number: 'GE-DRAFT', room_type: 'drafting_room', capacity: 40, dept_code: 'GE' },
  // ENVE-owned
  { building: 'Engineering Bldg', room_number: 'ENVE-LAB1', room_type: 'laboratory',   capacity: 35, dept_code: 'ENVE' },
  { building: 'Engineering Bldg', room_number: 'ENVE-LEC1', room_type: 'lecture_room', capacity: 50, dept_code: 'ENVE' },
  // Shared (unowned)
  { building: 'Main Bldg', room_number: 'AVR-1', room_type: 'lecture_room', capacity: 120, dept_code: null },
  { building: 'Main Bldg', room_number: 'GYM',   room_type: 'other',        capacity: 300, dept_code: null },
];


// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

interface Report {
  inserted: Record<string, number>;
  updated: Record<string, number>;
  skipped: Array<{ table: string; reason: string }>;
}

const report: Report = { inserted: {}, updated: {}, skipped: [] };

function bump(kind: 'inserted' | 'updated', table: string, n = 1) {
  report[kind][table] = (report[kind][table] ?? 0) + n;
}

function skip(table: string, reason: string) {
  report.skipped.push({ table, reason });
  console.log(`  ! ${table} skipped: ${reason}`);
}

async function deptIdFor(deptCode: string): Promise<string | null> {
  const { data } = await supabase
    .from('department')
    .select('dept_id')
    .eq('dept_code', deptCode)
    .maybeSingle();
  return data ? String(data.dept_id) : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Step 1 — Designations
// ─────────────────────────────────────────────────────────────────────────

async function seedDesignations(): Promise<Record<string, string>> {
  console.log('[1/9] Designations');
  const ids: Record<string, string> = {};

  for (const d of DESIGNATIONS) {
    const { data: existing } = await supabase
      .from('designation')
      .select('designation_id')
      .eq('designation_name', d.name)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('designation')
        .update({ release_hours: d.release_hours })
        .eq('designation_id', existing.designation_id);
      if (error) {
        skip('designation', `${d.name}: ${error.message}`);
        continue;
      }
      ids[d.name] = String(existing.designation_id);
      bump('updated', 'designation');
    } else {
      const { data, error } = await supabase
        .from('designation')
        .insert({ designation_name: d.name, release_hours: d.release_hours })
        .select('designation_id')
        .single();
      if (error || !data) {
        skip('designation', `${d.name}: ${error?.message}`);
        continue;
      }
      ids[d.name] = String(data.designation_id);
      bump('inserted', 'designation');
    }
  }
  console.log(`  ${DESIGNATIONS.length} designation(s) ready`);
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────
// Step 2 — Programs
// ─────────────────────────────────────────────────────────────────────────

async function seedPrograms(): Promise<Record<string, string>> {
  console.log('[2/9] Programs');
  const ids: Record<string, string> = {};

  for (const p of PROGRAMS) {
    const deptId = await deptIdFor(p.dept_code);
    if (!deptId) {
      skip('program', `${p.program_code}: department ${p.dept_code} missing — run base seed first`);
      continue;
    }

    const { data: existing } = await supabase
      .from('program')
      .select('program_id')
      .eq('program_code', p.program_code)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('program')
        .update({ program_name: p.program_name, dept_id: deptId, is_active: true })
        .eq('program_id', existing.program_id);
      if (error) {
        skip('program', `${p.program_code}: ${error.message}`);
        continue;
      }
      ids[p.program_code] = String(existing.program_id);
      bump('updated', 'program');
    } else {
      const { data, error } = await supabase
        .from('program')
        .insert({ program_code: p.program_code, program_name: p.program_name, dept_id: deptId, is_active: true })
        .select('program_id')
        .single();
      if (error || !data) {
        skip('program', `${p.program_code}: ${error?.message}`);
        continue;
      }
      ids[p.program_code] = String(data.program_id);
      bump('inserted', 'program');
    }
  }
  console.log(`  ${Object.keys(ids).length}/${PROGRAMS.length} program(s) ready`);
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────
// Step 3 — Subjects
// ─────────────────────────────────────────────────────────────────────────

async function seedSubjects(): Promise<Record<string, string>> {
  console.log('[3/9] Subjects');
  const ids: Record<string, string> = {};

  for (const [deptCode, subjects] of Object.entries(SUBJECTS)) {
    const deptId = await deptIdFor(deptCode);
    if (!deptId) {
      skip('subject', `department ${deptCode} missing`);
      continue;
    }

    for (const s of subjects) {
      const { data: existing } = await supabase
        .from('subject')
        .select('subject_id')
        .eq('subject_code', s.code)
        .maybeSingle();

      const payload = {
        subject_code: s.code,
        title: s.title,
        total_units: s.lec + s.lab,
        lecture_units: s.lec,
        lab_units: s.lab,
        required_room_type: s.required_room_type,
        dept_id: deptId,
        is_minor: s.is_minor ?? false,
        source_dept: s.source_dept ?? null,
        is_active: true,
      };

      if (existing) {
        const { error } = await supabase
          .from('subject')
          .update(payload)
          .eq('subject_id', existing.subject_id);
        if (error) {
          skip('subject', `${s.code}: ${error.message}`);
          continue;
        }
        ids[s.code] = String(existing.subject_id);
        bump('updated', 'subject');
      } else {
        const { data, error } = await supabase
          .from('subject')
          .insert(payload)
          .select('subject_id')
          .single();
        if (error || !data) {
          skip('subject', `${s.code}: ${error?.message}`);
          continue;
        }
        ids[s.code] = String(data.subject_id);
        bump('inserted', 'subject');
      }
    }
    console.log(`  ${deptCode}: ${subjects.length} subject(s)`);
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────
// Step 4 — Prospectus
// ─────────────────────────────────────────────────────────────────────────

async function seedProspectus(
  subjectIds: Record<string, string>,
  programIds: Record<string, string>,
): Promise<void> {
  console.log('[4/9] Prospectus');

  for (const [deptCode, subjects] of Object.entries(SUBJECTS)) {
    const programCode = PROGRAMS.find((p) => p.dept_code === deptCode)?.program_code;
    if (!programCode) continue;
    const programId = programIds[programCode];
    if (!programId) {
      skip('prospectus', `${programCode}: program missing`);
      continue;
    }

    let count = 0;
    for (const s of subjects) {
      const subjectId = subjectIds[s.code];
      if (!subjectId) continue;

      for (const placement of s.placements) {
        const { data: existing } = await supabase
          .from('prospectus')
          .select('prospectus_id')
          .eq('program_id', programId)
          .eq('subject_id', subjectId)
          .eq('year_level', placement.year)
          .eq('semester', placement.semester)
          .maybeSingle();

        if (existing) {
          bump('updated', 'prospectus');
          count++;
        } else {
          const { error } = await supabase.from('prospectus').insert({
            program_id: programId,
            subject_id: subjectId,
            year_level: placement.year,
            semester: placement.semester,
            is_active: true,
          });
          if (error) {
            skip('prospectus', `${s.code} Y${placement.year} ${placement.semester}: ${error.message}`);
          } else {
            bump('inserted', 'prospectus');
            count++;
          }
        }
      }
    }
    console.log(`  ${programCode}: ${count} prospectus row(s)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Step 5 — Rooms
// ─────────────────────────────────────────────────────────────────────────

async function seedRooms(): Promise<Record<string, string>> {
  console.log('[5/9] Rooms');
  const ids: Record<string, string> = {};

  for (const r of ROOMS) {
    const deptId = r.dept_code ? await deptIdFor(r.dept_code) : null;

    const { data: existing } = await supabase
      .from('room')
      .select('room_id')
      .eq('building', r.building)
      .eq('room_number', r.room_number)
      .maybeSingle();

    const payload = {
      room_number: r.room_number,
      building: r.building,
      room_type: r.room_type,
      capacity: r.capacity,
      dept_id: deptId,
      is_active: true,
    };

    if (existing) {
      const { error } = await supabase
        .from('room')
        .update(payload)
        .eq('room_id', existing.room_id);
      if (error) {
        skip('room', `${r.room_number}: ${error.message}`);
        continue;
      }
      ids[`${r.building}::${r.room_number}`] = String(existing.room_id);
      bump('updated', 'room');
    } else {
      const { data, error } = await supabase
        .from('room')
        .insert(payload)
        .select('room_id')
        .single();
      if (error || !data) {
        skip('room', `${r.room_number}: ${error?.message}`);
        continue;
      }
      ids[`${r.building}::${r.room_number}`] = String(data.room_id);
      bump('inserted', 'room');
    }
  }
  console.log(`  ${ROOMS.length} room(s) ready`);
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────
// Step 6 — Room preferences (shared rooms only)
// ─────────────────────────────────────────────────────────────────────────

/**
 * room_preference has a BEFORE INSERT trigger
 * (prevent_owned_room_preference) that raises if the room has a non-null
 * dept_id. So preferences may only reference SHARED (dept_id IS NULL) rooms.
 *
 * For a demo, each dept gets a preference for both shared rooms at priority 1.
 * That exercises rule F3 / S-6 without tripping the trigger.
 */
async function seedRoomPreferences(
  roomIds: Record<string, string>,
): Promise<void> {
  console.log('[6/9] Room preferences');
  const sharedRoomKeys = ['Main Bldg::AVR-1', 'Main Bldg::GYM'];
  const sharedRooms = sharedRoomKeys
    .map((k) => ({ key: k, roomId: roomIds[k] }))
    .filter((r): r is { key: string; roomId: string } => !!r.roomId);

  if (sharedRooms.length === 0) {
    skip('room_preference', 'no shared rooms seeded');
    return;
  }

  for (const p of PROGRAMS) {
    const deptId = await deptIdFor(p.dept_code);
    if (!deptId) {
      skip('room_preference', `department ${p.dept_code} missing`);
      continue;
    }
    for (const room of sharedRooms) {
      const { data: existing } = await supabase
        .from('room_preference')
        .select('preference_id')
        .eq('room_id', room.roomId)
        .eq('dept_id', deptId)
        .maybeSingle();

      if (existing) {
        bump('updated', 'room_preference');
      } else {
        const { error } = await supabase.from('room_preference').insert({
          room_id: room.roomId,
          dept_id: deptId,
          priority: 1,
          created_by: null,
        });
        if (error) {
          skip('room_preference', `${p.dept_code}/${room.key}: ${error.message}`);
        } else {
          bump('inserted', 'room_preference');
        }
      }
    }
  }
  console.log(`  ${sharedRooms.length} shared room(s) referenced by 4 departments`);
}

// ─────────────────────────────────────────────────────────────────────────
// Step 7 — Faculty (+ quals, prefs, unavail)
// ─────────────────────────────────────────────────────────────────────────

async function seedFaculty(
  subjectIds: Record<string, string>,
): Promise<Record<string, string>> {
  console.log('[7/9] Faculty');
  const ids: Record<string, string> = {};

  for (const [deptCode, people] of Object.entries(FACULTY)) {
    const deptId = await deptIdFor(deptCode);
    if (!deptId) {
      skip('faculty', `department ${deptCode} missing`);
      continue;
    }

    for (const f of people) {
      const email = `${f.email_local}@wmsu.edu.ph`;
      const { data: existing } = await supabase
        .from('faculty')
        .select('faculty_id')
        .eq('email', email)
        .maybeSingle();

      let designationRow: { designation_id: unknown; release_hours: unknown } | null = null;
      if (f.designation) {
        const { data } = await supabase
          .from('designation')
          .select('designation_id, release_hours')
          .eq('designation_name', f.designation)
          .maybeSingle();
        designationRow = data ?? null;
      }

      const releaseHours = Number(designationRow?.release_hours ?? 0);
      const requiredHours = Math.max(0, 18 - releaseHours);

      const payload = {
        first_name: f.first_name,
        last_name: f.last_name,
        email,
        dept_id: deptId,
        designation_id: designationRow?.designation_id ?? null,
        classification: f.classification,
        required_hours: requiredHours,
        is_active: true,
        sync_status: 'synced' as const,
      };

      let facultyId: string;
      if (existing) {
        const { error } = await supabase
          .from('faculty')
          .update(payload)
          .eq('faculty_id', existing.faculty_id);
        if (error) {
          skip('faculty', `${email}: ${error.message}`);
          continue;
        }
        facultyId = String(existing.faculty_id);
        bump('updated', 'faculty');
      } else {
        const { data, error } = await supabase
          .from('faculty')
          .insert(payload)
          .select('faculty_id')
          .single();
        if (error || !data) {
          skip('faculty', `${email}: ${error?.message}`);
          continue;
        }
        facultyId = String(data.faculty_id);
        bump('inserted', 'faculty');
      }
      ids[`${deptCode}::${f.email_local}`] = facultyId;

      // ── Qualifications ──
      // Each faculty is qualified to teach all non-minor subjects of their
      // department, plus up to two minor subjects (shared with the dept).
      const deptSubjects = SUBJECTS[deptCode] ?? [];
      const majorCodes = deptSubjects
        .filter((s) => !s.is_minor)
        .map((s) => s.code);
      const minorCodes = deptSubjects
        .filter((s) => s.is_minor)
        .slice(0, 2)
        .map((s) => s.code);
      const qualCodes = new Set([...majorCodes, ...minorCodes]);

      for (const code of qualCodes) {
        const subjectId = subjectIds[code];
        if (!subjectId) continue;
        const { error } = await supabase
          .from('faculty_qualification')
          .upsert(
            { faculty_id: facultyId, subject_id: subjectId, source_system: 'demo-seed' },
            { onConflict: 'faculty_id,subject_id' },
          );
        if (!error) bump('inserted', 'faculty_qualification');
      }

      // ── Preferences ──
      // A couple of faculty per dept prefer mornings. day_of_week column
      // uses the public.day_of_week enum ('Monday', not 'MON').
      if (people.indexOf(f) % 3 === 0) {
        await supabase.from('faculty_preference').delete().eq('faculty_id', facultyId);
        const { error } = await supabase.from('faculty_preference').insert({
          faculty_id: facultyId,
          preferred_day: 'Monday',
          preferred_start_time: '07:00',
          preferred_end_time: '12:00',
        });
        if (!error) bump('inserted', 'faculty_preference');
      }

      // ── Unavailability ──
      // One faculty per dept has a recurring Wednesday block.
      // day_of_week is TEXT with a CHECK constraint, term_id is nullable.
      if (people.indexOf(f) === people.length - 1) {
        await supabase.from('faculty_unavailability').delete().eq('faculty_id', facultyId);
        const { error } = await supabase.from('faculty_unavailability').insert({
          faculty_id: facultyId,
          term_id: null,
          day_of_week: 'Wednesday',
          start_time: '13:00',
          end_time: '17:00',
          reason: '[demo-seed] recurring department meeting',
          source: 'local',
        });
        if (!error) bump('inserted', 'faculty_unavailability');
      }
    }
    console.log(`  ${deptCode}: ${people.length} faculty member(s)`);
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────
// Step 8 — Sections
// ─────────────────────────────────────────────────────────────────────────

/**
 * 4 sections per year level × 4 years = 16 sections per department.
 * section.student_count, not expected_enrollment.
 */
async function seedSections(programIds: Record<string, string>): Promise<void> {
  console.log('[8/9] Sections');
  const LETTERS = ['A', 'B', 'C', 'D'];

  for (const p of PROGRAMS) {
    const programId = programIds[p.program_code];
    if (!programId) {
      skip('section', `${p.program_code}: program missing`);
      continue;
    }

    for (let year = 1; year <= 4; year++) {
      for (const letter of LETTERS) {
        const sectionCode = `${p.program_code}-${year}${letter}`;

        const { data: existing } = await supabase
          .from('section')
          .select('section_id')
          .eq('section_code', sectionCode)
          .maybeSingle();

        const payload = {
          section_code: sectionCode,
          program_id: programId,
          year_level: year,
          student_count: 40,
          is_active: true,
        };

        if (existing) {
          const { error } = await supabase
            .from('section')
            .update(payload)
            .eq('section_id', existing.section_id);
          if (error) {
            skip('section', `${sectionCode}: ${error.message}`);
          } else {
            bump('updated', 'section');
          }
        } else {
          const { error } = await supabase.from('section').insert(payload);
          if (error) {
            skip('section', `${sectionCode}: ${error.message}`);
          } else {
            bump('inserted', 'section');
          }
        }
      }
    }
    console.log(`  ${p.program_code}: 16 section(s)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Step 9 — Active term
// ─────────────────────────────────────────────────────────────────────────

/**
 * Term uniqueness is (term_name, school_year) — NOT including semester.
 * The schema also has uq_term_single_active (only one row with
 * is_active = true). This seeder:
 *   - deactivates any other active term
 *   - upserts by (term_name, school_year)
 *   - overwrites semester and dates on a hit
 *
 * The semester column is REQUIRED for auto-generate — buildSolverProblem
 * throws if term.semester is null.
 */
async function seedActiveTerm(): Promise<string | null> {
  console.log('[9/9] Active term');

  const { data: existing } = await supabase
    .from('term')
    .select('term_id, semester')
    .eq('term_name', ACTIVE_TERM.term_name)
    .eq('school_year', ACTIVE_TERM.school_year)
    .maybeSingle();

  // Deactivate any other active term first (uq_term_single_active).
  if (existing) {
    await supabase
      .from('term')
      .update({ is_active: false })
      .eq('is_active', true)
      .neq('term_id', existing.term_id);

    const { error } = await supabase
      .from('term')
      .update({
        semester: ACTIVE_TERM.semester,
        start_date: ACTIVE_TERM.start_date,
        end_date: ACTIVE_TERM.end_date,
        is_active: true,
      })
      .eq('term_id', existing.term_id);

    if (error) {
      skip('term', `update: ${error.message}`);
      return null;
    }
    bump('updated', 'term');
    const changed = existing.semester !== ACTIVE_TERM.semester;
    console.log(
      `  ${ACTIVE_TERM.term_name} ${ACTIVE_TERM.school_year}` +
        (changed ? ` (semester ${existing.semester} -> ${ACTIVE_TERM.semester})` : ' (reused)'),
    );
    return String(existing.term_id);
  }

  await supabase.from('term').update({ is_active: false }).eq('is_active', true);

  const { data, error } = await supabase
    .from('term')
    .insert({
      term_name: ACTIVE_TERM.term_name,
      school_year: ACTIVE_TERM.school_year,
      semester: ACTIVE_TERM.semester,
      start_date: ACTIVE_TERM.start_date,
      end_date: ACTIVE_TERM.end_date,
      is_active: true,
    })
    .select('term_id')
    .single();

  if (error || !data) {
    skip('term', error?.message ?? 'unknown error');
    return null;
  }
  bump('inserted', 'term');
  console.log(
    `  ${ACTIVE_TERM.term_name} ${ACTIVE_TERM.school_year} ` +
      `(${ACTIVE_TERM.semester} sem, active)`,
  );
  return String(data.term_id);
}

// ─────────────────────────────────────────────────────────────────────────
// Step 11 — Level B (NOT IMPLEMENTED)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Level B (withSchedules) is intentionally not implemented.
 *
 * Why: the correct shape cannot be produced without decisions that
 * belong to the scheduling feature, not this seeder:
 *
 *   1. `schedule.subject_id` is NOT NULL. Any seeded row must reference a
 *      real subject — my earlier draft omitted it.
 *   2. `schedule.timeslot_id` is always null in the real code path
 *      (SchedulingService.plot() explicitly sets it null). Conflict
 *      detection is by time overlap in the rule engine, not by the
 *      uq_schedule_*_slot indexes.
 *   3. Cross-department flow requires `schedule.pending_faculty_request_id`
 *      PLUS the matching `faculty_request` row — not standalone
 *      faculty_request rows. See ScheduleFacultyService.ensureCrossDept.
 *   4. `schedule_version` snapshots are written by
 *      ScheduleVersionService.writeVersion() on status transition to
 *      'finalized'. Hand-rolling a snapshot is fragile; let the demo
 *      finalize live.
 *
 * Recommended Level B design when ready:
 *   - Seed 8-12 draft schedule rows for CPE only, all with:
 *       status='draft', dept_id=<CPE dept>, subject_id=<CPE subject>,
 *       section_id=<CPE section>, section=<section code>,
 *       timeslot_id=null, faculty_id=<CPE faculty>, room_id=<CPE room>
 *   - Do NOT seed faculty_request rows unless you also seed the linked
 *     schedule rows with pending_faculty_request_id set.
 *   - Do NOT seed schedule_version — the presenter finalizes live.
 */
async function seedSchedulesAndRequests(): Promise<void> {
  throw new Error(
    'Level B (withSchedules=true) is not implemented. ' +
      'See the comment on seedSchedulesAndRequests in demo-data-seed.ts ' +
      'for the correct shape and required prerequisites.',
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Entrypoint
// ─────────────────────────────────────────────────────────────────────────

export interface SeedDemoDataOptions {
  withSchedules?: boolean;
}

export async function seedDemoData(
  opts?: SeedDemoDataOptions,
): Promise<Report> {
  const withSchedules = opts?.withSchedules ?? WITH_SCHEDULES;
  const startedAt = Date.now();

  console.log('===============================================================');
  console.log('  CoE-NNECT — Full Demo Data Seed (Level A)');
  console.log(`  withSchedules: ${withSchedules}`);
  console.log('  Prerequisite: base seed already ran (departments + users).');
  console.log('===============================================================');

  if (withSchedules) {
    // Fail fast before touching the DB.
    throw new Error(
      'withSchedules=true is not supported yet. Run without --with-schedules.',
    );
  }

  await seedDesignations();
  const programIds = await seedPrograms();
  const subjectIds = await seedSubjects();
  await seedProspectus(subjectIds, programIds);
  const roomIds = await seedRooms();
  await seedRoomPreferences(roomIds);
  await seedFaculty(subjectIds);
  await seedSections(programIds);

  await seedActiveTerm();
  // minor_subject_schedule is intentionally NOT seeded. Per the intended
  // workflow, minors are manually plotted by the DH as real schedule rows.
  // minor_subject_schedule only registers external fixed-time commitments
  // for the solver to avoid; seeding it here would both (a) make H-12 fire
  // on every CPE plot and (b) not count as "plotted" in
  // findUnplottedMinors, so the pre-flight warning would persist anyway.

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('===============================================================');
  console.log(`  Seed complete in ${elapsed}s`);
  if (Object.keys(report.inserted).length > 0) {
    console.log('  Inserted:');
    for (const [table, n] of Object.entries(report.inserted)) {
      console.log(`    ${table.padEnd(28)} ${n}`);
    }
  }
  if (Object.keys(report.updated).length > 0) {
    console.log('  Updated:');
    for (const [table, n] of Object.entries(report.updated)) {
      console.log(`    ${table.padEnd(28)} ${n}`);
    }
  }
  if (report.skipped.length > 0) {
    console.log('  Skipped:');
    for (const s of report.skipped) {
      console.log(`    ${s.table.padEnd(28)} ${s.reason}`);
    }
  }
  console.log('===============================================================');
  console.log('  Next:');
  console.log('    1. Open Dev Tools as administrator -> Refresh now.');
  console.log('       Verify counts: subject>0, faculty>0, section>0, prospectus>0.');
  console.log('    2. Optional: check room sufficiency via');
  console.log('       GET /v1/scheduling/room-sufficiency?deptId=<CPE dept_id>');
  console.log('       If "sufficient": false, add rooms to ROOMS and re-run.');
  console.log('    3. Open Timetable as head.cpe@wmsu.edu.ph and click');
  console.log('       Auto-generate. Expect the pre-flight warning:');
  console.log('       "3 minor subjects in the prospectus have not been plotted".');
  console.log('       Click confirm to generate without minors, then manually');
  console.log('       plot MATH 100 / US 101 / PATHFit 1 to clear the warning.');
  console.log('===============================================================');

  return report;
}

// ─────────────────────────────────────────────────────────────────────────
// CLI entrypoint
// ─────────────────────────────────────────────────────────────────────────
// When compiled (dist/database/seeds/demo-data-seed.js) and run via
// `node`, require.main === module is true. When run via tsx/ts-node, it
// usually resolves correctly too. If your setup differs, gate on
// process.env.SEED_DEMO_FULL_CLI === '1' from the package.json script.

if (typeof require !== 'undefined' && require.main === module) {
  seedDemoData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}