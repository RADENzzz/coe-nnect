export interface Walkthrough {
  id: string;
  title: string;
  gif: string;
  steps: string[];
  duration?: string;
  category: 'getting-started' | 'scheduling' | 'workflow' | 'admin' | 'reports';
}

const GIF = (name: string) => `/help/gifs/${name}`;

export const WALKTHROUGHS: Walkthrough[] = [
  {
    id: 'login-dashboard',
    title: 'Login and Dashboard Tour',
    gif: GIF('01-login-dashboard.gif'),
    duration: '15s',
    category: 'getting-started',
    steps: [
      'Enter your WMSU email and password on the login page.',
      'You are routed automatically to your role portal.',
      'The dashboard shows your department summary and quick actions.',
    ],
  },
  {
    id: 'plot-single',
    title: 'Plot a Subject (Single Session)',
    gif: GIF('02-plot-single.gif'),
    duration: '20s',
    category: 'scheduling',
    steps: [
      'Open Schedule Planner and click any empty grid cell.',
      'Choose the subject, faculty, room, section, day, and time.',
      'The system validates against all constraints before saving.',
    ],
  },
  {
    id: 'plot-multi',
    title: 'Plot a Subject (Multi-Session)',
    gif: GIF('03-plot-multi.gif'),
    duration: '25s',
    category: 'scheduling',
    steps: [
      'In Plot Subject, switch to Multi-session mode.',
      'Tick the days this subject meets (e.g., Mon + Thu).',
      'Set start/end times, or use "Apply to all" to copy the first day.',
      'Submit — all sessions are validated and saved together.',
    ],
  },
  {
    id: 'auto-generate',
    title: 'Auto-Generate a Schedule',
    gif: GIF('04-auto-generate.gif'),
    duration: '30s',
    category: 'scheduling',
    steps: [
      'Click Auto-Generate in the Schedule Planner toolbar.',
      'The solver runs for a few seconds, then a preview opens.',
      'Review the amber warning banner for soft-rule violations.',
      'Click Accept to keep the schedule, or Discard to throw it away.',
    ],
  },
  {
    id: 'conflict-detection',
    title: 'Conflict Detection on Plot',
    gif: GIF('05-conflict-detection.gif'),
    duration: '15s',
    category: 'scheduling',
    steps: [
      'Attempt to plot a subject that overlaps an existing class.',
      'A red banner lists every hard rule that would be violated.',
      'Adjust the day, time, room, or faculty until the conflict clears.',
    ],
  },
  {
    id: 'drag-move',
    title: 'Drag to Move a Class Block',
    gif: GIF('06-drag-move.gif'),
    duration: '15s',
    category: 'scheduling',
    steps: [
      'Click and hold any class block in the timetable grid.',
      'Drag it to a new day/time cell.',
      'Release — the move is validated and saved optimistically.',
    ],
  },
  {
    id: 'flag-entry',
    title: 'Flag a Schedule Entry for Review',
    gif: GIF('07-flag-entry.gif'),
    duration: '15s',
    category: 'workflow',
    steps: [
      'Open any schedule entry and click the Flag button.',
      'Enter a reason (3–500 characters) and confirm.',
      'The entry gets a rose ring on the grid and appears on the dashboard tile.',
    ],
  },
  {
    id: 'finalize-version',
    title: 'Finalize and View Version History',
    gif: GIF('08-finalize-version.gif'),
    duration: '20s',
    category: 'workflow',
    steps: [
      'Open a schedule entry and change its status to Finalized.',
      'The system snapshots the entire term into a new version.',
      'Unfinalize to edit again — the system keeps both versions.',
    ],
  },
  {
    id: 'import-pdf',
    title: 'Import a Prospectus PDF',
    gif: GIF('09-import-pdf.gif'),
    duration: '40s',
    category: 'admin',
    steps: [
      'Upload a prospectus PDF from the Import Prospectus page.',
      'Draw a rectangle over each Year + Semester table.',
      'Add row boxes and column slices for code, title, units.',
      'Click Extract — the parser reads text inside each row box.',
      'Review the extracted subjects and click Import.',
    ],
  },
  {
    id: 'approvals-flow',
    title: 'Cross-Department Faculty Approval',
    gif: GIF('10-approvals.gif'),
    duration: '20s',
    category: 'workflow',
    steps: [
      'Create a request to borrow a faculty member from another department.',
      'The owning department head sees it in Approvals.',
      'They approve or reject — the requester is notified in real time.',
    ],
  },
  {
    id: 'timetable-views',
    title: 'Timetable Views (Master / Room / Faculty / Section)',
    gif: GIF('11-timetable-views.gif'),
    duration: '20s',
    category: 'scheduling',
    steps: [
      'Use the view switcher at the top of the Schedule Planner.',
      'Master shows all departments; Room shows one room; Faculty shows one teacher; Section shows one class.',
      'Use the department dropdown to narrow further.',
    ],
  },
  {
    id: 'export',
    title: 'Export as PDF, Excel, or Print',
    gif: GIF('12-export.gif'),
    duration: '15s',
    category: 'reports',
    steps: [
      'Click Export in the toolbar.',
      'Choose tabular PDF, grid PDF, or Excel.',
      'Enter a filename and download, or use Print to send to a printer.',
    ],
  },
  {
    id: 'notifications',
    title: 'Notification Bell and Inbox',
    gif: GIF('13-notifications.gif'),
    duration: '15s',
    category: 'workflow',
    steps: [
      'The bell icon shows unread notifications in real time.',
      'Click a notification to jump to the entity it references.',
      'Open the inbox to filter, search, mark as read, or delete.',
    ],
  },
  {
    id: 'system-settings',
    title: 'System Settings — Operating Hours',
    gif: GIF('14-system-settings.gif'),
    duration: '15s',
    category: 'admin',
    steps: [
      'Open System Settings from the Dean sidebar.',
      'Adjust operating hours, break durations, lunch window, or caps.',
      'Changes apply immediately to the next validation and auto-generate run.',
    ],
  },
  {
    id: 'faculty-unavailability',
    title: 'Faculty Unavailability (H-14)',
    gif: GIF('15-faculty-unavailability.gif'),
    duration: '20s',
    category: 'scheduling',
    steps: [
      'Open a faculty member and click Unavailability.',
      'Draw blocked windows on the weekly grid.',
      'Hard constraint H-14 prevents plotting into those windows and the solver avoids them preemptively.',
    ],
  },
];