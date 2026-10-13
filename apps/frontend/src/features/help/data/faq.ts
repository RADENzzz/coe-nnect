export interface Faq {
  q: string;
  a: string;
  category?: 'general' | 'scheduling' | 'import' | 'workflow' | 'technical';
}

export const FAQ: Faq[] = [
  {
    q: 'What is CoE-NNECT?',
    a: 'CoE-NNECT is the College of Engineering Scheduling System for WMSU. It replaces spreadsheet scheduling with a validated web interface, a constraint engine, and an automatic solver.',
    category: 'general',
  },
  {
    q: 'Who can use the system?',
    a: 'Two user-facing roles: College Dean and Department Head. A hidden developer account is used for seeding and recovery only.',
    category: 'general',
  },
  {
    q: 'Why does the Schedule Planner look different for me?',
    a: 'The default view is scoped to your department. Use the view switcher to change between Master, Room, Faculty, and Section views.',
    category: 'scheduling',
  },
  {
    q: 'What is the difference between Auto-Generate and manual plotting?',
    a: 'Auto-Generate runs the CP-SAT solver to place every unassigned subject at once. Manual plotting lets you place one subject at a time with instant validation.',
    category: 'scheduling',
  },
  {
    q: 'Can I still edit a finalized schedule?',
    a: 'No — finalized and published schedules are locked. Unfinalize the entry first (which snapshots the current version), then edit.',
    category: 'workflow',
  },
  {
    q: 'What happens when I finalize a schedule?',
    a: 'The system snapshots the entire term into a version. The version history is preserved even after you unfinalize.',
    category: 'workflow',
  },
  {
    q: 'Why do some auto-generate runs produce warnings?',
    a: 'Soft rules (like H-4 max consecutive blocks) produce amber warnings instead of hard failures. They indicate a suboptimal but valid schedule.',
    category: 'scheduling',
  },
  {
    q: 'What is a minor subject, and how is it handled?',
    a: 'A minor subject is a course owned by another department (e.g., Math, GenEd). Manually plot them like any subject — auto-generate automatically treats the plotted blocks as obstacles.',
    category: 'scheduling',
  },
  {
    q: 'How do I import a prospectus PDF?',
    a: 'Open Import Prospectus, upload the PDF, then draw a rectangle over each Year + Semester table and add row/column slices. The parser extracts text inside each row box.',
    category: 'import',
  },
  {
    q: 'What if a section is already referenced by a schedule?',
    a: 'Deleting it is blocked by the backend. Deactivate it instead — it will not appear in new plotting forms.',
    category: 'workflow',
  },
  {
    q: 'What is the flag system for?',
    a: 'It lets any user flag a schedule entry for cross-department review without editing it. The owning department head, the flagger, a Dean, or a dev admin can clear the flag.',
    category: 'workflow',
  },
  {
    q: 'How are notifications delivered?',
    a: 'Real-time over WebSocket. The bell shows unread counts; the inbox supports filters, search, and read/unread state. Retention defaults to 90 days.',
    category: 'technical',
  },
  {
    q: 'Where is the audit trail?',
    a: 'The audit trail captures every mutation with user, timestamp, action, affected data, and source system.',
    category: 'technical',
  },
];