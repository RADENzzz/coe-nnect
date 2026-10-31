import { ROLES, type Role } from '../../lib/constants/roles';

export type TourPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface TourStep {
  /** Short, action-oriented heading. */
  title: string;
  /** One or two sentences explaining the control. */
  body: string;
  /** Optional practical tip shown in a tinted callout. */
  tip?: string;
  /**
   * CSS selector for the element to spotlight. When omitted (or when no
   * visible match exists) the step is shown as a centred card instead.
   */
  target?: string;
  placement?: TourPlacement;
  icon?: string;
}

export interface Tour {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Roles that can use this tour. Omit for every signed-in role. */
  roles?: Role[];
  /**
   * Paths this tour belongs to. Entries ending in `*` match by prefix.
   * The most specific match wins.
   */
  paths?: string[];
  steps: TourStep[];
}

const USER_ROLES: Role[] = [ROLES.DEAN, ROLES.DEPT_HEAD];

/* ────────────────────────────────────────────
   Welcome / app basics
   ──────────────────────────────────────────── */
const WELCOME_TOUR: Tour = {
  id: 'welcome',
  title: 'Welcome tour',
  description: 'A quick orientation to the navigation, search, and Help button.',
  icon: 'waving_hand',
  roles: USER_ROLES,
  steps: [
    {
      title: 'Welcome to CoE-NNECT',
      body: 'This short tour shows you where everything lives. It takes about a minute, and you can leave at any time.',
      icon: 'waving_hand',
    },
    {
      title: 'Your main navigation',
      body: 'The sidebar lists every page your role can open. On a phone, the same links appear in the bar at the bottom.',
      tip: 'Hover the sidebar to expand it; use the pin button to keep it open.',
      target: '[data-tour="sidebar"], [data-tour="bottom-nav"]',
      placement: 'right',
      icon: 'menu',
    },
    {
      title: 'Find anything with search',
      body: 'Search across subjects, faculty, rooms, sections, users, and terms. Press Ctrl+K (⌘K on Mac) from anywhere.',
      target: '[data-tour="search"]',
      placement: 'bottom',
      icon: 'search',
    },
    {
      title: 'Stay on top of updates',
      body: 'The bell collects notifications about approvals, schedule changes, and requests assigned to you.',
      target: '[data-tour="notifications"]',
      placement: 'bottom',
      icon: 'notifications',
    },
    {
      title: 'Need help on a page?',
      body: 'This Help button opens the guide library and can start a tour of the page you are on right now.',
      target: '[data-tour="tutorial-help"]',
      placement: 'bottom',
      icon: 'help',
    },
    {
      title: 'Your account and preferences',
      body: 'Open the avatar menu for Settings, the light/dark toggle, and Logout. Appearance settings are stored in this browser.',
      target: '[data-tour="profile-menu"]',
      placement: 'bottom',
      icon: 'account_circle',
    },
    {
      title: 'You are ready',
      body: 'Each page has its own short tour. Open the Help button whenever you want a guided walkthrough of what to do first.',
      tip: 'Start with your Dashboard, then follow the recommended order on screen.',
      icon: 'check_circle',
    },
  ],
};

/* ────────────────────────────────────────────
   Department Head pages
   ──────────────────────────────────────────── */
const DASHBOARD_TOUR: Tour = {
  id: 'dashboard',
  title: 'Dashboard basics',
  description: 'Read your department snapshot and start work from the right place.',
  icon: 'dashboard',
  roles: [ROLES.DEPT_HEAD],
  paths: ['/dashboard'],
  steps: [
    {
      title: 'Your department at a glance',
      body: 'The greeting, department name, and active term confirm you are working in the right place. Use refresh to pull the latest numbers.',
      target: '[data-tour="dash-header"]',
      placement: 'bottom',
      icon: 'dashboard',
    },
    {
      title: 'Check the active term first',
      body: 'Scheduling only works when a term is active. This card shows the term and how many schedule entries it contains.',
      tip: 'No active term? The College Dean creates and activates it in System Settings.',
      target: '[data-tour="dash-term"]',
      placement: 'bottom',
      icon: 'calendar_month',
    },
    {
      title: 'Start from Quick Actions',
      body: 'New Schedule opens the planner. Tasks and Flagged show work that needs your attention. Search Faculty jumps to the directory.',
      target: '[data-tour="dash-actions"]',
      placement: 'right',
      icon: 'bolt',
    },
    {
      title: 'Watch these four numbers',
      body: 'Active schedules, tasks to do, completion rate, and flagged entries tell you how healthy the department timetable is.',
      target: '[data-tour="dash-stats"]',
      placement: 'bottom',
      icon: 'monitoring',
    },
    {
      title: 'Today and recent activity',
      body: 'Today shows the next classes in your department. Recent activity lists cross-department faculty requests and their status.',
      target: '[data-tour="dash-today"]',
      placement: 'top',
      icon: 'today',
    },
    {
      title: 'Recommended order',
      body: 'Set up Faculty and Rooms, add Subjects, map them in the Prospectus, create Sections, then plot or auto-generate the timetable.',
      tip: 'Finish by checking Flagged entries and the coverage panel before sending schedules for approval.',
      icon: 'checklist',
    },
  ],
};

const TIMETABLE_TOUR: Tour = {
  id: 'timetable',
  title: 'Schedule Planner',
  description: 'Plot classes, auto-generate, filter, and export the timetable.',
  icon: 'calendar_view_month',
  paths: ['/timetable', '/dean/timetable'],
  steps: [
    {
      title: 'The Schedule Planner',
      body: 'This is the working timetable for the active term. The header shows the term, entry count, and any coverage warnings.',
      target: '[data-tour="tt-header"]',
      placement: 'bottom',
      icon: 'calendar_view_month',
    },
    {
      title: 'Add one class at a time',
      body: 'Plot Subject opens a form for subject, section, faculty, room, and time. It validates conflicts before saving.',
      target: '[data-tour="tt-plot"]',
      placement: 'bottom',
      icon: 'add_circle',
    },
    {
      title: 'Or let the solver build it',
      body: 'Auto-Generate places the whole prospectus automatically. You review a preview first and can accept or discard it.',
      tip: 'Department heads only. Make sure faculty, rooms, and sections are complete before running it.',
      target: '[data-tour="tt-auto"]',
      placement: 'bottom',
      icon: 'auto_awesome',
    },
    {
      title: 'Slice the timetable',
      body: 'Filter by department, room, faculty, section, or conflicts only. Filters change what the grid shows without editing data.',
      target: '[data-tour="tt-filters"]',
      placement: 'bottom',
      icon: 'filter_alt',
    },
    {
      title: 'Read and edit the grid',
      body: 'Each block is a class. Click a block for details; in edit mode you can move it to another slot. Red states are hard conflicts.',
      target: '[data-tour="tt-grid"]',
      placement: 'top',
      icon: 'grid_view',
    },
    {
      title: 'Export or share',
      body: 'Use the export bar to download a PDF, print, or copy the schedule. The version history keeps finalized snapshots.',
      target: '[data-tour="tt-export"]',
      placement: 'top',
      icon: 'download',
    },
  ],
};

const FACULTY_TOUR: Tour = {
  id: 'faculty',
  title: 'Faculty directory',
  description: 'Keep qualifications, preferences, and unavailability up to date.',
  icon: 'groups',
  paths: ['/faculty', '/dean/faculty'],
  steps: [
    {
      title: 'The faculty directory',
      body: 'Every faculty record used by the scheduler lives here. Use New Faculty to add someone to your department.',
      target: '[data-tour="faculty-header"]',
      placement: 'bottom',
      icon: 'groups',
    },
    {
      title: 'Find the right person',
      body: 'Search by name, email, or employee ID, then narrow by status, department, or missing qualifications.',
      target: '[data-tour="faculty-filters"]',
      placement: 'bottom',
      icon: 'filter_alt',
    },
    {
      title: 'Open a faculty record',
      body: 'Click a row to see contact details and the row menu. The menu holds preferences, qualifications, and unavailability.',
      target: '[data-tour="faculty-table"]',
      placement: 'top',
      icon: 'person_search',
    },
    {
      title: 'Why this matters',
      body: 'Auto-generate and the conflict checker use qualifications, preferred subjects, and unavailability. Missing data produces weak schedules.',
      tip: 'Fix the “Missing qualifications” count before generating a timetable.',
      icon: 'fact_check',
    },
  ],
};

const SUBJECTS_TOUR: Tour = {
  id: 'subjects',
  title: 'Subject catalog',
  description: 'Create and tag the subjects that the prospectus and scheduler use.',
  icon: 'menu_book',
  roles: [ROLES.DEPT_HEAD],
  paths: ['/subjects'],
  steps: [
    {
      title: 'The subject catalog',
      body: 'Add every subject your department teaches here first. Prospectus mapping and schedule plotting depend on this list.',
      target: '[data-tour="subjects-header"]',
      placement: 'bottom',
      icon: 'menu_book',
    },
    {
      title: 'Filter the catalog',
      body: 'Search by code or title and narrow by department, year level, semester, or load type.',
      target: '[data-tour="subjects-filters"]',
      placement: 'bottom',
      icon: 'filter_alt',
    },
    {
      title: 'Open or edit a subject',
      body: 'Click a row to edit units, hours, prerequisites, and restrictions. Restrictions control which sections can take the subject.',
      target: '[data-tour="subjects-table"]',
      placement: 'top',
      icon: 'edit_note',
    },
    {
      title: 'Next step',
      body: 'After the catalog is complete, map subjects to programs and year levels in the Prospectus, then create Sections.',
      tip: 'Subjects owned by another department should be marked as minor.',
      icon: 'arrow_forward',
    },
  ],
};

const SECTIONS_TOUR: Tour = {
  id: 'sections',
  title: 'Sections',
  description: 'Create the student cohorts that timetable entries are plotted for.',
  icon: 'view_module',
  roles: [ROLES.DEPT_HEAD],
  paths: ['/sections'],
  steps: [
    {
      title: 'Sections are your class cohorts',
      body: 'A section ties a program, year level, and semester to a group of students. Timetable entries always belong to a section.',
      target: '[data-tour="sections-header"]',
      placement: 'bottom',
      icon: 'view_module',
    },
    {
      title: 'Find a section',
      body: 'Search by section code and filter by program, year level, semester, or active status.',
      target: '[data-tour="sections-filters"]',
      placement: 'bottom',
      icon: 'filter_alt',
    },
    {
      title: 'Manage a section',
      body: 'Click a row to edit it or use the row menu to activate, deactivate, or delete. Keep student counts accurate for room sizing.',
      target: '[data-tour="sections-table"]',
      placement: 'top',
      icon: 'edit_note',
    },
    {
      title: 'Next step',
      body: 'With programs, subjects, and sections ready, open the Prospectus to map the curriculum, then plot the timetable.',
      icon: 'arrow_forward',
    },
  ],
};

const ROOMS_TOUR: Tour = {
  id: 'rooms',
  title: 'Rooms',
  description: 'Maintain rooms, capacity, type, and scheduling preferences.',
  icon: 'meeting_room',
  roles: [ROLES.DEPT_HEAD],
  paths: ['/rooms'],
  steps: [
    {
      title: 'Rooms used by the scheduler',
      body: 'Add lecture rooms, laboratories, and shared facilities here. New Room records the room number, capacity, and type.',
      target: '[data-tour="rooms-header"]',
      placement: 'bottom',
      icon: 'meeting_room',
    },
    {
      title: 'Filter the list',
      body: 'Search by room number or building and filter by owner, type, shared status, or preference.',
      target: '[data-tour="rooms-filters"]',
      placement: 'bottom',
      icon: 'filter_alt',
    },
    {
      title: 'Set preferences',
      body: 'Open a room to set capacity, room type, and scheduling preferences. These guide auto-generate and conflict warnings.',
      target: '[data-tour="rooms-table"]',
      placement: 'top',
      icon: 'tune',
    },
    {
      title: 'Check shared rooms',
      body: 'Shared rooms can be requested by other departments. Keep their availability realistic before generating schedules.',
      icon: 'handshake',
    },
  ],
};

const PROGRAMS_TOUR: Tour = {
  id: 'programs',
  title: 'Programs',
  description: 'The first step of the academic structure.',
  icon: 'school',
  paths: ['/programs', '/dean/programs'],
  steps: [
    {
      title: 'Start with programs',
      body: 'Programs are the top of the academic structure. Every subject, prospectus entry, and section belongs to one.',
      target: '[data-tour="programs-header"]',
      placement: 'bottom',
      icon: 'school',
    },
    {
      title: 'Follow the three-step workflow',
      body: 'Programs → Subjects → Prospectus. Sections and timetable plotting come after the curriculum is mapped.',
      target: '[data-tour="programs-workflow"]',
      placement: 'bottom',
      icon: 'route',
    },
    {
      title: 'Open a program',
      body: 'Click a row to edit its code, name, department, and status. Deactivated programs stop appearing in active workflows.',
      target: '[data-tour="programs-table"]',
      placement: 'top',
      icon: 'edit_note',
    },
  ],
};

const PROSPECTUS_TOUR: Tour = {
  id: 'prospectus',
  title: 'Prospectus',
  description: 'Map subjects to programs, year levels, and semesters.',
  icon: 'library_books',
  roles: [ROLES.DEPT_HEAD],
  paths: ['/prospectus'],
  steps: [
    {
      title: 'The curriculum map',
      body: 'The prospectus decides which subjects each program takes per year and semester. The planner uses it to check coverage.',
      target: '[data-tour="prospectus-header"]',
      placement: 'bottom',
      icon: 'library_books',
    },
    {
      title: 'Pick a program and term view',
      body: 'Choose the program, year level, and semester you are editing. Read-only programs belong to another department.',
      target: '[data-tour="prospectus-selector"]',
      placement: 'bottom',
      icon: 'tune',
    },
    {
      title: 'Map the subjects',
      body: 'Add Subject inserts a subject into this year/semester. Copy from… duplicates another year or semester to save time.',
      target: '[data-tour="prospectus-table"]',
      placement: 'top',
      icon: 'playlist_add',
    },
    {
      title: 'Next step',
      body: 'Once the curriculum is complete, open the Schedule Planner. The coverage panel shows any prospectus slots still unplotted.',
      icon: 'arrow_forward',
    },
  ],
};

const APPROVALS_TOUR: Tour = {
  id: 'approvals',
  title: 'Faculty requests',
  description: 'Request faculty from other departments and track the response.',
  icon: 'swap_horiz',
  roles: [ROLES.DEPT_HEAD],
  paths: ['/approvals'],
  steps: [
    {
      title: 'Cross-department requests',
      body: 'Need a faculty member from another department? Start a request here instead of editing their records directly.',
      target: '[data-tour="approvals-header"]',
      placement: 'bottom',
      icon: 'swap_horiz',
    },
    {
      title: 'Know what needs you',
      body: 'Waiting on You shows incoming requests awaiting your decision. All Requests is the full history.',
      target: '[data-tour="approvals-scope"]',
      placement: 'bottom',
      icon: 'pending_actions',
    },
    {
      title: 'Review a request',
      body: 'Open a row to approve or reject it. The requesting department is notified and the status updates immediately.',
      target: '[data-tour="approvals-table"]',
      placement: 'top',
      icon: 'fact_check',
    },
    {
      title: 'Keep it moving',
      body: 'Approve or reject promptly so the other department can finish plotting. Cancelled requests stay in the history.',
      icon: 'notifications_active',
    },
  ],
};

const REPORTS_TOUR: Tour = {
  id: 'reports',
  title: 'Reports',
  description: 'Open workload, approvals, and room-sufficiency reports.',
  icon: 'bar_chart',
  paths: ['/reports', '/dean/reports'],
  steps: [
    {
      title: 'The reports hub',
      body: 'Reports turn timetable data into summaries for planning and review. Only reports you have access to are shown.',
      target: '[data-tour="reports-header"]',
      placement: 'bottom',
      icon: 'bar_chart',
    },
    {
      title: 'Pick a report',
      body: 'Faculty Workload, Approvals, and Room Sufficiency each have their own filters and export options.',
      target: '[data-tour="reports-cards"]',
      placement: 'bottom',
      icon: 'dashboard',
    },
    {
      title: 'Use the filters',
      body: 'Every report can be narrowed by term, department, or status. Export what you see for meetings or documentation.',
      icon: 'file_download',
    },
  ],
};

const SETTINGS_TOUR: Tour = {
  id: 'settings',
  title: 'Personal settings',
  description: 'Change notifications, security, and appearance for this browser.',
  icon: 'settings',
  paths: ['/settings', '/dean/settings'],
  steps: [
    {
      title: 'Your personal settings',
      body: 'These settings belong to your account, except appearance and theme, which are stored in this browser.',
      target: '[data-tour="settings-header"]',
      placement: 'bottom',
      icon: 'settings',
    },
    {
      title: 'Choose a tab',
      body: 'Notifications controls alerts. Security handles your password. Appearance changes theme, accent colour, background tone, logo, and glass mode.',
      target: '[data-tour="settings-tabs"]',
      placement: 'bottom',
      icon: 'tab',
    },
    {
      title: 'Appearance is per browser',
      body: 'Try an accent colour or the experimental glass theme and watch the live preview. Your choices follow this browser, not the account.',
      target: '[data-tour="settings-panel"]',
      placement: 'top',
      icon: 'palette',
    },
  ],
};

const HELP_TOUR: Tour = {
  id: 'help',
  title: 'Help center',
  description: 'Search documentation, role guides, and walkthroughs.',
  icon: 'help',
  paths: ['/help', '/dean/help'],
  steps: [
    {
      title: 'Help when you need it',
      body: 'The Help center has getting-started guidance, role guides, walkthroughs, FAQs, and troubleshooting.',
      target: '[data-tour="help-header"]',
      placement: 'bottom',
      icon: 'help',
    },
    {
      title: 'Search the docs',
      body: 'Type a topic, or press / anywhere on this page to jump to search.',
      target: '[data-tour="help-search"]',
      placement: 'bottom',
      icon: 'search',
    },
    {
      title: 'Jump between sections',
      body: 'The contents list follows the page as you scroll. Role guides are tailored to your account type.',
      target: '[data-tour="help-toc"]',
      placement: 'right',
      icon: 'toc',
    },
  ],
};

/* ────────────────────────────────────────────
   Dean pages
   ──────────────────────────────────────────── */
const DEAN_DASHBOARD_TOUR: Tour = {
  id: 'dean-dashboard',
  title: "Dean's overview",
  description: 'Term controls, college-wide numbers, and department status.',
  icon: 'dashboard',
  roles: [ROLES.DEAN],
  paths: ['/dean/dashboard'],
  steps: [
    {
      title: 'The college at a glance',
      body: 'This overview shows the active term and the controls to create or manage terms for the whole college.',
      target: '[data-tour="dean-dash-header"]',
      placement: 'bottom',
      icon: 'dashboard',
    },
    {
      title: 'Watch college-wide status',
      body: 'Active departments, pending approvals, published schedules, and online department heads update as the college works.',
      target: '[data-tour="dean-dash-stats"]',
      placement: 'bottom',
      icon: 'monitoring',
    },
    {
      title: 'Department readiness',
      body: 'Use the department cards to spot deactivated departments or missing department heads before they block scheduling.',
      target: '[data-tour="dean-dash-departments"]',
      placement: 'top',
      icon: 'corporate_fare',
    },
    {
      title: 'Recommended order',
      body: 'Create the term, verify departments and users, review pending schedules, then publish finalized timetables.',
      tip: 'Audit Trail records every change if you need to investigate an edit.',
      icon: 'checklist',
    },
  ],
};

const DEAN_DEPARTMENTS_TOUR: Tour = {
  id: 'dean-departments',
  title: 'Departments',
  description: 'Review, activate, deactivate, and manage all engineering departments.',
  icon: 'corporate_fare',
  roles: [ROLES.DEAN],
  paths: ['/dean/departments'],
  steps: [
    {
      title: 'All engineering departments',
      body: 'This list covers every department under the college. Manage Departments opens the editor for names, codes, and department heads.',
      target: '[data-tour="dept-header"]',
      placement: 'bottom',
      icon: 'corporate_fare',
    },
    {
      title: 'Show deactivated',
      body: 'Deactivated departments disappear from department-head views. Toggle Show deactivated to find and reactivate one.',
      target: '[data-tour="dept-table"]',
      placement: 'top',
      icon: 'visibility',
    },
    {
      title: 'Why it matters',
      body: 'A department needs an active department head and active status before its scheduling pages work normally.',
      icon: 'info',
    },
  ],
};

const DEAN_USERS_TOUR: Tour = {
  id: 'dean-users',
  title: 'User accounts',
  description: 'Create accounts and assign the correct role and department.',
  icon: 'manage_accounts',
  roles: [ROLES.DEAN],
  paths: ['/dean/users'],
  steps: [
    {
      title: 'User accounts',
      body: 'Create and maintain the accounts that sign in to CoE-NNECT. New User sets username, email, role, and department.',
      target: '[data-tour="users-header"]',
      placement: 'bottom',
      icon: 'manage_accounts',
    },
    {
      title: 'Find an account',
      body: 'Search by name, email, employee ID, or WMSU ID, then filter by department and active status.',
      target: '[data-tour="users-filters"]',
      placement: 'bottom',
      icon: 'filter_alt',
    },
    {
      title: 'Manage roles carefully',
      body: 'College Dean accounts see the whole college. Department Head accounts are limited to their assigned department.',
      target: '[data-tour="users-table"]',
      placement: 'top',
      icon: 'admin_panel_settings',
    },
  ],
};

const DEAN_APPROVALS_TOUR: Tour = {
  id: 'dean-approvals',
  title: 'Schedule approvals',
  description: 'Review department schedules, finalize them, and track status.',
  icon: 'pending_actions',
  roles: [ROLES.DEAN],
  paths: ['/dean/approvals'],
  steps: [
    {
      title: 'Schedules waiting for you',
      body: 'The pending count shows department timetables sent for college review. Finalizing locks a schedule and creates a version snapshot.',
      target: '[data-tour="dean-approvals-header"]',
      placement: 'bottom',
      icon: 'pending_actions',
    },
    {
      title: 'Switch views',
      body: 'Pending Review, Finalized, and All show the same data from different stages of the approval workflow.',
      target: '[data-tour="dean-approvals-tabs"]',
      placement: 'bottom',
      icon: 'tab',
    },
    {
      title: 'Narrow the queue',
      body: 'Filter by department, status, or search text to focus on one department at a time.',
      target: '[data-tour="dean-approvals-filters"]',
      placement: 'bottom',
      icon: 'filter_alt',
    },
    {
      title: 'Review and act',
      body: 'Open a schedule to inspect conflicts and coverage, then finalize or return it for changes. Department heads see the result immediately.',
      target: '[data-tour="dean-approvals-table"]',
      placement: 'top',
      icon: 'fact_check',
    },
  ],
};

const SYSTEM_SETTINGS_TOUR: Tour = {
  id: 'system-settings',
  title: 'System settings',
  description: 'Academic terms and the college-wide scheduling rules.',
  icon: 'settings_applications',
  roles: [ROLES.DEAN],
  paths: ['/dean/system-settings'],
  steps: [
    {
      title: 'College-wide configuration',
      body: 'Only the College Dean can change these settings. Save changes applies them to every department.',
      target: '[data-tour="sysconfig-header"]',
      placement: 'bottom',
      icon: 'settings_applications',
    },
    {
      title: 'Academic terms',
      body: 'Create and activate terms here. A term must be active before department heads can plot or generate schedules.',
      target: '[data-tour="sysconfig-terms"]',
      placement: 'bottom',
      icon: 'calendar_month',
    },
    {
      title: 'Scheduling rules',
      body: 'Groups below control constraints such as time limits, room rules, and load policies. Change a value, review it, then save.',
      target: '[data-tour="sysconfig-groups"]',
      placement: 'top',
      icon: 'rule',
    },
    {
      title: 'Be deliberate',
      body: 'Rule changes affect every future schedule and auto-generate run. Note what changed so department heads know why results differ.',
      icon: 'warning',
    },
  ],
};

const AUDIT_TRAIL_TOUR: Tour = {
  id: 'audit-trail',
  title: 'Audit trail',
  description: 'See who changed what, when, and which record was affected.',
  icon: 'history',
  roles: [ROLES.DEAN],
  paths: ['/dean/audit-trail'],
  steps: [
    {
      title: 'Every change is recorded',
      body: 'The audit trail logs user actions across the system. Export CSV when you need a record outside the app.',
      target: '[data-tour="audit-header"]',
      placement: 'bottom',
      icon: 'history',
    },
    {
      title: 'Filter to the event',
      body: 'Combine a date preset, user, action, and search term to isolate a change or investigate an issue.',
      target: '[data-tour="audit-filters"]',
      placement: 'bottom',
      icon: 'filter_alt',
    },
    {
      title: 'Read an entry',
      body: 'Each row shows the user, action, affected data, and timestamp. Click a row for the full before/after detail.',
      target: '[data-tour="audit-table"]',
      placement: 'top',
      icon: 'visibility',
    },
  ],
};

/* ────────────────────────────────────────────
   Import
   ──────────────────────────────────────────── */
const IMPORT_LIST_TOUR: Tour = {
  id: 'import',
  title: 'Importing a prospectus',
  description: 'Upload a PDF, map its tables, and create subjects automatically.',
  icon: 'upload_file',
  paths: ['/import', '/dean/import'],
  steps: [
    {
      title: 'Import from a prospectus PDF',
      body: 'Upload the source PDF here. CoE-NNECT extracts tables so you can map columns to subjects instead of retyping them.',
      target: '[data-tour="import-header"]',
      placement: 'bottom',
      icon: 'upload_file',
    },
    {
      title: 'Open an existing import',
      body: 'Uploaded PDFs stay in this list. Open one to continue mapping or to review what was imported.',
      target: '[data-tour="import-list"]',
      placement: 'top',
      icon: 'description',
    },
    {
      title: 'The flow',
      body: 'Upload → map table columns → review extracted rows → import. Always spot-check codes, units, and year levels before importing.',
      tip: 'Importing creates missing subjects automatically. Run it before mapping the prospectus manually.',
      icon: 'fact_check',
    },
  ],
};

const IMPORT_EDITOR_TOUR: Tour = {
  id: 'import-editor',
  title: 'Mapping an import',
  description: 'Map PDF tables and review extracted rows before importing.',
  icon: 'table_chart',
  paths: ['/import/*', '/dean/import/*'],
  steps: [
    {
      title: 'Map the extracted tables',
      body: 'Match each PDF column to the right subject field, then review the live preview. Save status appears near the title.',
      target: '#main-content h1',
      placement: 'bottom',
      icon: 'table_chart',
    },
    {
      title: 'Check before importing',
      body: 'Verify subject codes, titles, units, year level, and semester. Fix extraction mistakes in the preview rather than after import.',
      tip: 'This editor works best on a desktop; the import pages ask for a wider screen.',
      icon: 'fact_check',
    },
  ],
};

const DEAN_MANAGE_DEPARTMENTS_TOUR: Tour = {
  id: 'dean-manage-departments',
  title: 'Managing departments',
  description: 'Edit department details and assign department heads.',
  icon: 'edit_note',
  roles: [ROLES.DEAN],
  paths: ['/dean/departments/manage'],
  steps: [
    {
      title: 'Department records',
      body: 'Edit names, codes, and status here. Assign an active department head so the department can operate.',
      target: '#main-content h1',
      placement: 'bottom',
      icon: 'corporate_fare',
    },
    {
      title: 'Keep one head per department',
      body: 'A department with no head cannot manage faculty or schedules. Deactivating a department hides it from its head.',
      target: '#main-content',
      placement: 'center',
      icon: 'info',
    },
  ],
};

export const TOURS: Tour[] = [
  WELCOME_TOUR,
  DASHBOARD_TOUR,
  TIMETABLE_TOUR,
  FACULTY_TOUR,
  SUBJECTS_TOUR,
  SECTIONS_TOUR,
  ROOMS_TOUR,
  PROGRAMS_TOUR,
  PROSPECTUS_TOUR,
  APPROVALS_TOUR,
  REPORTS_TOUR,
  SETTINGS_TOUR,
  HELP_TOUR,
  DEAN_DASHBOARD_TOUR,
  DEAN_DEPARTMENTS_TOUR,
  DEAN_USERS_TOUR,
  DEAN_APPROVALS_TOUR,
  SYSTEM_SETTINGS_TOUR,
  AUDIT_TRAIL_TOUR,
  IMPORT_LIST_TOUR,
  IMPORT_EDITOR_TOUR,
  DEAN_MANAGE_DEPARTMENTS_TOUR,
];

export const WELCOME_TOUR_ID = WELCOME_TOUR.id;

export function getTour(id: string | null): Tour | undefined {
  if (!id) return undefined;
  return TOURS.find((tour) => tour.id === id);
}

function pathScore(pathname: string, pattern: string): number {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return pathname.startsWith(prefix) ? prefix.length : -1;
  }
  if (pathname === pattern) return 1000 + pattern.length;
  return -1;
}

/** The most specific tour defined for a pathname and role. */
export function getTourForPath(pathname: string, role?: Role | null): Tour | undefined {
  if (!role) return undefined;
  let best: { tour: Tour; score: number } | undefined;
  for (const tour of TOURS) {
    if (!tour.paths) continue;
    if (tour.roles && !tour.roles.includes(role)) continue;
    const score = Math.max(...tour.paths.map((p) => pathScore(pathname, p)));
    if (score >= 0 && (!best || score > best.score)) best = { tour, score };
  }
  return best?.tour;
}

export function getAvailableTours(role?: Role | null): Tour[] {
  if (!role) return [];
  return TOURS.filter((tour) => !tour.roles || tour.roles.includes(role));
}
