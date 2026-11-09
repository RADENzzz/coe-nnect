export type TroubleshootingCategory =
  | 'scheduling'
  | 'rooms'
  | 'access'
  | 'workflow'
  | 'import'
  | 'realtime';

export interface TroubleshootingItem {
  issue: string;
  fix: string;
  severity: 'warning' | 'info';
  category: TroubleshootingCategory;
  /** Extra ordered checks shown under the fix. */
  checks?: string[];
}

export const TROUBLESHOOTING_CATEGORY_LABELS: Record<
  TroubleshootingCategory,
  string
> = {
  scheduling: 'Scheduling',
  rooms: 'Rooms',
  access: 'Access',
  workflow: 'Workflow',
  import: 'Import',
  realtime: 'Real-time',
};

export const TROUBLESHOOTING: TroubleshootingItem[] = [
  {
    issue: "A class block won't stay where I drop it.",
    fix: 'The system validates every move against hard constraints. If a conflict exists, the block snaps back and the red banner names the rule that blocked it.',
    severity: 'warning',
    category: 'scheduling',
    checks: [
      'Look for faculty, room, or section overlap in the banner.',
      'Confirm the time stays inside operating hours.',
      'Check whether the faculty member is marked unavailable at that time.',
    ],
  },
  {
    issue: 'Auto-generate says "not enough rooms".',
    fix: 'Room sufficiency is checked before the solver runs. Add rooms of the required type, or reduce the sections taking that subject.',
    severity: 'warning',
    category: 'rooms',
    checks: [
      'Read the room type named in the warning.',
      'Confirm the rooms are active and owned or shared with your department.',
      'Re-run after adding capacity.',
    ],
  },
  {
    issue: "I can't edit a schedule entry — it says locked.",
    fix: 'Finalized and published entries are locked. Change the status back to Draft or Review first, then edit.',
    severity: 'info',
    category: 'workflow',
  },
  {
    issue: 'No active term, so I cannot plot classes.',
    fix: 'Only the College Dean can create and activate an academic term. Ask the dean to activate the term you are scheduling for.',
    severity: 'warning',
    category: 'access',
  },
  {
    issue: 'My department page says the department is deactivated.',
    fix: 'A deactivated department is walled from scheduling. The College Dean must reactivate it under Departments before you can continue.',
    severity: 'warning',
    category: 'access',
  },
  {
    issue: 'I cannot sign in with my WMSU email.',
    fix: 'Accounts are created by the College Dean or secretary. Confirm the account is active and assigned to the right department before retrying.',
    severity: 'info',
    category: 'access',
    checks: [
      'Check the email spelling and password.',
      'Ask the dean to confirm the account is active.',
      'If your department was deactivated, ask for it to be reactivated.',
    ],
  },
  {
    issue: 'The prospectus PDF parser returns 404 or 500.',
    fix: 'The parser service may be unavailable. Retry once, then report the error to the system administrator.',
    severity: 'warning',
    category: 'import',
    checks: [
      'Confirm you uploaded a valid PDF.',
      'Check that the editor works on a desktop-size screen.',
      'Report the error with the import file name and time.',
    ],
  },
  {
    issue: "Notifications aren't arriving.",
    fix: 'The real-time connection may have dropped. Refresh the page; new activity will also appear the next time the list loads.',
    severity: 'warning',
    category: 'realtime',
  },
  {
    issue: 'Auto-generate is blocked by another run.',
    fix: 'Only one auto-generate run is allowed per term at a time. If a previous run was interrupted, the lock self-heals after about 10 minutes.',
    severity: 'info',
    category: 'scheduling',
  },
];
