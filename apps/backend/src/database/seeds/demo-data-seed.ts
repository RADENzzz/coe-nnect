/**
 * CoE-NNECT — Full Demo Data Seed
 * ─────────────────────────────────────────────────────────────────────────
 * Level A: academic data for the demo. CPE and EE are the focus:
 *   - full prospectus from the 2023-2024 CPE and EE curricula
 *   - 10 faculty per focus department, with specialization-based quals
 *   - 4 BSCPE sections (one per year) and 8 BSEE sections (two per year)
 *   - CPE/EE labs, lecture rooms, drafting rooms, and shared COE rooms
 *   - GEC and professional electives as catalog options
 * GE and ENVE stay as small background programs so college-wide views still
 * have data.
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
 *   - subject, prospectus, and section rows that are no longer in the seed
 *     are deactivated, not deleted, so linked schedules keep their FKs.
 *   - faculty_qualification: upsert on (faculty_id, subject_id); stale quals
 *     for seeded faculty are deleted.
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
 *   - subject.dept_id is NOT NULL, so shared subjects name a catalog owner
 *     (CPE or EE) while is_minor + source_dept mark their real source.
 *   - subject_code is globally unique. The CPE and EE prospectuses collide
 *     on BES 121, BES 123, and BEM 122, so the CPE offerings are suffixed
 *     BES 121D, BES 123E, and BEM 122N.
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
 *   - prospectus session columns are derived from units: lecture minutes =
 *     lec × 60 (clamped to 30-240) and lab sessions = lab units at 180
 *     minutes each, which stays inside the schema CHECK constraints.
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

/** Demo section counts: CPE has one block per year, EE has two. */
const SECTION_LETTERS: Record<ProgramCode, string[]> = {
  BSCPE: ['A'],
  BSEE: ['A', 'B'],
  BSGE: ['A'],
  BSENVE: ['A'],
};

type ProgramCode = 'BSCPE' | 'BSEE' | 'BSGE' | 'BSENVE';
type YearLevel = 1 | 2 | 3 | 4;
type Semester = '1st' | '2nd' | 'summer';
type RoomType =
  | 'lecture_room'
  | 'laboratory'
  | 'computer_lab'
  | 'drafting_room'
  | 'other'
  | 'any';

type Placement = {
  program_code: ProgramCode;
  year: YearLevel;
  semester: Semester;
};

type SubjectDef = {
  code: string;
  title: string;
  lec: number;
  lab: number;
  required_room_type: RoomType;
  owner_dept: 'CPE' | 'EE' | 'GE' | 'ENVE';
  is_minor?: boolean;
  source_dept?: string;
  is_elective?: boolean;
  elective_category?: string;
  elective_year_level?: YearLevel;
  elective_semester?: Semester;
  placements: Placement[];
};

const bothPrograms = (year: YearLevel, semester: Semester): Placement[] => [
  { program_code: 'BSCPE', year, semester },
  { program_code: 'BSEE', year, semester },
];
const cpeOnly = (year: YearLevel, semester: Semester): Placement[] => [
  { program_code: 'BSCPE', year, semester },
];
const eeOnly = (year: YearLevel, semester: Semester): Placement[] => [
  { program_code: 'BSEE', year, semester },
];
const geOnly = (year: YearLevel, semester: Semester): Placement[] => [
  { program_code: 'BSGE', year, semester },
];
const enveOnly = (year: YearLevel, semester: Semester): Placement[] => [
  { program_code: 'BSENVE', year, semester },
];

const SUBJECTS: SubjectDef[] = [
  // ── Shared mathematics and sciences ─────────────────────────────────────
  // Minor subjects are offered by another department or college. They stay in
  // the prospectus but auto-generate skips them (source_dept is set), so the
  // department head plots them manually as fixed commitments.
  //
  // BES 121 and BES 123 are used by BOTH prospectuses for different courses.
  // subject_code is globally unique, so the CPE offerings carry a suffix
  // (BES 121D drafting, BES 123E economics). BEM 122 is likewise split into
  // EE's Advanced Mathematics and CPE's Numerical Methods (BEM 122N).
  { code: 'BEM 111', title: 'Engineering Calculus 1', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'Mathematics', placements: bothPrograms(1, '1st') },
  { code: 'BEM 112', title: 'Engineering Calculus 2', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'Mathematics', placements: bothPrograms(1, '2nd') },
  { code: 'BEM 114', title: 'Engineering Data Analysis', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'Mathematics', placements: bothPrograms(1, '2nd') },
  { code: 'BEM 121', title: 'Differential Equations', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'Mathematics', placements: bothPrograms(2, '1st') },
  { code: 'BEM 122', title: 'Advanced Mathematics for EE', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', is_minor: true, source_dept: 'Mathematics', placements: eeOnly(2, '2nd') },
  { code: 'BEM 122N', title: 'Numerical Methods', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'Mathematics', placements: cpeOnly(2, '2nd') },
  { code: 'BEM 131', title: 'Numerical Methods & Analysis', lec: 2, lab: 1, required_room_type: 'computer_lab', owner_dept: 'EE', is_minor: true, source_dept: 'Mathematics', placements: eeOnly(3, '1st') },
  { code: 'BES 111', title: 'Chemistry for Engineers', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'CPE', is_minor: true, source_dept: 'Sciences', placements: bothPrograms(1, '1st') },
  { code: 'BES 112', title: 'Physics for Engineers', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'CPE', is_minor: true, source_dept: 'Sciences', placements: bothPrograms(1, '2nd') },
  { code: 'BES 113', title: 'Engineering Drawings and Plans', lec: 0, lab: 2, required_room_type: 'drafting_room', owner_dept: 'EE', is_minor: true, source_dept: 'Engineering Sciences', placements: eeOnly(1, '1st') },
  { code: 'BES 114', title: 'Computer-Aided Drafting', lec: 0, lab: 2, required_room_type: 'drafting_room', owner_dept: 'EE', is_minor: true, source_dept: 'Engineering Sciences', placements: eeOnly(1, '2nd') },
  { code: 'BES 116', title: 'Environmental Science', lec: 2, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', is_minor: true, source_dept: 'Sciences', placements: eeOnly(1, '2nd') },
  { code: 'BES 121', title: 'Engineering Mechanics', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', is_minor: true, source_dept: 'Engineering Sciences', placements: eeOnly(2, '1st') },
  { code: 'BES 121D', title: 'Computer-Aided Drafting', lec: 0, lab: 1, required_room_type: 'drafting_room', owner_dept: 'CPE', is_minor: true, source_dept: 'Engineering Sciences', placements: cpeOnly(2, '1st') },
  { code: 'BES 122', title: 'Fundamentals of Deformable Bodies', lec: 2, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', is_minor: true, source_dept: 'Engineering Sciences', placements: eeOnly(2, '2nd') },
  { code: 'BES 123', title: 'Computer Programming', lec: 0, lab: 1, required_room_type: 'computer_lab', owner_dept: 'EE', is_minor: true, source_dept: 'Engineering Sciences', placements: eeOnly(2, '1st') },
  { code: 'BES 123E', title: 'Engineering Economics', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'Engineering Sciences', placements: cpeOnly(2, '1st') },
  { code: 'BES 125', title: 'Engineering Economics', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', is_minor: true, source_dept: 'Engineering Sciences', placements: eeOnly(2, '1st') },
  { code: 'BES 131', title: 'Fluid Mechanics', lec: 2, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', is_minor: true, source_dept: 'Engineering Sciences', placements: eeOnly(3, '1st') },
  { code: 'BES 132', title: 'Technopreneurship', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', is_minor: true, source_dept: 'Engineering Sciences', placements: eeOnly(3, '2nd') },
  { code: 'BES 141', title: 'Management of Engineering Projects', lec: 2, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', is_minor: true, source_dept: 'Engineering Sciences', placements: eeOnly(4, '1st') },
  { code: 'BES 142', title: 'Technopreneurship 101', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'Engineering Sciences', placements: cpeOnly(3, '2nd') },

  // ── Shared general education, PE, and NSTP ──────────────────────────────
  { code: 'US 101', title: 'Understanding the Self', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'General Education', placements: bothPrograms(1, '1st') },
  { code: 'MATH 100', title: 'Mathematics in the Modern World', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'Mathematics', placements: bothPrograms(1, '1st') },
  { code: 'CAS 101', title: 'Purposive Communication', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'General Education', placements: bothPrograms(1, '1st') },
  { code: 'FIL 101', title: 'Wika at Kultura sa Mapayapang Lipunan', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', is_minor: true, source_dept: 'General Education', placements: eeOnly(1, '1st') },
  { code: 'PHILCON', title: 'Philippine Constitution', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'General Education', placements: [{ program_code: 'BSCPE', year: 2, semester: '2nd' }, { program_code: 'BSEE', year: 1, semester: '2nd' }] },
  { code: 'STS 100', title: 'Science, Technology and Society', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'General Education', placements: [{ program_code: 'BSCPE', year: 1, semester: '2nd' }, { program_code: 'BSEE', year: 3, semester: '1st' }] },
  { code: 'ETHICS 101', title: 'Ethics', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'General Education', placements: [{ program_code: 'BSCPE', year: 1, semester: '2nd' }, { program_code: 'BSEE', year: 3, semester: '1st' }] },
  { code: 'CW 101', title: 'The Contemporary World', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'General Education', placements: bothPrograms(2, '2nd') },
  { code: 'HIST 100', title: 'Life & Works of Rizal', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'General Education', placements: bothPrograms(2, '1st') },
  { code: 'HIST 101', title: 'Readings in Philippine History', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'General Education', placements: bothPrograms(3, '2nd') },
  { code: 'A&H 100', title: 'Art Appreciation', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'General Education', placements: bothPrograms(3, '2nd') },
  { code: 'PATHFit 1', title: 'Movement and Competency Training', lec: 2, lab: 0, required_room_type: 'other', owner_dept: 'CPE', is_minor: true, source_dept: 'Physical Education', placements: bothPrograms(1, '1st') },
  { code: 'PATHFit 2', title: 'Exercise-based Fitness Activities', lec: 2, lab: 0, required_room_type: 'other', owner_dept: 'CPE', is_minor: true, source_dept: 'Physical Education', placements: bothPrograms(1, '2nd') },
  { code: 'PATHFit 3', title: 'Physical Activities Toward Health and Fitness 3', lec: 2, lab: 0, required_room_type: 'other', owner_dept: 'CPE', is_minor: true, source_dept: 'Physical Education', placements: bothPrograms(2, '1st') },
  { code: 'PATHFit 4', title: 'Physical Activities Toward Health and Fitness 4', lec: 2, lab: 0, required_room_type: 'other', owner_dept: 'CPE', is_minor: true, source_dept: 'Physical Education', placements: bothPrograms(2, '2nd') },
  { code: 'NSTP 1', title: 'CWTS 1 / LTS 1 / ROTC 1', lec: 3, lab: 0, required_room_type: 'other', owner_dept: 'CPE', is_minor: true, source_dept: 'NSTP', placements: bothPrograms(1, '1st') },
  { code: 'NSTP 2', title: 'CWTS 2 / LTS 2 / ROTC 2', lec: 3, lab: 0, required_room_type: 'other', owner_dept: 'CPE', is_minor: true, source_dept: 'NSTP', placements: bothPrograms(1, '2nd') },

  // ── GEC electives ───────────────────────────────────────────────────────
  // One option is placed in each GEC slot; the other options stay in the
  // catalog so the elective picker has something to offer.
  { code: 'MST 104', title: 'Living in the IT Era', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'General Education', is_elective: true, elective_category: 'GEC', elective_year_level: 1, elective_semester: '2nd', placements: bothPrograms(1, '2nd') },
  { code: 'SSP 104', title: 'The Entrepreneurial Mind', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'General Education', is_elective: true, elective_category: 'GEC', elective_year_level: 2, elective_semester: '1st', placements: bothPrograms(2, '1st') },
  { code: 'A&H 101', title: 'Great Books', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'General Education', is_elective: true, elective_category: 'GEC', elective_year_level: 2, elective_semester: '2nd', placements: bothPrograms(2, '2nd') },
  { code: 'SSP 103', title: 'Gender and Society', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'General Education', is_elective: true, elective_category: 'GEC', elective_year_level: 2, elective_semester: '1st', placements: [] },
  { code: 'MST 103', title: 'Human Reproduction', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', is_minor: true, source_dept: 'General Education', is_elective: true, elective_category: 'GEC', elective_year_level: 2, elective_semester: '1st', placements: [] },

  // ── CPE major subjects ──────────────────────────────────────────────────
  { code: 'CPE 111', title: 'Computer Engineering as Discipline', lec: 1, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', placements: cpeOnly(1, '1st') },
  { code: 'CPE 113', title: 'Programming Logic and Design', lec: 0, lab: 2, required_room_type: 'computer_lab', owner_dept: 'CPE', placements: cpeOnly(1, '1st') },
  { code: 'CPE 115', title: 'Computer Hardware Fundamentals', lec: 0, lab: 1, required_room_type: 'laboratory', owner_dept: 'CPE', placements: cpeOnly(1, '1st') },
  { code: 'CPE 114', title: 'Object-oriented Programming', lec: 0, lab: 2, required_room_type: 'computer_lab', owner_dept: 'CPE', placements: cpeOnly(1, '2nd') },
  { code: 'CPE 112', title: 'Discrete Mathematics', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', placements: cpeOnly(1, '2nd') },
  { code: 'CPE 121', title: 'Data Structures and Algorithms', lec: 0, lab: 2, required_room_type: 'computer_lab', owner_dept: 'CPE', placements: cpeOnly(2, '1st') },
  { code: 'CPE 123', title: 'Fundamentals of Electrical Circuits', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'CPE', placements: cpeOnly(2, '1st') },
  { code: 'CPE 125', title: 'Design Thinking and Innovation', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', placements: cpeOnly(2, '1st') },
  { code: 'CPE 127', title: 'Fundamentals of Artificial Intelligence', lec: 1, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', placements: cpeOnly(2, '1st') },
  { code: 'CPE 122', title: 'Software Design', lec: 3, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', placements: cpeOnly(2, '2nd') },
  { code: 'CPE 124', title: 'Fundamentals of Digital Systems', lec: 2, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', placements: cpeOnly(2, '2nd') },
  { code: 'CPE 126', title: 'Fundamentals of Electronic Circuits', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'CPE', placements: cpeOnly(2, '2nd') },
  { code: 'CPE 128', title: 'Web Development', lec: 0, lab: 2, required_room_type: 'computer_lab', owner_dept: 'CPE', placements: cpeOnly(2, '2nd') },
  { code: 'CPE 131', title: 'Logic Circuits and Design', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'CPE', placements: cpeOnly(3, '1st') },
  { code: 'CPE 133', title: 'Data and Digital Communication', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', placements: cpeOnly(3, '1st') },
  { code: 'CPE 135', title: 'Feedback and Control Systems', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'CPE', placements: cpeOnly(3, '1st') },
  { code: 'CPE 137', title: 'Computer Engineering Drafting and Design', lec: 0, lab: 1, required_room_type: 'drafting_room', owner_dept: 'CPE', placements: cpeOnly(3, '1st') },
  { code: 'CPE 141', title: 'Fundamentals of Mixed Signals and Sensors', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', placements: cpeOnly(3, '1st') },
  { code: 'CPE 143', title: 'Operating System', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', placements: cpeOnly(3, '1st') },
  { code: 'CPE 145', title: 'Introduction to HDL', lec: 0, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', placements: cpeOnly(3, '1st') },
  { code: 'CPE 132', title: 'Microprocessors', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'CPE', placements: cpeOnly(3, '2nd') },
  { code: 'CPE 134', title: 'Methods of Research (with Research Writing)', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', placements: cpeOnly(3, '2nd') },
  { code: 'CPE 136', title: 'Computer Networks and Security', lec: 3, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', placements: cpeOnly(3, '2nd') },
  { code: 'CPE 138', title: 'Digital Signal Processing', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'CPE', placements: cpeOnly(3, '2nd') },
  { code: 'CPE 147', title: 'Embedded Systems', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'CPE', placements: cpeOnly(3, 'summer') },
  { code: 'CPE 149', title: 'CpE Practice and Design 1', lec: 0, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', placements: cpeOnly(3, 'summer') },
  { code: 'CPE 151', title: 'CpE Laws and Professional Practice', lec: 2, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', placements: cpeOnly(4, '1st') },
  { code: 'CPE 153', title: 'Basic Occupational Health & Safety', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', placements: cpeOnly(4, '1st') },
  { code: 'CPE 155', title: 'CpE Practice and Design 2', lec: 0, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', placements: cpeOnly(4, '1st') },
  { code: 'CPE 152', title: 'Emerging Technologies in CpE', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'CPE', placements: cpeOnly(4, '2nd') },
  { code: 'CPE 154', title: 'Computer Architecture and Organization', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'CPE', placements: cpeOnly(4, '2nd') },
  { code: 'CPE 156', title: 'CpE Practice and Design 3', lec: 0, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', placements: cpeOnly(4, '2nd') },
  { code: 'CPE 158', title: 'Seminars and Field Trips', lec: 0, lab: 1, required_room_type: 'other', owner_dept: 'CPE', placements: cpeOnly(4, '2nd') },
  { code: 'CPE 160', title: 'On-the-Job Training (240 hours)', lec: 3, lab: 0, required_room_type: 'other', owner_dept: 'CPE', placements: cpeOnly(4, '2nd') },

  // ── CPE professional electives (four tracks) ────────────────────────────
  // The Software Development track is plotted in the prospectus. The other
  // tracks remain available in the catalog for the elective picker.
  { code: 'CPE SD 1', title: 'Database Management Systems', lec: 2, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', is_elective: true, elective_category: 'Software Development', elective_year_level: 3, elective_semester: '1st', placements: cpeOnly(3, '1st') },
  { code: 'CPE SD 2', title: 'Software Engineering', lec: 2, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', is_elective: true, elective_category: 'Software Development', elective_year_level: 3, elective_semester: '2nd', placements: cpeOnly(3, '2nd') },
  { code: 'CPE SD 3', title: 'Management Information System', lec: 2, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', is_elective: true, elective_category: 'Software Development', elective_year_level: 4, elective_semester: '1st', placements: cpeOnly(4, '1st') },
  { code: 'CPE RPA 1', title: 'Vision Intelligence and Machine Learning', lec: 2, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', is_elective: true, elective_category: 'Robotics Process Automation', elective_year_level: 3, elective_semester: '1st', placements: [] },
  { code: 'CPE RPA 2', title: 'Deep Learning', lec: 2, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', is_elective: true, elective_category: 'Robotics Process Automation', elective_year_level: 3, elective_semester: '2nd', placements: [] },
  { code: 'CPE RPA 3', title: 'Data Analytics', lec: 2, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', is_elective: true, elective_category: 'Robotics Process Automation', elective_year_level: 4, elective_semester: '1st', placements: [] },
  { code: 'CPE NETWORK 1', title: 'Fundamentals of Networking', lec: 2, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', is_elective: true, elective_category: 'System and Network Administration', elective_year_level: 3, elective_semester: '1st', placements: [] },
  { code: 'CPE NETWORK 2', title: 'Routing Protocols and Concepts', lec: 2, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', is_elective: true, elective_category: 'System and Network Administration', elective_year_level: 3, elective_semester: '2nd', placements: [] },
  { code: 'CPE NETWORK 3', title: 'LAN Switching and Wireless', lec: 2, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', is_elective: true, elective_category: 'System and Network Administration', elective_year_level: 4, elective_semester: '1st', placements: [] },
  { code: 'CPE TECHNO 1', title: 'Basic Accounting', lec: 2, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', is_elective: true, elective_category: 'Technopreneurship', elective_year_level: 3, elective_semester: '1st', placements: [] },
  { code: 'CPE TECHNO 2', title: 'Development of Enterprise', lec: 2, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', is_elective: true, elective_category: 'Technopreneurship', elective_year_level: 3, elective_semester: '2nd', placements: [] },
  { code: 'CPE TECHNO 3', title: 'Management of Technology Enterprise', lec: 2, lab: 1, required_room_type: 'computer_lab', owner_dept: 'CPE', is_elective: true, elective_category: 'Technopreneurship', elective_year_level: 4, elective_semester: '1st', placements: [] },

  // ── EE major subjects ───────────────────────────────────────────────────
  { code: 'EE TECH 1', title: 'Wiring and Elementary Electrical Principles', lec: 0, lab: 1, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(1, '2nd') },
  { code: 'EE 121', title: 'Electrical Circuits 1', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(2, '1st') },
  { code: 'EE TECH 2', title: 'Power Wiring and Diagramming', lec: 0, lab: 1, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(2, '1st') },
  { code: 'EE 122', title: 'Electrical Circuits 2', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(2, '2nd') },
  { code: 'EE 124', title: 'Electronic Circuits: Devices and Analysis', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(2, '2nd') },
  { code: 'EE 126', title: 'Basic Thermodynamics', lec: 2, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', placements: eeOnly(2, '2nd') },
  { code: 'EE 128', title: 'Electromagnetics', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', placements: eeOnly(2, '2nd') },
  { code: 'EE 131', title: 'Logic Circuits and Switching Theory', lec: 2, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', placements: eeOnly(3, '1st') },
  { code: 'BEE 133', title: 'Industrial Electronics', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(3, '1st') },
  { code: 'BEE 135', title: 'Fundamentals of Electronic Communications', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', placements: eeOnly(3, '1st') },
  { code: 'EE 133', title: 'Electrical Machines 1', lec: 2, lab: 1, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(3, '1st') },
  { code: 'EE 132', title: 'Microprocessor Systems', lec: 2, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', placements: eeOnly(3, '2nd') },
  { code: 'EE 134', title: 'Electrical Apparatus and Devices', lec: 2, lab: 1, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(3, '2nd') },
  { code: 'EE 136', title: 'Electrical Machines 2', lec: 3, lab: 1, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(3, '2nd') },
  { code: 'BEE 132', title: 'Basic Occupational Safety and Health', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', placements: eeOnly(3, '2nd') },
  { code: 'EEL 132', title: 'EE Laws, Codes and Personal Ethics', lec: 2, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', placements: eeOnly(3, '2nd') },
  { code: 'EE 138', title: 'Feedback Control Systems', lec: 2, lab: 1, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(3, '2nd') },
  { code: 'EE 140', title: 'On the Job Training (240 hours)', lec: 2, lab: 0, required_room_type: 'other', owner_dept: 'EE', placements: eeOnly(3, 'summer') },
  { code: 'BEE 141', title: 'Material Science & Engineering', lec: 2, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', placements: eeOnly(4, '1st') },
  { code: 'EE 141', title: 'Electrical Standards and Practices', lec: 0, lab: 1, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(4, '1st') },
  { code: 'EE 143', title: 'Instrumentation and Control', lec: 2, lab: 1, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(4, '1st') },
  { code: 'EE 147', title: 'Electrical Systems & Illumination Engineering', lec: 3, lab: 2, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(4, '1st') },
  { code: 'EE 149', title: 'Research Methods', lec: 0, lab: 1, required_room_type: 'computer_lab', owner_dept: 'EE', placements: eeOnly(4, '1st') },
  { code: 'EE 142', title: 'Power System Analysis', lec: 3, lab: 2, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(4, '2nd') },
  { code: 'EE 144', title: 'Distribution System & Substation Design', lec: 2, lab: 1, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(4, '2nd') },
  { code: 'EE 146', title: 'Fundamentals of Power Plant Engineering Design', lec: 0, lab: 1, required_room_type: 'laboratory', owner_dept: 'EE', placements: eeOnly(4, '2nd') },
  { code: 'EE 148', title: 'Research Project or Capstone Design', lec: 0, lab: 1, required_room_type: 'computer_lab', owner_dept: 'EE', placements: eeOnly(4, '2nd') },
  { code: 'EE 152', title: 'Educational Tour, Field Trip and Seminars', lec: 0, lab: 1, required_room_type: 'other', owner_dept: 'EE', placements: eeOnly(4, '2nd') },

  // ── EE professional electives ───────────────────────────────────────────
  { code: 'EE 145', title: 'Power System Protection', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', is_elective: true, elective_category: 'EE Professional Elective', elective_year_level: 4, elective_semester: '1st', placements: eeOnly(4, '1st') },
  { code: 'EE 150', title: 'Special Studies in Renewable Energy Resources', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', is_elective: true, elective_category: 'EE Professional Elective', elective_year_level: 4, elective_semester: '2nd', placements: eeOnly(4, '2nd') },
  { code: 'EE 145.1', title: 'Advanced Electrical Systems Design', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', is_elective: true, elective_category: 'EE Professional Elective', elective_year_level: 4, elective_semester: '1st', placements: [] },
  { code: 'EE 150.1', title: 'Entrepreneurship', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', is_elective: true, elective_category: 'EE Professional Elective', elective_year_level: 4, elective_semester: '2nd', placements: [] },
  { code: 'EE 145.2', title: 'Machine Automation and Process Control', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'EE', is_elective: true, elective_category: 'EE Professional Elective', elective_year_level: 4, elective_semester: '1st', placements: [] },

  // ── GE and ENVE stay in the seed as background departments ──────────────
  { code: 'GE 111', title: 'Fundamentals of Surveying', lec: 2, lab: 1, required_room_type: 'laboratory', owner_dept: 'GE', placements: geOnly(1, '1st') },
  { code: 'GE 113', title: 'Geodetic Engineering Orientation', lec: 1, lab: 0, required_room_type: 'lecture_room', owner_dept: 'GE', placements: geOnly(1, '1st') },
  { code: 'GE 211', title: 'Surveying Fieldwork', lec: 1, lab: 2, required_room_type: 'other', owner_dept: 'GE', placements: geOnly(2, '1st') },
  { code: 'GE 213', title: 'Cartography', lec: 2, lab: 1, required_room_type: 'computer_lab', owner_dept: 'GE', placements: geOnly(2, '1st') },
  { code: 'GE 311', title: 'Geodetic Positioning', lec: 2, lab: 1, required_room_type: 'laboratory', owner_dept: 'GE', placements: geOnly(3, '1st') },
  { code: 'GE 411', title: 'Geodetic Engineering Capstone', lec: 1, lab: 2, required_room_type: 'laboratory', owner_dept: 'GE', placements: geOnly(4, '1st') },
  { code: 'ENVE 111', title: 'Intro to Environmental Engineering', lec: 2, lab: 1, required_room_type: 'laboratory', owner_dept: 'ENVE', placements: enveOnly(1, '1st') },
  { code: 'ENVE 113', title: 'Environmental Chemistry', lec: 2, lab: 1, required_room_type: 'laboratory', owner_dept: 'ENVE', placements: enveOnly(1, '1st') },
  { code: 'ENVE 211', title: 'Water Supply Engineering', lec: 2, lab: 1, required_room_type: 'laboratory', owner_dept: 'ENVE', placements: enveOnly(2, '1st') },
  { code: 'ENVE 213', title: 'Environmental Microbiology', lec: 2, lab: 1, required_room_type: 'laboratory', owner_dept: 'ENVE', placements: enveOnly(2, '1st') },
  { code: 'ENVE 311', title: 'Air Pollution Control', lec: 3, lab: 0, required_room_type: 'lecture_room', owner_dept: 'ENVE', placements: enveOnly(3, '1st') },
  { code: 'ENVE 411', title: 'Environmental Engineering Design', lec: 1, lab: 2, required_room_type: 'laboratory', owner_dept: 'ENVE', placements: enveOnly(4, '1st') },
];

/**
 * Subject groups used to build faculty qualifications. A faculty member is
 * qualified for every subject in each group listed on their record, plus a
 * rotating pair of minor subjects from their program. The groups deliberately
 * overlap so no major subject is left without at least one qualified teacher.
 */
const SPECIALIZATIONS: Record<string, string[]> = {
  // CPE
  cpe_core: [
    'CPE 111', 'CPE 112', 'CPE 113', 'CPE 114', 'CPE 115', 'CPE 121',
    'CPE 124', 'CPE 125', 'CPE 128', 'CPE 134', 'CPE 149', 'CPE 155',
    'CPE 156', 'CPE 160',
  ],
  cpe_software: [
    'CPE 114', 'CPE 121', 'CPE 122', 'CPE 128', 'CPE 143',
    'CPE SD 1', 'CPE SD 2', 'CPE SD 3',
  ],
  cpe_hardware: [
    'CPE 115', 'CPE 123', 'CPE 124', 'CPE 126', 'CPE 131', 'CPE 132',
    'CPE 135', 'CPE 137', 'CPE 138', 'CPE 141', 'CPE 145', 'CPE 147',
    'CPE 154',
  ],
  cpe_networks: [
    'CPE 133', 'CPE 136',
    'CPE NETWORK 1', 'CPE NETWORK 2', 'CPE NETWORK 3',
  ],
  cpe_ai: ['CPE 127', 'CPE RPA 1', 'CPE RPA 2', 'CPE RPA 3'],
  cpe_techno: [
    'CPE 151', 'CPE 152', 'CPE 153', 'CPE 158', 'CPE 160', 'BES 142',
    'CPE TECHNO 1', 'CPE TECHNO 2', 'CPE TECHNO 3',
  ],

  // EE
  ee_power: [
    'EE TECH 1', 'EE TECH 2', 'EE 126', 'EE 133', 'EE 136', 'EE 141',
    'EE 142', 'EE 144', 'EE 145', 'EE 145.1', 'EE 145.2', 'EE 146',
    'EE 147', 'EE 150', 'EE 150.1',
  ],
  ee_circuits: [
    'EE 121', 'EE 122', 'EE 124', 'EE 128', 'EE 131', 'BEE 133', 'EE 134',
  ],
  ee_control: ['EE 132', 'EE 138', 'EE 143', 'BEE 135'],
  ee_math: [
    'BEM 111', 'BEM 112', 'BEM 114', 'BEM 121', 'BEM 122', 'BEM 131',
    'MATH 100',
  ],
  ee_science: [
    'BES 111', 'BES 112', 'BES 113', 'BES 114', 'BES 116', 'BES 121',
    'BES 122', 'BES 123', 'BES 125', 'BES 131', 'BEE 141',
  ],
  ee_management: ['BES 132', 'BES 141', 'BEE 132', 'EEL 132'],
  ee_research: ['EE 140', 'EE 148', 'EE 149', 'EE 152'],

  // GE and ENVE (kept as background programs)
  ge_surveying: ['GE 111', 'GE 113', 'GE 211', 'GE 213', 'GE 311', 'GE 411'],
  enve_core: [
    'ENVE 111', 'ENVE 113', 'ENVE 211', 'ENVE 213', 'ENVE 311', 'ENVE 411',
  ],
};

type FacultyDef = {
  first_name: string;
  last_name: string;
  email_local: string;
  classification: 'regular' | 'part_time' | 'visiting_lecturer' | 'other';
  designation?: string;
  specializations: string[];
};

/**
 * Ten CPE and ten EE faculty for the demo. GE and ENVE keep a small roster
 * because they are background programs in this demo, not the focus.
 */
const FACULTY: Record<'CPE' | 'EE' | 'GE' | 'ENVE', FacultyDef[]> = {
  CPE: [
    { first_name: 'Alvin',    last_name: 'Lorenzo',    email_local: 'a.lorenzo',    classification: 'regular', designation: 'Department Head', specializations: ['cpe_software', 'cpe_core'] },
    { first_name: 'Bianca',   last_name: 'Santos',     email_local: 'b.santos',     classification: 'regular', specializations: ['cpe_software'] },
    { first_name: 'Carlo',    last_name: 'Dela Cruz',  email_local: 'c.delacruz',   classification: 'regular', specializations: ['cpe_hardware'] },
    { first_name: 'Divina',   last_name: 'Reyes',      email_local: 'd.reyes',      classification: 'regular', specializations: ['cpe_ai', 'cpe_software'] },
    { first_name: 'Enrico',   last_name: 'Bautista',   email_local: 'e.bautista',   classification: 'part_time', specializations: ['cpe_networks'] },
    { first_name: 'Faith',    last_name: 'Villamor',   email_local: 'f.villamor',   classification: 'regular', specializations: ['cpe_hardware', 'cpe_core'] },
    { first_name: 'Gabriel',  last_name: 'Torres',     email_local: 'g.torres',     classification: 'regular', specializations: ['cpe_ai'] },
    { first_name: 'Hazel',    last_name: 'Manalo',     email_local: 'h.manalo',     classification: 'regular', specializations: ['cpe_networks', 'cpe_techno'] },
    { first_name: 'Ian',      last_name: 'Salazar',    email_local: 'i.salazar',    classification: 'visiting_lecturer', specializations: ['cpe_techno'] },
    { first_name: 'Jasmine',  last_name: 'Ocampo',     email_local: 'j.ocampo',     classification: 'regular', specializations: ['cpe_core'] },
  ],
  EE: [
    { first_name: 'Federico', last_name: 'Mendoza',    email_local: 'f.mendoza',    classification: 'regular', designation: 'Department Head', specializations: ['ee_power'] },
    { first_name: 'Grace',    last_name: 'Aquino',     email_local: 'g.aquino',     classification: 'regular', specializations: ['ee_circuits'] },
    { first_name: 'Hector',   last_name: 'Villanueva', email_local: 'h.villanueva', classification: 'regular', specializations: ['ee_control'] },
    { first_name: 'Imelda',   last_name: 'Navarro',    email_local: 'i.navarro',    classification: 'regular', specializations: ['ee_power', 'ee_research'] },
    { first_name: 'Joselito', last_name: 'Ramos',      email_local: 'j.ramos',      classification: 'regular', specializations: ['ee_circuits', 'ee_math'] },
    { first_name: 'Katrina',  last_name: 'Flores',     email_local: 'k.flores',     classification: 'part_time', specializations: ['ee_power'] },
    { first_name: 'Leonardo', last_name: 'Cruz',       email_local: 'l.cruz',       classification: 'regular', specializations: ['ee_control', 'ee_science'] },
    { first_name: 'Maricel',  last_name: 'Domingo',    email_local: 'm.domingo',    classification: 'regular', specializations: ['ee_math'] },
    { first_name: 'Nathaniel',last_name: 'Garcia',     email_local: 'n.garcia',     classification: 'visiting_lecturer', specializations: ['ee_management'] },
    { first_name: 'Olivia',   last_name: 'Santiago',   email_local: 'o.santiago',   classification: 'regular', specializations: ['ee_research', 'ee_science'] },
  ],
  GE: [
    { first_name: 'Isabel',   last_name: 'Ramos',      email_local: 'i.ramos',      classification: 'regular', designation: 'Department Head', specializations: ['ge_surveying'] },
    { first_name: 'Joaquin',  last_name: 'Pascual',    email_local: 'j.pascual',    classification: 'regular', specializations: ['ge_surveying'] },
  ],
  ENVE: [
    { first_name: 'Karla',    last_name: 'Nuñez',      email_local: 'k.nunez',      classification: 'regular', designation: 'Department Head', specializations: ['enve_core'] },
    { first_name: 'Lorenzo',  last_name: 'Castro',     email_local: 'l.castro',     classification: 'regular', specializations: ['enve_core'] },
    { first_name: 'Marisol',  last_name: 'Tolentino',  email_local: 'm.tolentino',  classification: 'part_time', specializations: ['enve_core'] },
  ],
};

const ROOMS: Array<{
  building: string;
  room_number: string;
  room_type: RoomType;
  capacity: number;
  dept_code: 'CPE' | 'EE' | 'GE' | 'ENVE' | null;
}> = [
  // CPE-owned
  { building: 'Engineering Bldg', room_number: 'CPE-LEC1',  room_type: 'lecture_room',  capacity: 50, dept_code: 'CPE' },
  { building: 'Engineering Bldg', room_number: 'CPE-LEC2',  room_type: 'lecture_room',  capacity: 50, dept_code: 'CPE' },
  { building: 'Engineering Bldg', room_number: 'CPE-LAB1',  room_type: 'computer_lab',  capacity: 40, dept_code: 'CPE' },
  { building: 'Engineering Bldg', room_number: 'CPE-LAB2',  room_type: 'computer_lab',  capacity: 40, dept_code: 'CPE' },
  { building: 'Engineering Bldg', room_number: 'CPE-LAB3',  room_type: 'computer_lab',  capacity: 40, dept_code: 'CPE' },
  { building: 'Engineering Bldg', room_number: 'CPE-ELEC',  room_type: 'laboratory',    capacity: 35, dept_code: 'CPE' },
  { building: 'Engineering Bldg', room_number: 'CPE-DRAFT', room_type: 'drafting_room', capacity: 40, dept_code: 'CPE' },
  // EE-owned
  { building: 'Engineering Bldg', room_number: 'EE-LEC1',  room_type: 'lecture_room',  capacity: 50, dept_code: 'EE' },
  { building: 'Engineering Bldg', room_number: 'EE-LEC2',  room_type: 'lecture_room',  capacity: 50, dept_code: 'EE' },
  { building: 'Engineering Bldg', room_number: 'EE-LAB1',  room_type: 'laboratory',    capacity: 35, dept_code: 'EE' },
  { building: 'Engineering Bldg', room_number: 'EE-LAB2',  room_type: 'laboratory',    capacity: 35, dept_code: 'EE' },
  { building: 'Engineering Bldg', room_number: 'EE-LAB3',  room_type: 'laboratory',    capacity: 35, dept_code: 'EE' },
  { building: 'Engineering Bldg', room_number: 'EE-DRAFT', room_type: 'drafting_room', capacity: 40, dept_code: 'EE' },
  // GE-owned
  { building: 'Engineering Bldg', room_number: 'GE-LEC1',  room_type: 'lecture_room',  capacity: 50, dept_code: 'GE' },
  { building: 'Engineering Bldg', room_number: 'GE-LAB1',  room_type: 'laboratory',    capacity: 35, dept_code: 'GE' },
  { building: 'Engineering Bldg', room_number: 'GE-DRAFT', room_type: 'drafting_room', capacity: 40, dept_code: 'GE' },
  // ENVE-owned
  { building: 'Engineering Bldg', room_number: 'ENVE-LEC1', room_type: 'lecture_room', capacity: 50, dept_code: 'ENVE' },
  { building: 'Engineering Bldg', room_number: 'ENVE-LAB1', room_type: 'laboratory',   capacity: 35, dept_code: 'ENVE' },
  { building: 'Engineering Bldg', room_number: 'ENVE-LAB2', room_type: 'laboratory',   capacity: 35, dept_code: 'ENVE' },
  // Shared (unowned) — used for minors and cross-department lecture demand.
  { building: 'Main Bldg', room_number: 'AVR-1',    room_type: 'lecture_room',  capacity: 120, dept_code: null },
  { building: 'Main Bldg', room_number: 'COE-LEC1', room_type: 'lecture_room',  capacity: 60,  dept_code: null },
  { building: 'Main Bldg', room_number: 'COE-LEC2', room_type: 'lecture_room',  capacity: 60,  dept_code: null },
  { building: 'Main Bldg', room_number: 'COE-LEC3', room_type: 'lecture_room',  capacity: 60,  dept_code: null },
  { building: 'Main Bldg', room_number: 'COE-DRAFT', room_type: 'drafting_room', capacity: 40, dept_code: null },
  { building: 'Main Bldg', room_number: 'GYM',      room_type: 'other',         capacity: 300, dept_code: null },
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
  const deptIds: Record<string, string | null> = {};

  for (const deptCode of ['CPE', 'EE', 'GE', 'ENVE'] as const) {
    deptIds[deptCode] = await deptIdFor(deptCode);
  }

  for (const s of SUBJECTS) {
    const deptId = deptIds[s.owner_dept];
    if (!deptId) {
      skip('subject', `${s.code}: owner department ${s.owner_dept} missing`);
      continue;
    }

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
      is_elective: s.is_elective ?? false,
      units_mode: 'lec_lab' as const,
      elective_category: s.elective_category ?? null,
      elective_year_level: s.elective_year_level ?? null,
      elective_semester: s.elective_semester ?? null,
      is_placeholder: false,
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

  // Reconcile the catalog. Old demo rows that are no longer in SUBJECTS are
  // deactivated, not deleted, so historical schedules keep their foreign keys.
  const catalogCodes = new Set(SUBJECTS.map((s) => s.code));
  for (const deptCode of ['CPE', 'EE', 'GE', 'ENVE'] as const) {
    const deptId = deptIds[deptCode];
    if (!deptId) continue;

    const { data: activeRows } = await supabase
      .from('subject')
      .select('subject_id, subject_code')
      .eq('dept_id', deptId)
      .eq('is_active', true);

    const stale = (activeRows ?? []).filter(
      (row: { subject_code: string }) => !catalogCodes.has(row.subject_code),
    );
    if (stale.length === 0) continue;

    const { error } = await supabase
      .from('subject')
      .update({ is_active: false })
      .in(
        'subject_id',
        stale.map((row: { subject_id: unknown }) => row.subject_id),
      );
    if (error) {
      skip('subject', `${deptCode} reconciliation: ${error.message}`);
    } else {
      bump('updated', 'subject');
      console.log(`  ${deptCode}: ${stale.length} stale subject(s) deactivated`);
    }
  }

  console.log(`  ${SUBJECTS.length} subject(s) ready`);
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

  // Flatten the catalog into the rows each program should end up with.
  const desiredByProgram = new Map<
    string,
    Array<{
      subjectCode: string;
      subjectId: string;
      year: YearLevel;
      semester: Semester;
      lec: number;
      lab: number;
    }>
  >();

  for (const s of SUBJECTS) {
    const subjectId = subjectIds[s.code];
    if (!subjectId) continue;

    for (const placement of s.placements) {
      const programId = programIds[placement.program_code];
      if (!programId) {
        skip('prospectus', `${placement.program_code}: program missing`);
        continue;
      }
      const rows = desiredByProgram.get(programId) ?? [];
      rows.push({
        subjectCode: s.code,
        subjectId,
        year: placement.year,
        semester: placement.semester,
        lec: s.lec,
        lab: s.lab,
      });
      desiredByProgram.set(programId, rows);
    }
  }

  for (const p of PROGRAMS) {
    const programId = programIds[p.program_code];
    if (!programId) {
      skip('prospectus', `${p.program_code}: program missing`);
      continue;
    }

    const desired = desiredByProgram.get(programId) ?? [];
    const desiredKeys = new Set(
      desired.map((d) => `${d.subjectId}:${d.year}:${d.semester}`),
    );

    const { data: existingRows, error: readError } = await supabase
      .from('prospectus')
      .select('prospectus_id, subject_id, year_level, semester, is_active')
      .eq('program_id', programId);
    if (readError) {
      skip('prospectus', `${p.program_code}: ${readError.message}`);
      continue;
    }

    const byKey = new Map<
      string,
      { prospectus_id: unknown; is_active: boolean }
    >();
    for (const row of existingRows ?? []) {
      byKey.set(
        `${row.subject_id}:${row.year_level}:${row.semester}`,
        row,
      );
    }

    let activeCount = 0;
    let staleCount = 0;

    for (const d of desired) {
      const key = `${d.subjectId}:${d.year}:${d.semester}`;
      const existing = byKey.get(key);

      // Session lengths follow the unit load: a lecture unit is one contact
      // hour per week and a lab unit is three contact hours. The values stay
      // inside the prospectus CHECK constraints.
      const payload = {
        program_id: programId,
        subject_id: d.subjectId,
        year_level: d.year,
        semester: d.semester,
        is_active: true,
        lecture_sessions_per_week: 1,
        lecture_minutes_per_session: Math.min(240, Math.max(30, d.lec * 60)),
        lab_sessions_per_week: Math.min(3, Math.max(1, d.lab)),
        lab_minutes_per_session: 180,
      };

      if (existing) {
        const { error } = await supabase
          .from('prospectus')
          .update(payload)
          .eq('prospectus_id', existing.prospectus_id);
        if (error) {
          skip(
            'prospectus',
            `${d.subjectCode} Y${d.year} ${d.semester}: ${error.message}`,
          );
          continue;
        }
        bump('updated', 'prospectus');
      } else {
        const { error } = await supabase.from('prospectus').insert(payload);
        if (error) {
          skip(
            'prospectus',
            `${d.subjectCode} Y${d.year} ${d.semester}: ${error.message}`,
          );
          continue;
        }
        bump('inserted', 'prospectus');
      }
      activeCount++;
    }

    // Old demo rows that are no longer part of the curriculum are deactivated
    // rather than deleted so any linked schedule keeps its reference.
    for (const [key, row] of byKey) {
      if (!row.is_active || desiredKeys.has(key)) continue;

      const { error } = await supabase
        .from('prospectus')
        .update({ is_active: false })
        .eq('prospectus_id', row.prospectus_id);
      if (error) {
        skip('prospectus', `${p.program_code} deactivate: ${error.message}`);
      } else {
        bump('updated', 'prospectus');
        staleCount++;
      }
    }

    console.log(
      `  ${p.program_code}: ${activeCount} active row(s)` +
        (staleCount > 0
          ? `, ${staleCount} stale row(s) deactivated`
          : ''),
    );
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
 * For a demo, each dept gets a preference for every shared room at priority 1.
 * That exercises rule F3 / S-6 without tripping the trigger.
 */
async function seedRoomPreferences(
  roomIds: Record<string, string>,
): Promise<void> {
  console.log('[6/9] Room preferences');
  const sharedRooms = ROOMS
    .filter((r) => r.dept_code === null)
    .map((r) => ({
      key: `${r.building}::${r.room_number}`,
      roomId: roomIds[`${r.building}::${r.room_number}`],
    }))
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

  for (const deptCode of ['CPE', 'EE', 'GE', 'ENVE'] as const) {
    const people = FACULTY[deptCode];
    const deptId = await deptIdFor(deptCode);
    if (!deptId) {
      skip('faculty', `department ${deptCode} missing`);
      continue;
    }

    const programCode = PROGRAMS.find(
      (p) => p.dept_code === deptCode,
    )?.program_code;
    const programMinorCodes = programCode
      ? SUBJECTS.filter(
          (s) =>
            s.is_minor &&
            s.placements.some((p) => p.program_code === programCode),
        ).map((s) => s.code)
      : [];

    for (const [index, f] of people.entries()) {
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
      const baseHours =
        f.classification === 'part_time'
          ? 12
          : f.classification === 'visiting_lecturer'
            ? 9
            : 18;
      const requiredHours = Math.max(0, baseHours - releaseHours);

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
      // The specialization groups cover the major subjects. Minor subjects
      // are assigned round-robin across the department so every shared
      // subject has at least one qualified teacher for manual plotting.
      const qualCodes = new Set<string>();
      for (const spec of f.specializations) {
        for (const code of SPECIALIZATIONS[spec] ?? []) {
          qualCodes.add(code);
        }
      }

      for (let i = index; i < programMinorCodes.length; i += people.length) {
        qualCodes.add(programMinorCodes[i]);
      }

      // Read existing quals first so the report can distinguish inserts from
      // updates and the stale cleanup can reuse the same rows.
      const { data: existingQuals } = await supabase
        .from('faculty_qualification')
        .select('qual_id, subject_id')
        .eq('faculty_id', facultyId);

      const existingSubjectIds = new Set(
        (existingQuals ?? []).map((q: { subject_id: unknown }) =>
          String(q.subject_id),
        ),
      );

      const desiredSubjectIds = new Set<string>();
      for (const code of qualCodes) {
        const subjectId = subjectIds[code];
        if (!subjectId) continue;
        desiredSubjectIds.add(subjectId);

        const { error } = await supabase
          .from('faculty_qualification')
          .upsert(
            {
              faculty_id: facultyId,
              subject_id: subjectId,
              source_system: 'demo-seed',
            },
            { onConflict: 'faculty_id,subject_id' },
          );
        if (!error) {
          bump(
            existingSubjectIds.has(subjectId) ? 'updated' : 'inserted',
            'faculty_qualification',
          );
        }
      }

      // Drop quals that are no longer part of this faculty's load.
      const staleQuals = (existingQuals ?? []).filter(
        (q: { subject_id: unknown }) =>
          !desiredSubjectIds.has(String(q.subject_id)),
      );
      if (staleQuals.length > 0) {
        const { error } = await supabase
          .from('faculty_qualification')
          .delete()
          .in(
            'qual_id',
            staleQuals.map((q: { qual_id: unknown }) => q.qual_id),
          );
        if (error) {
          skip('faculty_qualification', `${email}: ${error.message}`);
        } else {
          bump('updated', 'faculty_qualification', staleQuals.length);
        }
      }

      // ── Preferences ──
      // Every third faculty member prefers a morning block. The day rotates
      // so the demo does not stack every preference on Monday.
      await supabase
        .from('faculty_preference')
        .delete()
        .eq('faculty_id', facultyId);

      if (index % 3 === 0) {
        const preferredDays = ['Monday', 'Wednesday', 'Friday'] as const;
        const { error } = await supabase.from('faculty_preference').insert({
          faculty_id: facultyId,
          preferred_day: preferredDays[index % preferredDays.length],
          preferred_start_time: '07:00',
          preferred_end_time: '12:00',
        });
        if (!error) bump('inserted', 'faculty_preference');
      }

      // ── Unavailability ──
      // The last two faculty in each department have a recurring afternoon
      // block for department meetings.
      await supabase
        .from('faculty_unavailability')
        .delete()
        .eq('faculty_id', facultyId);

      if (index >= people.length - 2) {
        const { error } = await supabase
          .from('faculty_unavailability')
          .insert({
            faculty_id: facultyId,
            term_id: null,
            day_of_week: index % 2 === 0 ? 'Wednesday' : 'Thursday',
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
 * Section counts come from SECTION_LETTERS: BSCPE and the background
 * programs get one section per year level; BSEE gets two. Old demo sections
 * outside that set are deactivated rather than deleted.
 */
async function seedSections(programIds: Record<string, string>): Promise<void> {
  console.log('[8/9] Sections');

  for (const p of PROGRAMS) {
    const programId = programIds[p.program_code];
    if (!programId) {
      skip('section', `${p.program_code}: program missing`);
      continue;
    }

    const letters = SECTION_LETTERS[p.program_code as ProgramCode] ?? ['A'];
    const desiredCodes = new Set<string>();

    for (let year = 1; year <= 4; year++) {
      for (const letter of letters) {
        const sectionCode = `${p.program_code}-${year}${letter}`;
        desiredCodes.add(sectionCode);

        const { data: existing } = await supabase
          .from('section')
          .select('section_id')
          .eq('section_code', sectionCode)
          .maybeSingle();

        const payload = {
          section_code: sectionCode,
          program_id: programId,
          year_level: year,
          // 35 fits every demo lab (the smallest rooms seat 35), so the
          // cohort-overflow rule does not warn on every laboratory block.
          student_count: 35,
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

    const { data: activeSections } = await supabase
      .from('section')
      .select('section_id, section_code')
      .eq('program_id', programId)
      .eq('is_active', true);

    const stale = (activeSections ?? []).filter(
      (s: { section_code: string }) => !desiredCodes.has(s.section_code),
    );
    if (stale.length > 0) {
      const { error } = await supabase
        .from('section')
        .update({ is_active: false })
        .in(
          'section_id',
          stale.map((s: { section_id: unknown }) => s.section_id),
        );
      if (error) {
        skip('section', `${p.program_code} reconciliation: ${error.message}`);
      } else {
        bump('updated', 'section');
      }
    }

    console.log(
      `  ${p.program_code}: ${desiredCodes.size} section(s)` +
        (stale.length > 0
          ? `, ${stale.length} stale section(s) deactivated`
          : ''),
    );
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
  console.log('       Expected demo shape: BSCPE 4 sections, BSEE 8 sections,');
  console.log('       10 CPE faculty, 10 EE faculty, full CPE/EE prospectuses.');
  console.log('    2. Optional: check room sufficiency via');
  console.log('       GET /v1/scheduling/room-sufficiency?deptId=<CPE dept_id>');
  console.log('       If "sufficient": false, add rooms to ROOMS and re-run.');
  console.log('    3. Open Timetable as head.cpe@wmsu.edu.ph (or head.ee@wmsu.edu.ph)');
  console.log('       and click Auto-generate. The pre-flight warning lists the minor');
  console.log('       subjects still unplotted. Confirm to generate without minors,');
  console.log('       then plot those minors manually to clear the warning.');
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