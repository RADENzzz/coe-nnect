import type {
  ScheduleVersionEntry,
  VersionCompareResult,
} from '../../../api/schedule.api.ts';
import { getScheduleDeptId } from '../../../api/schedule-ownership.ts';
import type { ScheduleEntry } from '../types.ts';
import { colorForSubject } from './color.util.ts';
import { DAY_MAP } from './time.util.ts';

/** Visual treatment of a block in the side-by-side version compare grids. */
export type CompareDiffTone = 'added' | 'removed' | 'changed' | 'unchanged';

/**
 * Stable identity for a snapshot row. Live rows keep their schedule id;
 * snapshots without one fall back to the offering/session identity so the
 * same session can be paired across versions and given a diff tone.
 */
export function versionEntryKey(raw: ScheduleVersionEntry): string {
  if (typeof raw.schedule_id === 'string' && raw.schedule_id.trim() !== '') {
    return raw.schedule_id;
  }
  const sessionIndex = Number.isInteger(raw.session_index)
    ? raw.session_index
    : 0;
  return `snapshot-${raw.subject_id}-${raw.section_id ?? ''}-${raw.load_type ?? ''}-${sessionIndex}`;
}

/** Convert a backend snapshot row into the grid's read-only entry shape. */
export function versionEntryToEntry(
  raw: ScheduleVersionEntry,
  versionContext?: { versionId: string; versionNumber: number },
): ScheduleEntry {
  const day = raw.day_of_week ?? 'Monday';
  const start = raw.start_time ?? '07:00:00';
  const end = raw.end_time ?? '08:00:00';
  const isLab = raw.load_type === 'laboratory';
  const externalName = raw.external_faculty_name ?? null;
  const externalRoom = raw.external_room_name ?? null;
  const hasSystemFaculty = !!raw.faculty_id;

  return {
    id: versionEntryKey(raw),
    subjectId: raw.subject_id,
    subjectCode: raw.subject_code ?? '—',
    subjectTitle: raw.subject_title ?? '',
    sectionId: raw.section_id ?? '',
    pendingFacultyRequestId: null,
    pendingFacultyDeptId: null,
    sectionCode: raw.section_code ?? '',
    facultyId: raw.faculty_id ?? '',
    facultyName: hasSystemFaculty
      ? raw.faculty_name ?? 'VL'
      : externalName ?? raw.faculty_name ?? 'VL',
    externalFacultyName: externalName,
    roomId: raw.room_id ?? '',
    roomNumber: raw.room_number ?? '—',
    externalRoomName: externalRoom,
    building: raw.building ?? '',
    day: DAY_MAP[day] ?? 'MON',
    startTime: start.slice(0, 5),
    endTime: end.slice(0, 5),
    loadType: isLab ? 'laboratory' : 'lecture',
    deptId: getScheduleDeptId(raw),
    deptColor: '#800000',
    color: colorForSubject(raw.subject_id),
    status: (raw.status as ScheduleEntry['status']) ?? 'finalized',
    remarks: raw.remarks ?? null,
    versionContext,
  };
}

/**
 * Map diff tones onto the ids produced by `versionEntryToEntry`, separately
 * for the Before and After grids. Unchanged rows get no tone so they keep the
 * neutral grid styling.
 */
export function buildCompareToneMaps(result: VersionCompareResult): {
  before: Map<string, CompareDiffTone>;
  after: Map<string, CompareDiffTone>;
} {
  const before = new Map<string, CompareDiffTone>();
  const after = new Map<string, CompareDiffTone>();

  for (const raw of result.removed ?? []) {
    before.set(versionEntryKey(raw), 'removed');
  }
  for (const raw of result.added ?? []) {
    after.set(versionEntryKey(raw), 'added');
  }
  for (const pair of result.moved ?? []) {
    before.set(versionEntryKey(pair.before), 'changed');
    after.set(versionEntryKey(pair.after), 'changed');
  }

  return { before, after };
}
