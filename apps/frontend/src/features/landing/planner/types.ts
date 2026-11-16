/**
 * A single block in a student's personal weekly plan.
 *
 * Published entries are copied into the plan, so editing one only changes the
 * student's local copy. `scheduleId` keeps a link back to the published row so
 * the planner can show what is already added and offer a reset action.
 */
export type PlannerEntrySource = 'published' | 'personal';

export interface PlannerEntry {
  id: string;
  source: PlannerEntrySource;
  scheduleId: string | null;
  subjectCode: string;
  subjectTitle: string;
  units: number | null;
  sectionCode: string;
  facultyName: string;
  room: string;
  building: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  loadType: string | null;
  color: string;
}

/** Plans are keyed by term id and persisted in localStorage. */
export type PlannerPlans = Record<string, PlannerEntry[]>;

export interface PlannerConflict {
  first: PlannerEntry;
  second: PlannerEntry;
}
