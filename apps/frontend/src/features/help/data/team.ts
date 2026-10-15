export interface TeamMember {
  name: string;
  role: string;
  focus: string;
  email?: string;
  initials: string;
  accent?: 'brand' | 'slate';
}

export interface TeamGroup {
  id: string;
  label: string;
  description: string;
  members: TeamMember[];
}

export const TEAM_GROUPS: TeamGroup[] = [
  {
    id: 'leadership',
    label: 'Leadership',
    description: 'Project direction, planning, and client coordination.',
    members: [
      {
        name: 'Jazmine Elaiza L. Luis',
        role: 'Project Manager',
        focus: 'Project planning, coordination, and stakeholder communication',
        initials: 'JL',
        accent: 'brand',
      },
    ],
  },
  {
    id: 'development',
    label: 'Development',
    description: 'System architecture, implementation, and frontend engineering.',
    members: [
      {
        name: 'Alrhaden A. Javier',
        role: 'Lead Developer · System Architect',
        focus: 'Sys. Architecture, Backend & Frontend, Constraint engine, solver integration, API design',
        email: 'alrhaden1@gmail.com',
        initials: 'AJ',
        accent: 'brand',
      },
      {
        name: 'Giel V. Andales',
        role: 'Senior Developer',
        focus: 'Early Frontend scafolding',
        email: 'giel.andales@wmsu.edu.ph',
        initials: 'GA',
        accent: 'brand',
      },
      {
        name: 'Edzel Don V. Tio',
        role: 'Junior Developer · Database Initialization',
        focus: 'Initial PostgreSQL schema, base tables, enums, and RLS policies',
        email: 'edzel.tio@wmsu.edu.ph',
        initials: 'ET',
        accent: 'brand',
      },
    ],
  },
  {
    id: 'quality',
    label: 'Quality & Training',
    description: 'Testing strategy, user training, and archival support.',
    members: [
      {
        name: 'Roland C. Velez',
        role: 'Lead Tester · Assistant Trainer · Junior Archivist',
        focus: 'Quality assurance, test coverage, user onboarding',
        initials: 'RV',
        accent: 'brand',
      },
      {
        name: 'Andre Aga B. Dacumos',
        role: 'Lead Trainer · Senior Tester',
        focus: 'User training, documentation walkthroughs, testing',
        initials: 'AD',
        accent: 'brand',
      },
    ],
  },
  {
    id: 'analysis',
    label: 'Analysis & Documentation',
    description: 'Requirements analysis, SRS authoring, and archival records.',
    members: [
      {
        name: 'Aizzah Arabelle B. Javelosa',
        role: 'Lead Archivist · Assistant System Analyst',
        focus: 'Requirements documentation, archival structure',
        initials: 'AJ',
        accent: 'brand',
      },
      {
        name: 'Euwan Tyrone B. Prias',
        role: 'Lead System Analyst · Senior Archivist',
        focus: 'System analysis, IDP integration, archival records',
        initials: 'EP',
        accent: 'brand',
      },
    ],
  },
];

export const CLIENT: TeamMember = {
  name: 'Engr. Gajil J. Santos',
  role: 'Project Client',
  focus: 'College of Engineering, WMSU',
  initials: 'GS',
};

export const ABOUT = {
  product: 'CoE-NNECT',
  fullName: 'College of Engineering Scheduling System',
  institution: 'Western Mindanao State University',
  description:
    'A web-based scheduling system that replaces spreadsheet-based timetable planning across ten engineering departments. Features a constraint engine with 27 rules and a CP-SAT solver for automatic schedule generation.',
  version: '1.0.0',
  buildDate: '2026-10-13',
};