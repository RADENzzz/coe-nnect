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
      (u) =>
        (u as { email?: string }).email?.toLowerCase() === email.toLowerCase(),
    ) ?? null
  );
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const DEMO_PASSWORD = 'Demo!2345';

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

const PROGRAMS = [
  { program_code: 'BSCPE', program_name: 'BS Computer Engineering', dept_code: 'BSCPE' },
  { program_code: 'BSEE',  program_name: 'BS Electrical Engineering', dept_code: 'EE' },
  { program_code: 'BSME',  program_name: 'BS Mechanical Engineering', dept_code: 'ME' },
  { program_code: 'BSCE',  program_name: 'BS Civil Engineering',      dept_code: 'CE' },
];

// ── Subjects ──
// Real BSCPE curriculum, effective SY 2023-2024
// (CHED CMO #87 s. 2017 + BOR Res. No. 70 s. 2023)
//
// Format: { subject_code, title, total_units, lecture_units, lab_units, required_room_type, dept_code }
//   - required_room_type = null     → lecture room or any
//   - required_room_type = 'laboratory' or 'computer_lab' → enforces room type match
//
// Units from PDF: LEC, LAB, TOTAL columns
// ── Subjects ──
// Real BSCPE curriculum, effective SY 2023-2024
// (CHED CMO #87 s. 2017 + BOR Res. No. 70 s. 2023)
//
// Format: { subject_code, title, total_units, lecture_units, lab_units, required_room_type, dept_code, source_dept }
//   - required_room_type = null     → lecture room or any
//   - required_room_type = 'laboratory' | 'computer_lab' → enforces room type match
//   - source_dept = null     → CPE-owned (scheduled by CPE solver)
//   - source_dept = 'X'      → external (Math, GenEd, PE, EPIC, NSTP Office) — not scheduled by CPE solver
const SUBJECTS = [
  // ═════════════════════════════════════════
  // YEAR 1 — 1st Semester
  // ═════════════════════════════════════════
  { subject_code: 'BEM 111',    title: 'Engineering Calculus 1',              total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Math Dept' },
  { subject_code: 'BES 111',    title: 'Chemistry for Engineers',             total_units: 4, lecture_units: 3, lab_units: 1, required_room_type: 'laboratory',   dept_code: 'BSCPE', source_dept: 'Eng Sciences' },
  { subject_code: 'CPE 111',    title: 'Computer Engineering as Discipline',  total_units: 1, lecture_units: 1, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 113',    title: 'Programming Logic and Design',        total_units: 2, lecture_units: 0, lab_units: 2, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 115',    title: 'Computer Hardware Fundamentals',      total_units: 1, lecture_units: 0, lab_units: 1, required_room_type: 'laboratory',   dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'US 101',     title: 'Understanding the Self',              total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Liberal Arts' },
  { subject_code: 'MATH 100',   title: 'Mathematics in the Modern World',     total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Math Dept' },
  { subject_code: 'CAS 101',    title: 'Purposive Communication',             total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Liberal Arts' },
  { subject_code: 'PATHFit 1',  title: 'Movement and Competency Training',    total_units: 2, lecture_units: 2, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'PE Dept' },
  { subject_code: 'NSTP 1',     title: 'CWTS 1 / LTS 1 / ROTC 1',             total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'NSTP Office' },
  { subject_code: 'EPIC 1',     title: 'EPIC Start 1',                        total_units: 3, lecture_units: 0, lab_units: 3, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'EPIC Office' },

  // ═════════════════════════════════════════
  // YEAR 1 — 2nd Semester
  // ═════════════════════════════════════════
  { subject_code: 'BEM 112',    title: 'Engineering Calculus 2',              total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Math Dept' },
  { subject_code: 'BES 112',    title: 'Physics for Engineers',               total_units: 4, lecture_units: 3, lab_units: 1, required_room_type: 'laboratory',   dept_code: 'BSCPE', source_dept: 'Eng Sciences' },
  { subject_code: 'BEM 114',    title: 'Engineering Data Analytics',          total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Math Dept' },
  { subject_code: 'CPE 114',    title: 'Object-oriented Programming',         total_units: 2, lecture_units: 0, lab_units: 2, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 112',    title: 'Discrete Mathematics',                total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'STS 100',    title: 'Science, Technology and Society',     total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Liberal Arts' },
  { subject_code: 'ETHICS 101', title: 'Ethics',                              total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Liberal Arts' },
  { subject_code: 'PATHFit 2',  title: 'Exercise-based Fitness Activities',   total_units: 2, lecture_units: 2, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'PE Dept' },
  { subject_code: 'NSTP 2',     title: 'CWTS 2 / LTS 2 / ROTC 2',             total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'NSTP Office' },
  { subject_code: 'EPIC 2',     title: 'EPIC Start 2',                        total_units: 3, lecture_units: 0, lab_units: 3, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'EPIC Office' },

  // ═════════════════════════════════════════
  // YEAR 2 — 1st Semester
  // ═════════════════════════════════════════
  { subject_code: 'BEM 121',    title: 'Differential Equations',              total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Math Dept' },
  { subject_code: 'BES 121',    title: 'Computer-Aided Drafting',             total_units: 1, lecture_units: 0, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: 'Eng Sciences' },
  { subject_code: 'CPE 121',    title: 'Data Structures and Algorithms',      total_units: 4, lecture_units: 2, lab_units: 2, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 123',    title: 'Fundamentals of Electrical Circuits', total_units: 4, lecture_units: 3, lab_units: 1, required_room_type: 'laboratory',   dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 125',    title: 'Design Thinking and Innovation',      total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 127',    title: 'Fundamentals of Artificial Intelligence', total_units: 3, lecture_units: 1, lab_units: 2, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'BES 123',    title: 'Engineering Economics',               total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Eng Sciences' },
  { subject_code: 'HIST 100',   title: 'Life & Works of Rizal',               total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Liberal Arts' },
  { subject_code: 'PATHFit 3',  title: 'Dance / Sports / Martial Arts / Group Exercise', total_units: 2, lecture_units: 2, lab_units: 0, required_room_type: null, dept_code: 'BSCPE', source_dept: 'PE Dept' },
  { subject_code: 'EPIC 3',     title: 'EPIC Accelerate 3',                   total_units: 3, lecture_units: 0, lab_units: 3, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'EPIC Office' },

  // ═════════════════════════════════════════
  // YEAR 2 — 2nd Semester
  // ═════════════════════════════════════════
  { subject_code: 'BEM 122',    title: 'Numerical Methods',                   total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Math Dept' },
  { subject_code: 'CPE 122',    title: 'Software Design',                     total_units: 4, lecture_units: 3, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 124',    title: 'Fundamentals of Digital Systems',     total_units: 2, lecture_units: 2, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 126',    title: 'Fundamentals of Electronic Circuits', total_units: 4, lecture_units: 3, lab_units: 1, required_room_type: 'laboratory',   dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 128',    title: 'Web Development',                     total_units: 2, lecture_units: 0, lab_units: 2, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CW 101',     title: 'The Contemporary World',              total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Liberal Arts' },
  { subject_code: 'PHILCON',    title: 'Philippine Constitution',             total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Liberal Arts' },
  { subject_code: 'PATHFit 4',  title: 'Dance 2 / Sports 2 / Martial Arts 2', total_units: 2, lecture_units: 2, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'PE Dept' },
  { subject_code: 'EPIC 4',     title: 'EPIC Accelerate 4',                   total_units: 3, lecture_units: 0, lab_units: 3, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'EPIC Office' },

  // ═════════════════════════════════════════
  // YEAR 3 — 1st Semester
  // ═════════════════════════════════════════
  { subject_code: 'CPE 131',    title: 'Logic Circuits and Design',           total_units: 4, lecture_units: 3, lab_units: 1, required_room_type: 'laboratory',   dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 133',    title: 'Data and Digital Communication',      total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 135',    title: 'Feedback and Control Systems',        total_units: 4, lecture_units: 3, lab_units: 1, required_room_type: 'laboratory',   dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 137',    title: 'Computer Engineering Drafting and Design', total_units: 1, lecture_units: 0, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 141',    title: 'Fundamentals of Mixed Signals and Sensors', total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,      dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 143',    title: 'Operating System',                    total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 145',    title: 'Introduction to HDL',                 total_units: 1, lecture_units: 0, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE NETWORK 1', title: 'Fundamentals of Networking',      total_units: 3, lecture_units: 2, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },

  // ═════════════════════════════════════════
  // YEAR 3 — 2nd Semester
  // ═════════════════════════════════════════
  { subject_code: 'CPE 132',    title: 'Microprocessors',                     total_units: 4, lecture_units: 3, lab_units: 1, required_room_type: 'laboratory',   dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 134',    title: 'Methods of Research',                 total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 136',    title: 'Computer Networks and Security',      total_units: 4, lecture_units: 3, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 138',    title: 'Digital Signal Processing',           total_units: 4, lecture_units: 3, lab_units: 1, required_room_type: 'laboratory',   dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'BES 142',    title: 'Technopreneurship 101',               total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Eng Sciences' },
  { subject_code: 'HIST 101',   title: 'Readings in Philippine History',      total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Liberal Arts' },
  { subject_code: 'A&H 100',    title: 'Art Appreciation',                    total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: 'Liberal Arts' },
  { subject_code: 'CPE NETWORK 2', title: 'Routing Protocols and Concepts',  total_units: 3, lecture_units: 2, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },

  // ═════════════════════════════════════════
  // YEAR 4 — 1st Semester
  // ═════════════════════════════════════════
  { subject_code: 'CPE 151',    title: 'CpE Laws and Professional Practice',  total_units: 2, lecture_units: 2, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 153',    title: 'Basic Occupational Health & Safety',  total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 155',    title: 'CpE Practice and Design 2',           total_units: 1, lecture_units: 0, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE NETWORK 3', title: 'LAN Switching and Wireless',      total_units: 3, lecture_units: 2, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },

  // ═════════════════════════════════════════
  // YEAR 4 — 2nd Semester
  // ═════════════════════════════════════════
  { subject_code: 'CPE 152',    title: 'Emerging Technologies in CpE',        total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 154',    title: 'Computer Architecture and Organization', total_units: 4, lecture_units: 3, lab_units: 1, required_room_type: 'laboratory', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 156',    title: 'CpE Practice and Design 2',           total_units: 1, lecture_units: 0, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 158',    title: 'Seminars and Field Trips',            total_units: 1, lecture_units: 0, lab_units: 1, required_room_type: null,           dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 160',    title: 'On-the-Job Training (240 hours)',     total_units: 3, lecture_units: 3, lab_units: 0, required_room_type: null,           dept_code: 'BSCPE', source_dept: null },

  // ═════════════════════════════════════════
  // SUMMER CLASS
  // ═════════════════════════════════════════
  { subject_code: 'CPE 147',    title: 'Embedded Systems',                    total_units: 4, lecture_units: 3, lab_units: 1, required_room_type: 'laboratory',   dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE 149',    title: 'CpE Practice and Design 1',           total_units: 1, lecture_units: 0, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },

  // ═════════════════════════════════════════
  // TRACK ELECTIVES — SD, RPA, TECHNO
  // (NETWORK track already defined above)
  // These are seeded as subjects only — not in PROSPECTUS yet,
  // because the SRS doesn't model per-section track selection.
  // ═════════════════════════════════════════
  { subject_code: 'CPE SD 1',     title: 'Database Management Systems',   total_units: 3, lecture_units: 2, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE SD 2',     title: 'Software Engineering',          total_units: 3, lecture_units: 2, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE SD 3',     title: 'Management Information System', total_units: 3, lecture_units: 2, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },

  { subject_code: 'CPE RPA 1',    title: 'Vision Intelligence and Machine Learning', total_units: 3, lecture_units: 2, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE RPA 2',    title: 'Deep Learning',                 total_units: 3, lecture_units: 2, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE RPA 3',    title: 'Data Analytics',                total_units: 3, lecture_units: 2, lab_units: 1, required_room_type: 'computer_lab', dept_code: 'BSCPE', source_dept: null },

  { subject_code: 'CPE TECHNO 1', title: 'Basic Accounting',              total_units: 3, lecture_units: 2, lab_units: 1, required_room_type: null,           dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE TECHNO 2', title: 'Development of Enterprise',     total_units: 3, lecture_units: 2, lab_units: 1, required_room_type: null,           dept_code: 'BSCPE', source_dept: null },
  { subject_code: 'CPE TECHNO 3', title: 'Management of Technology Enterprise', total_units: 3, lecture_units: 2, lab_units: 1, required_room_type: null,     dept_code: 'BSCPE', source_dept: null },
];

// ── Prospectus ──
// Full BSCPE curriculum map. Only 1st-semester entries are used by
// the solver (since term.semester doesn't exist yet — future SRS work).
// All entries are seeded for completeness.
const PROSPECTUS = [
  // YEAR 1 — 1st Sem
  { program_code: 'BSCPE', subject_code: 'BEM 111',   year_level: 1, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'BES 111',   year_level: 1, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 111',   year_level: 1, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 113',   year_level: 1, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 115',   year_level: 1, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'US 101',    year_level: 1, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'MATH 100',  year_level: 1, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CAS 101',   year_level: 1, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'PATHFit 1', year_level: 1, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'NSTP 1',    year_level: 1, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'EPIC 1',    year_level: 1, semester: '1st' },

  // YEAR 1 — 2nd Sem
  { program_code: 'BSCPE', subject_code: 'BEM 112',   year_level: 1, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'BES 112',   year_level: 1, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'BEM 114',   year_level: 1, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE 114',   year_level: 1, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE 112',   year_level: 1, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'STS 100',   year_level: 1, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'ETHICS 101', year_level: 1, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'PATHFit 2', year_level: 1, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'NSTP 2',    year_level: 1, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'EPIC 2',    year_level: 1, semester: '2nd' },

  // YEAR 2 — 1st Sem
  { program_code: 'BSCPE', subject_code: 'BEM 121',   year_level: 2, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'BES 121',   year_level: 2, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 121',   year_level: 2, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 123',   year_level: 2, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 125',   year_level: 2, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 127',   year_level: 2, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'BES 123',   year_level: 2, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'HIST 100',  year_level: 2, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'PATHFit 3', year_level: 2, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'EPIC 3',    year_level: 2, semester: '1st' },

  // YEAR 2 — 2nd Sem
  { program_code: 'BSCPE', subject_code: 'BEM 122',   year_level: 2, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE 122',   year_level: 2, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE 124',   year_level: 2, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE 126',   year_level: 2, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE 128',   year_level: 2, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CW 101',    year_level: 2, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'PHILCON',   year_level: 2, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'PATHFit 4', year_level: 2, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'EPIC 4',    year_level: 2, semester: '2nd' },

  // YEAR 3 — 1st Sem
  { program_code: 'BSCPE', subject_code: 'CPE 131',   year_level: 3, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 133',   year_level: 3, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 135',   year_level: 3, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 137',   year_level: 3, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 141',   year_level: 3, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 143',   year_level: 3, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 145',   year_level: 3, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE NETWORK 1', year_level: 3, semester: '1st' },

  // YEAR 3 — 2nd Sem
  { program_code: 'BSCPE', subject_code: 'CPE 132',   year_level: 3, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE 134',   year_level: 3, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE 136',   year_level: 3, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE 138',   year_level: 3, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'BES 142',   year_level: 3, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'HIST 101',  year_level: 3, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'A&H 100',   year_level: 3, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE NETWORK 2', year_level: 3, semester: '2nd' },

  // YEAR 4 — 1st Sem
  { program_code: 'BSCPE', subject_code: 'CPE 151',   year_level: 4, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 153',   year_level: 4, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE 155',   year_level: 4, semester: '1st' },
  { program_code: 'BSCPE', subject_code: 'CPE NETWORK 3', year_level: 4, semester: '1st' },

  // YEAR 4 — 2nd Sem
  { program_code: 'BSCPE', subject_code: 'CPE 152',   year_level: 4, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE 154',   year_level: 4, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE 156',   year_level: 4, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE 158',   year_level: 4, semester: '2nd' },
  { program_code: 'BSCPE', subject_code: 'CPE 160',   year_level: 4, semester: '2nd' },

  // SUMMER
  { program_code: 'BSCPE', subject_code: 'CPE 147',   year_level: 3, semester: 'summer' },
  { program_code: 'BSCPE', subject_code: 'CPE 149',   year_level: 3, semester: 'summer' },
];

// ── Sections ──
// 4 sections — one per year level. No sub-sections (per PM confirmation
// Oct 2026: track split happens within the section, not as new sections).
const SECTIONS = [
  { section_code: 'CpE-1A', program_code: 'BSCPE', year_level: 1 },
  { section_code: 'CpE-2A', program_code: 'BSCPE', year_level: 2 },
  { section_code: 'CpE-3A', program_code: 'BSCPE', year_level: 3 },
  { section_code: 'CpE-4A', program_code: 'BSCPE', year_level: 4 },
];

// ── Faculty ──
const FACULTY = [
  // BSCPE — 7 regular faculty
  { wmsu_id: 'WMSU-001', first_name: 'Darcy Roy',  last_name: 'Francisco',   email: 'darcy.f@wmsu.edu.ph',   dept_code: 'BSCPE', classification: 'regular',           required_hours: 18 },
  { wmsu_id: 'WMSU-002', first_name: 'Monira',     last_name: 'Kamlian',     email: 'monira.k@wmsu.edu.ph',  dept_code: 'BSCPE', classification: 'regular',           required_hours: 18 },
  { wmsu_id: 'WMSU-003', first_name: 'Lemuel',     last_name: 'Bigay',       email: 'lemuel.b@wmsu.edu.ph',  dept_code: 'BSCPE', classification: 'regular',           required_hours: 18 },
  { wmsu_id: 'WMSU-004', first_name: 'Ferdinand',  last_name: 'Guardo',      email: 'ferdinand.g@wmsu.edu.ph', dept_code: 'BSCPE', classification: 'regular',         required_hours: 18 },
  { wmsu_id: 'WMSU-005', first_name: 'Gajil',      last_name: 'Santos',      email: 'gajil.s@wmsu.edu.ph',   dept_code: 'BSCPE', classification: 'regular',           required_hours: 18 },
  { wmsu_id: 'WMSU-006', first_name: 'Fheldaura',  last_name: 'Abubakar',    email: 'fheldaura.a@wmsu.edu.ph', dept_code: 'BSCPE', classification: 'regular',         required_hours: 18 },
  { wmsu_id: 'WMSU-007', first_name: 'Nadine',     last_name: 'Evangelista', email: 'nadine.e@wmsu.edu.ph',  dept_code: 'BSCPE', classification: 'regular',           required_hours: 18 },

  // BSCPE — 2 visiting lecturers
  { wmsu_id: 'WMSU-008', first_name: 'Brian',      last_name: 'Lanorias',    email: 'brian.l@wmsu.edu.ph',   dept_code: 'BSCPE', classification: 'visiting_lecturer', required_hours: 12 },
  { wmsu_id: 'WMSU-009', first_name: 'Madie',      last_name: 'Ibno',        email: 'madie.i@wmsu.edu.ph',   dept_code: 'BSCPE', classification: 'visiting_lecturer', required_hours: 12 },

  // EE — for cross-dept demo
  { wmsu_id: 'WMSU-010', first_name: 'Ana',   last_name: 'Ramos', email: 'ana.r@wmsu.edu.ph', dept_code: 'EE', classification: 'regular', required_hours: 18 },
  { wmsu_id: 'WMSU-011', first_name: 'Luis',  last_name: 'Tan',   email: 'luis.t@wmsu.edu.ph', dept_code: 'EE', classification: 'regular', required_hours: 18 },

  // ME
  { wmsu_id: 'WMSU-012', first_name: 'Carlo', last_name: 'Mendez', email: 'carlo.m@wmsu.edu.ph', dept_code: 'ME', classification: 'regular', required_hours: 18 },

  { wmsu_id: 'WMSU-013', first_name: 'Carla', last_name: 'Reyes',    email: 'carla.r@wmsu.edu.ph', dept_code: 'BSCPE', classification: 'visiting_lecturer', required_hours: 24 },
  { wmsu_id: 'WMSU-014', first_name: 'Niel',  last_name: 'Domingo',  email: 'niel.d@wmsu.edu.ph',  dept_code: 'BSCPE', classification: 'visiting_lecturer', required_hours: 24 },
  { wmsu_id: 'WMSU-015', first_name: 'Rosa',  last_name: 'Villamor', email: 'rosa.v@wmsu.edu.ph',  dept_code: 'BSCPE', classification: 'visiting_lecturer', required_hours: 24 },
];

// ── Qualifications ──
// Every prospectus subject must have at least 1 qualified faculty,
// or the solver reports "no qualified faculty for X".
const QUALIFICATIONS = [
  // Juan — programming + math + gen-ed cross
  { wmsu_id: 'WMSU-001', subject_code: 'CPE 111' },
  { wmsu_id: 'WMSU-001', subject_code: 'CPE 113' },
  { wmsu_id: 'WMSU-001', subject_code: 'CPE 114' },
  { wmsu_id: 'WMSU-001', subject_code: 'CPE 121' },
  { wmsu_id: 'WMSU-001', subject_code: 'CPE 122' },
  { wmsu_id: 'WMSU-001', subject_code: 'CPE 128' },
  { wmsu_id: 'WMSU-001', subject_code: 'BEM 111' },
  { wmsu_id: 'WMSU-001', subject_code: 'BEM 112' },
  { wmsu_id: 'WMSU-001', subject_code: 'BEM 114' },
  { wmsu_id: 'WMSU-001', subject_code: 'BEM 121' },
  { wmsu_id: 'WMSU-001', subject_code: 'BEM 122' },
  { wmsu_id: 'WMSU-001', subject_code: 'MATH 100' },
  { wmsu_id: 'WMSU-001', subject_code: 'CPE 112' },

  // Maria — hardware + architecture + lab
  { wmsu_id: 'WMSU-002', subject_code: 'CPE 115' },
  { wmsu_id: 'WMSU-002', subject_code: 'CPE 123' },
  { wmsu_id: 'WMSU-002', subject_code: 'CPE 124' },
  { wmsu_id: 'WMSU-002', subject_code: 'CPE 126' },
  { wmsu_id: 'WMSU-002', subject_code: 'CPE 131' },
  { wmsu_id: 'WMSU-002', subject_code: 'CPE 132' },
  { wmsu_id: 'WMSU-002', subject_code: 'CPE 135' },
  { wmsu_id: 'WMSU-002', subject_code: 'CPE 138' },
  { wmsu_id: 'WMSU-002', subject_code: 'CPE 141' },
  { wmsu_id: 'WMSU-002', subject_code: 'CPE 145' },
  { wmsu_id: 'WMSU-002', subject_code: 'CPE 154' },
  { wmsu_id: 'WMSU-002', subject_code: 'BES 111' },
  { wmsu_id: 'WMSU-002', subject_code: 'BES 112' },
  { wmsu_id: 'WMSU-002', subject_code: 'BES 121' },

  // Pedro — systems + networking
  { wmsu_id: 'WMSU-003', subject_code: 'CPE 133' },
  { wmsu_id: 'WMSU-003', subject_code: 'CPE 136' },
  { wmsu_id: 'WMSU-003', subject_code: 'CPE 143' },
  { wmsu_id: 'WMSU-003', subject_code: 'CPE 147' },
  { wmsu_id: 'WMSU-003', subject_code: 'CPE 152' },
  { wmsu_id: 'WMSU-003', subject_code: 'CPE NETWORK 1' },
  { wmsu_id: 'WMSU-003', subject_code: 'CPE NETWORK 2' },
  { wmsu_id: 'WMSU-003', subject_code: 'CPE NETWORK 3' },

  // Rina — AI / capstone / design
  { wmsu_id: 'WMSU-007', subject_code: 'CPE 127' },
  { wmsu_id: 'WMSU-007', subject_code: 'CPE 134' },
  { wmsu_id: 'WMSU-007', subject_code: 'CPE 137' },
  { wmsu_id: 'WMSU-007', subject_code: 'CPE 149' },
  { wmsu_id: 'WMSU-007', subject_code: 'CPE 151' },
  { wmsu_id: 'WMSU-007', subject_code: 'CPE 155' },
  { wmsu_id: 'WMSU-007', subject_code: 'CPE 156' },
  { wmsu_id: 'WMSU-007', subject_code: 'CPE 158' },

  // Marco — gen ed / cross-dept
  { wmsu_id: 'WMSU-008', subject_code: 'US 101' },
  { wmsu_id: 'WMSU-008', subject_code: 'CAS 101' },
  { wmsu_id: 'WMSU-008', subject_code: 'STS 100' },
  { wmsu_id: 'WMSU-008', subject_code: 'ETHICS 101' },
  { wmsu_id: 'WMSU-008', subject_code: 'CW 101' },
  { wmsu_id: 'WMSU-008', subject_code: 'PHILCON' },
  { wmsu_id: 'WMSU-008', subject_code: 'HIST 100' },
  { wmsu_id: 'WMSU-008', subject_code: 'HIST 101' },
  { wmsu_id: 'WMSU-008', subject_code: 'A&H 100' },

  // Elena — PE / NSTP / EPIC / practice
  { wmsu_id: 'WMSU-009', subject_code: 'PATHFit 1' },
  { wmsu_id: 'WMSU-009', subject_code: 'PATHFit 2' },
  { wmsu_id: 'WMSU-009', subject_code: 'PATHFit 3' },
  { wmsu_id: 'WMSU-009', subject_code: 'PATHFit 4' },
  { wmsu_id: 'WMSU-009', subject_code: 'NSTP 1' },
  { wmsu_id: 'WMSU-009', subject_code: 'NSTP 2' },
  { wmsu_id: 'WMSU-009', subject_code: 'EPIC 1' },
  { wmsu_id: 'WMSU-009', subject_code: 'EPIC 2' },
  { wmsu_id: 'WMSU-009', subject_code: 'EPIC 3' },
  { wmsu_id: 'WMSU-009', subject_code: 'EPIC 4' },

  // Remaining subjects with fallback assignments
  { wmsu_id: 'WMSU-001', subject_code: 'CPE 125' },
  { wmsu_id: 'WMSU-002', subject_code: 'BES 123' },
  { wmsu_id: 'WMSU-003', subject_code: 'BES 142' },
  { wmsu_id: 'WMSU-007', subject_code: 'CPE 160' },
  { wmsu_id: 'WMSU-007', subject_code: 'CPE 153' },
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
  { setting_key: 'auto_generate_soft_rules', value: ['H-4', 'H-6', 'S-7', 'S-2'] },
  // ── NEW: configurable block-duration rules ──
  { setting_key: 'lecture_minutes_per_unit', value: 30 },
  { setting_key: 'lecture_minimum_minutes', value: 60 },
  { setting_key: 'lab_minutes_per_unit', value: 180 },
  { setting_key: 'lab_max_consecutive_minutes', value: 180 },
  { setting_key: 'special_category_minutes_per_unit', value: 60 },
  { setting_key: 'special_category_prefixes', value: 'PATHFit,NSTP,ROTC,CWTS,EPIC' },
];

const ROOMS = [
  // ── Actual rooms ──
  { room_number: '131', building: 'Engineering Bldg', room_type: 'lecture_room', capacity: null, dept_code: null },
  { room_number: '206', building: 'Engineering Bldg', room_type: 'lecture_room', capacity: 45,   dept_code: null },
  { room_number: 'TBA', building: 'Engineering Bldg', room_type: 'lecture_room', capacity: 50,   dept_code: null },
  { room_number: '205', building: 'Engineering Bldg', room_type: 'laboratory',   capacity: 20,   dept_code: null },
  { room_number: '203', building: 'Engineering Bldg', room_type: 'computer_lab', capacity: 40,   dept_code: null },
  { room_number: '204', building: 'Engineering Bldg', room_type: 'computer_lab', capacity: 40,   dept_code: null },

  // ── Theoretical rooms (placeholder) ──
  { room_number: 'LAB-A (T)',  building: 'Theoretical', room_type: 'laboratory',   capacity: 30, dept_code: null },
  { room_number: 'LAB-B (T)',  building: 'Theoretical', room_type: 'laboratory',   capacity: 30, dept_code: null },
  { room_number: 'CLAB-A (T)', building: 'Theoretical', room_type: 'computer_lab', capacity: 40, dept_code: null },
  { room_number: 'LEC-A (T)',  building: 'Theoretical', room_type: 'lecture_room', capacity: 45, dept_code: null },
];

const DESIGNATIONS = [
  { designation_name: 'Department Head', release_hours: 3 },
  { designation_name: 'TWG Member', release_hours: 6 },
];

const USERS = [
  // Hidden dev-only account. Not shown in the Users UI (see
  // users.service.ts → isDevAccount). Used for demo recovery.
  // Login with this account only during development.
  { email: 'dev-admin@wmsu.edu.ph', username: 'dev-admin', role: 'administrator', dept_code: null, wmsu_id: null },
  { email: 'head.cpe@wmsu.edu.ph', username: 'head.cpe', role: 'department_head', dept_code: 'BSCPE', wmsu_id: 'WMSU-005' },
  { email: 'head.ee@wmsu.edu.ph',  username: 'head.ee',  role: 'department_head', dept_code: 'EE',    wmsu_id: 'WMSU-010' },
  { email: 'head.me@wmsu.edu.ph',  username: 'head.me',  role: 'department_head', dept_code: 'ME',    wmsu_id: 'WMSU-012' },
  {
  email: 'dean@wmsu.edu.ph',
  username: 'dean',
  role: 'college_dean',
  dept_code: null,
  wmsu_id: null,
},
];

// ── Term ──
// A single active term so auto-generate has somewhere to write.
const TERMS = [
  {
    term_name: '1st Semester',
    school_year: '2025-2026',
    semester: '1st',           
    start_date: '2025-08-04',
    end_date: '2025-12-15',
    is_active: true,
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

    const { data, error } = await supabase
      .from(table)
      .insert(row)
      .select()
      .single();
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
  console.log(
    'Order: Depts → Programs → Subjects → Prospectus → Sections → Faculty → Quals → Users → Settings → Designations → Term → Restriction\n',
  );

  // ── 1. Departments
  console.log('[1/13] Upserting departments…');
  const deptIds = await upsertByCode('department', 'dept_code', DEPARTMENTS);
  console.log('  →', deptIds);

  // ── 2. Programs
  console.log('[2/13] Upserting programs…');
  const programIds: Record<string, string> = {};
  for (const p of PROGRAMS) {
    const deptId = deptIds[p.dept_code];
    if (!deptId) {
      console.error(`Program ${p.program_code}: dept ${p.dept_code} missing`);
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

  // ── 3. Subjects
  console.log('[3/13] Upserting subjects…');
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
      source_dept: s.source_dept ?? null,
    });
    if (error) {
      console.error(`Subject ${s.subject_code}:`, error.message);
      process.exit(1);
    }
  }
  console.log('  → subjects ready');

  const { data: subjectRows } = await supabase
    .from('subject')
    .select('subject_id, subject_code');
  const subjectIdByCode: Record<string, string> = {};
  for (const row of subjectRows ?? []) {
    subjectIdByCode[row.subject_code] = String(row.subject_id);
  }

  // ── 4. Prospectus
  console.log('[4/13] Upserting prospectus…');
  let prospectusInserted = 0;
  for (const entry of PROSPECTUS) {
    const programId = programIds[entry.program_code];
    const subjectId = subjectIdByCode[entry.subject_code];
    if (!programId || !subjectId) {
      console.warn(
        `  Skipping ${entry.program_code}/${entry.subject_code}: missing FK`,
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
  console.log(`  → ${prospectusInserted} new prospectus rows`);

  // ── 5. Sections
  console.log('[5/13] Upserting sections…');
  for (const s of SECTIONS) {
    const programId = programIds[s.program_code];
    if (!programId) {
      console.warn(`  Skipping section ${s.section_code}: missing program`);
      continue;
    }

    const { data: existing } = await supabase
      .from('section')
      .select('section_id, program_id, year_level')
      .eq('section_code', s.section_code)
      .maybeSingle();

    if (existing) {
      if (!existing.program_id || existing.year_level !== s.year_level) {
        const { error } = await supabase
          .from('section')
          .update({ program_id: programId, year_level: s.year_level })
          .eq('section_id', existing.section_id);
        if (error) console.warn(`  Patch ${s.section_code}: ${error.message}`);
      }
      continue;
    }

    const { error } = await supabase.from('section').insert({
      section_code: s.section_code,
      program_id: programId,
      year_level: s.year_level,
    });
    if (error) {
      console.error(`Section ${s.section_code}:`, error.message);
      process.exit(1);
    }
  }
  console.log('  → sections ready');

  // ── 6. Faculty
  console.log('[6/13] Upserting faculty…');
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

  const { data: facultyRows } = await supabase
    .from('faculty')
    .select('faculty_id, wmsu_id, first_name');
  const facultyIdByWmsu: Record<string, { id: string; firstName: string }> = {};
  for (const row of facultyRows ?? []) {
    if (row.wmsu_id) {
      facultyIdByWmsu[row.wmsu_id] = {
        id: String(row.faculty_id),
        firstName: row.first_name,
      };
    }
  }

  // ── 7. Faculty Qualifications
  console.log('[7/13] Upserting faculty qualifications…');
  let qualsInserted = 0;
  for (const q of QUALIFICATIONS) {
    const facultyId = facultyIdByWmsu[q.wmsu_id]?.id;
    const subjectId = subjectIdByCode[q.subject_code];
    if (!facultyId || !subjectId) {
      console.warn(
        `  Skipping qual ${q.wmsu_id}/${q.subject_code}: missing FK`,
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
      console.error(`Qual ${q.wmsu_id}/${q.subject_code}:`, error.message);
      process.exit(1);
    }
    qualsInserted++;
  }
  console.log(`  → ${qualsInserted} new qualifications`);

  // ── 8. Users
  console.log('[8/13] Ensuring users…');
  for (const u of USERS) {
    const deptId = u.dept_code ? deptIds[u.dept_code] : null;
    const facultyLink = u.wmsu_id ? facultyIdByWmsu[u.wmsu_id] : null;
    const facultyId = facultyLink?.id ?? null;
    const firstName = facultyLink?.firstName ?? u.username;

    const existing = await findAuthUserByEmail(u.email);
    if (existing) {
      await supabase.auth.admin.updateUserById(existing.id, {
        app_metadata: {
          role: u.role,
          username: u.username,
          dept_id: deptId,
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
      console.log(`  ${u.email} — updated`);
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

  // ── 9. Settings
  console.log('[9/13] Upserting scheduling settings…');
  for (const s of SETTINGS) {
    const { error } = await supabase
      .from('scheduling_setting')
      .upsert(
        { setting_key: s.setting_key, value: s.value },
        { onConflict: 'setting_key' },
      );
    if (error) {
      console.error(`Setting ${s.setting_key}:`, error.message);
      process.exit(1);
    }
  }
  console.log('  → settings ready');

  // ── 10. Designations
  console.log('[10/13] Upserting designations…');
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

  // ── 11. Rooms
  console.log('[11/13] Upserting rooms…');
  for (const r of ROOMS) {
    const { data: existing } = await supabase
      .from('room')
      .select('room_id')
      .eq('room_number', r.room_number)
      .eq('building', r.building)
      .maybeSingle();
    if (existing) continue;

    const { error } = await supabase.from('room').insert({
      room_number: r.room_number,
      building: r.building,
      room_type: r.room_type,
      capacity: r.capacity,
      dept_id: r.dept_code ? deptIds[r.dept_code] : null,
    });
    if (error) {
      console.error(`Room ${r.room_number}:`, error.message);
      process.exit(1);
    }
  }
  console.log('  → rooms ready');

  // ── 12. Terms
  console.log('[12/13] Upserting terms…');
  for (const t of TERMS) {
    const { data: existing } = await supabase
      .from('term')
      .select('term_id, semester')
      .eq('term_name', t.term_name)
      .eq('school_year', t.school_year)
      .maybeSingle();

    if (existing) {
      // Patch missing/incorrect semester on existing terms
      if (existing.semester !== t.semester) {
        const { error: updateErr } = await supabase
          .from('term')
          .update({ semester: t.semester })
          .eq('term_id', existing.term_id);
        if (updateErr) {
          console.warn(
            `  Term semester patch ${t.term_name}: ${updateErr.message}`,
          );
        } else {
          console.log(
            `  → patched ${t.term_name} semester to '${t.semester}'`,
          );
        }
      }
      continue;
    }

    // Deactivate any other active terms first
    if (t.is_active) {
      const { error: deactivateErr } = await supabase
        .from('term')
        .update({ is_active: false })
        .eq('is_active', true);
      if (deactivateErr) {
        console.warn(
          `  Could not deactivate old active terms: ${deactivateErr.message}`,
        );
      }
    }

    const { error } = await supabase.from('term').insert({
      term_name: t.term_name,
      school_year: t.school_year,
      semester: t.semester,
      start_date: t.start_date,
      end_date: t.end_date,
      is_active: t.is_active,
    });
    if (error) {
      console.error(`Term ${t.term_name}:`, error.message);
      process.exit(1);
    }
  }
  console.log('  → terms ready');

  // ── 13. Demo subject restriction
  console.log('[13/13] Adding demo subject restriction…');
  const mathId = subjectIdByCode['BEM 111'];
  const physId = subjectIdByCode['BES 112'];
  if (mathId && physId) {
    const { data: existingRestr } = await supabase
      .from('subject_restriction')
      .select('restriction_id')
      .eq('subject_id_1', mathId)
      .eq('subject_id_2', physId)
      .maybeSingle();

    if (!existingRestr) {
      await supabase.from('subject_restriction').insert({
        subject_id_1: mathId,
        subject_id_2: physId,
        warning_message:
          'BEM 111 and BES 112 are commonly taken together — avoid clashes.',
        is_active: true,
      });
    }
  }
  console.log('  → restriction ready');

  // ── Summary
  console.log('\n=== Seed complete ===\n');
  console.log('Demo credentials:');
  console.log(`  Password (all users): ${DEMO_PASSWORD}`);
  console.log('');
  console.log('  College Dean     dean@wmsu.edu.ph');
  console.log('  CpE Dept Head    head.cpe@wmsu.edu.ph');
  console.log('  EE Dept Head     head.ee@wmsu.edu.ph');
  console.log('  ME Dept Head     head.me@wmsu.edu.ph');
  console.log('');
  console.log('Seeded sections: CpE-1A, CpE-2A, CpE-3A, CpE-4A');
  console.log('Track: Network Administration (majority of batch, 23/38)');
  console.log('Total subjects: ' + SUBJECTS.length);
  console.log('Total prospectus entries: ' + PROSPECTUS.length);
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});