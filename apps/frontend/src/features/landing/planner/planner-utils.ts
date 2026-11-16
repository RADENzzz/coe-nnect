import type { PublicScheduleEntry } from '@/api/public.api';

import {
  DAY_ORDER,
  formatTimeRange,
  minutesToTime,
  scheduleFaculty,
  scheduleRoom,
  timeToMinutes,
  WEEK_DAYS,
} from '../schedule-utils';
import type {
  PlannerConflict,
  PlannerEntry,
  PlannerPlans,
} from './types';

export const PLANNER_STORAGE_KEY = 'coe-nnect:student-planner:v1';

/** Dark, saturated colors that keep white block text readable. */
export const PLANNER_COLORS = [
  '#b91c1c',
  '#c2410c',
  '#a16207',
  '#15803d',
  '#0f766e',
  '#0369a1',
  '#1d4ed8',
  '#6d28d9',
  '#a21caf',
  '#be185d',
  '#4d7c0f',
  '#475569',
] as const;

export const PLANNER_DEFAULT_START_MINUTES = 7 * 60;
export const PLANNER_DEFAULT_END_MINUTES = 19 * 60;

export interface PlannerLaneInfo {
  lane: number;
  laneCount: number;
}

export interface PlannerSubjectLoad {
  key: string;
  subjectCode: string;
  subjectTitle: string;
  sectionCode: string;
  units: number | null;
  minutes: number;
  meetings: number;
}

export function createPlannerId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `planner-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/** Stable color per subject/section so the same class keeps its identity. */
export function plannerColorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PLANNER_COLORS[hash % PLANNER_COLORS.length];
}

export function blankPlannerEntry(): PlannerEntry {
  return {
    id: createPlannerId(),
    source: 'personal',
    scheduleId: null,
    subjectCode: '',
    subjectTitle: '',
    units: null,
    sectionCode: '',
    facultyName: '',
    room: '',
    building: '',
    dayOfWeek: 'Monday',
    startTime: '08:00',
    endTime: '09:00',
    loadType: 'lecture',
    color: plannerColorFor('personal'),
  };
}

export function plannerEntryFromSchedule(
  entry: PublicScheduleEntry,
  id: string = createPlannerId(),
): PlannerEntry {
  const subjectCode = entry.subjectCode ?? '—';
  const sectionCode = entry.sectionCode ?? '';
  return {
    id,
    source: 'published',
    scheduleId: entry.scheduleId,
    subjectCode,
    subjectTitle: entry.subjectTitle ?? 'Untitled subject',
    units: entry.units,
    sectionCode,
    facultyName: scheduleFaculty(entry),
    room: scheduleRoom(entry),
    building: entry.building ?? '',
    dayOfWeek: entry.dayOfWeek,
    startTime: entry.startTime,
    endTime: entry.endTime,
    loadType: entry.loadType,
    color: plannerColorFor(`${subjectCode}|${sectionCode}`),
  };
}

/**
 * Show every weekday plus Saturday. Sunday only appears when the plan actually
 * uses it, which keeps the common layout familiar.
 */
export function plannerDayColumns(entries: PlannerEntry[]): string[] {
  const days: string[] = [...WEEK_DAYS];
  if (entries.some((entry) => entry.dayOfWeek === 'Sunday')) {
    days.push('Sunday');
  }
  return days;
}

/** Expand the visible day range to include every planned block. */
export function plannerTimeRange(entries: PlannerEntry[]): {
  startMinutes: number;
  endMinutes: number;
} {
  let start = PLANNER_DEFAULT_START_MINUTES;
  let end = PLANNER_DEFAULT_END_MINUTES;

  for (const entry of entries) {
    const entryStart = timeToMinutes(entry.startTime);
    const entryEnd = timeToMinutes(entry.endTime);
    if (!Number.isFinite(entryStart) || !Number.isFinite(entryEnd)) continue;
    start = Math.min(start, Math.floor(entryStart / 60) * 60);
    end = Math.max(end, Math.ceil(entryEnd / 60) * 60);
  }

  start = Math.max(0, start);
  end = Math.min(24 * 60, end);
  if (end <= start) end = start + 60;

  return { startMinutes: start, endMinutes: end };
}

/**
 * Assign overlapping blocks to side-by-side lanes.
 *
 * The algorithm mirrors the timetable and PDF grids: place each block in the
 * first lane whose last block ends before this one starts, then divide the
 * column by the number of blocks that overlap at any point.
 */
export function computePlannerLanes(
  entries: PlannerEntry[],
): Map<string, PlannerLaneInfo> {
  const result = new Map<string, PlannerLaneInfo>();
  const byDay = new Map<string, PlannerEntry[]>();

  for (const entry of entries) {
    const dayEntries = byDay.get(entry.dayOfWeek);
    if (dayEntries) dayEntries.push(entry);
    else byDay.set(entry.dayOfWeek, [entry]);
  }

  for (const dayEntries of byDay.values()) {
    const sorted = [...dayEntries].sort((a, b) => {
      const aStart = timeToMinutes(a.startTime);
      const bStart = timeToMinutes(b.startTime);
      if (aStart !== bStart) return aStart - bStart;
      const aDuration = timeToMinutes(a.endTime) - aStart;
      const bDuration = timeToMinutes(b.endTime) - bStart;
      return bDuration - aDuration;
    });

    const lanes: PlannerEntry[][] = [];
    const laneOf = new Map<string, number>();

    for (const entry of sorted) {
      const start = timeToMinutes(entry.startTime);
      let placed = false;
      for (let i = 0; i < lanes.length; i++) {
        const last = lanes[i][lanes[i].length - 1];
        if (timeToMinutes(last.endTime) <= start) {
          lanes[i].push(entry);
          laneOf.set(entry.id, i);
          placed = true;
          break;
        }
      }
      if (!placed) {
        lanes.push([entry]);
        laneOf.set(entry.id, lanes.length - 1);
      }
    }

    for (const entry of sorted) {
      const start = timeToMinutes(entry.startTime);
      const end = timeToMinutes(entry.endTime);
      let overlapCount = 0;
      for (const other of sorted) {
        const otherStart = timeToMinutes(other.startTime);
        const otherEnd = timeToMinutes(other.endTime);
        if (otherStart < end && start < otherEnd) overlapCount++;
      }
      const lane = laneOf.get(entry.id) ?? 0;
      result.set(entry.id, {
        lane,
        laneCount: Math.max(overlapCount, lane + 1, 1),
      });
    }
  }

  return result;
}

/** Every pair of blocks that overlap on the same day. */
export function findPlannerConflicts(
  entries: PlannerEntry[],
): PlannerConflict[] {
  const sorted = [...entries].sort((a, b) => {
    const dayDiff =
      (DAY_ORDER[a.dayOfWeek] ?? 99) - (DAY_ORDER[b.dayOfWeek] ?? 99);
    if (dayDiff !== 0) return dayDiff;
    return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
  });

  const conflicts: PlannerConflict[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const first = sorted[i];
    const firstStart = timeToMinutes(first.startTime);
    const firstEnd = timeToMinutes(first.endTime);
    if (!Number.isFinite(firstStart) || !Number.isFinite(firstEnd)) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      const second = sorted[j];
      if (second.dayOfWeek !== first.dayOfWeek) continue;
      const secondStart = timeToMinutes(second.startTime);
      const secondEnd = timeToMinutes(second.endTime);
      if (!Number.isFinite(secondStart) || !Number.isFinite(secondEnd)) {
        continue;
      }
      if (secondStart >= firstEnd) break;
      if (firstStart < secondEnd) {
        conflicts.push({ first, second });
      }
    }
  }

  return conflicts;
}

export function plannerConflictLabel(conflict: PlannerConflict): string {
  const { first, second } = conflict;
  const start = Math.max(
    timeToMinutes(first.startTime),
    timeToMinutes(second.startTime),
  );
  const end = Math.min(
    timeToMinutes(first.endTime),
    timeToMinutes(second.endTime),
  );
  const name = (entry: PlannerEntry) =>
    `${entry.subjectCode}${entry.sectionCode ? ` (${entry.sectionCode})` : ''}`;

  return `${first.dayOfWeek} · ${formatTimeRange(
    minutesToTime(start),
    minutesToTime(end),
  )} · ${name(first)} overlaps ${name(second)}`;
}

/**
 * Group the plan by subject and section so units are counted once even when a
 * subject has separate lecture and laboratory meetings.
 */
export function plannerSubjectLoad(
  entries: PlannerEntry[],
): PlannerSubjectLoad[] {
  const subjects = new Map<string, PlannerSubjectLoad>();

  for (const entry of entries) {
    const key = `${entry.subjectCode}|${entry.sectionCode}`;
    const start = timeToMinutes(entry.startTime);
    const end = timeToMinutes(entry.endTime);
    const duration =
      Number.isFinite(start) && Number.isFinite(end)
        ? Math.max(0, end - start)
        : 0;

    const current = subjects.get(key);
    if (current) {
      current.minutes += duration;
      current.meetings += 1;
      if (entry.units != null) {
        current.units =
          current.units == null
            ? entry.units
            : Math.max(current.units, entry.units);
      }
    } else {
      subjects.set(key, {
        key,
        subjectCode: entry.subjectCode,
        subjectTitle: entry.subjectTitle,
        sectionCode: entry.sectionCode,
        units: entry.units,
        minutes: duration,
        meetings: 1,
      });
    }
  }

  return Array.from(subjects.values()).sort((a, b) =>
    a.subjectCode.localeCompare(b.subjectCode),
  );
}

export function plannerTotalUnits(entries: PlannerEntry[]): number {
  return plannerSubjectLoad(entries).reduce(
    (total, subject) => total + (subject.units ?? 0),
    0,
  );
}

/** Compact units label used by the planner and the PDF legend. */
export function plannerUnitsLabel(units: number | null): string {
  if (units == null) return '—';
  return `${Math.round(units * 10) / 10}u`;
}

function isPlannerEntry(value: unknown): value is PlannerEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    (entry.source === 'published' || entry.source === 'personal') &&
    (typeof entry.scheduleId === 'string' || entry.scheduleId === null) &&
    typeof entry.subjectCode === 'string' &&
    typeof entry.subjectTitle === 'string' &&
    typeof entry.sectionCode === 'string' &&
    typeof entry.facultyName === 'string' &&
    typeof entry.room === 'string' &&
    typeof entry.building === 'string' &&
    typeof entry.dayOfWeek === 'string' &&
    typeof entry.startTime === 'string' &&
    typeof entry.endTime === 'string' &&
    (typeof entry.loadType === 'string' || entry.loadType === null) &&
    typeof entry.color === 'string'
  );
}

export function readPlannerPlans(): PlannerPlans {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PLANNER_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const plans: PlannerPlans = {};
    for (const [termId, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (!Array.isArray(value)) continue;
      const entries = value.filter(isPlannerEntry).map((entry) => ({
        ...entry,
        units:
          typeof entry.units === 'number' &&
          Number.isFinite(entry.units)
            ? entry.units
            : null,
      }));
      if (entries.length > 0) plans[termId] = entries;
    }
    return plans;
  } catch {
    return {};
  }
}

export function writePlannerPlans(plans: PlannerPlans): void {
  if (typeof window === 'undefined') return;
  try {
    const compact: PlannerPlans = {};
    for (const [termId, entries] of Object.entries(plans)) {
      if (entries.length > 0) compact[termId] = entries;
    }
    window.localStorage.setItem(
      PLANNER_STORAGE_KEY,
      JSON.stringify(compact),
    );
  } catch {
    // A full or blocked localStorage should not break the planner; the plan
    // simply stays in memory for this visit.
  }
}
