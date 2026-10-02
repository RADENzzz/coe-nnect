import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import TimetableGrid from './components/TimetableGrid';
import type { ScheduleEntry, Day, LoadType } from './types';
import {
  fetchSchedules,
  fetchActiveTerm,
  type RawSchedule,
} from '../../api/schedule.api';
import { useAuthStore } from '../../store/auth.store';
import { timeToMinutes, minutesToTime } from './utils/time.util';
import LoadingState from '../../components/feedback/LoadingState';
import ErrorState from '../../components/feedback/ErrorState';
import EmptyState from '../../components/feedback/EmptyState';

const DAY_MAP: Record<string, Day> = {
  Monday: 'MON',
  Tuesday: 'TUE',
  Wednesday: 'WED',
  Thursday: 'THU',
  Friday: 'FRI',
  Saturday: 'SAT',
  Sunday: 'MON',
};

function toEntry(raw: RawSchedule): ScheduleEntry {
  // Prefer schedule-level times over timeslot
  const day = raw.dayOfWeek ?? raw.timeSlot?.dayOfWeek ?? 'Monday';
  const start = raw.startTime ?? raw.timeSlot?.startTime ?? '07:00:00';
  const end = raw.endTime ?? raw.timeSlot?.endTime ?? '08:00:00';

  return {
    id: raw.scheduleId,
    subjectId: raw.subjectId,
    subjectCode: raw.subject?.subjectCode ?? '—',
    subjectTitle: raw.subject?.title ?? '',
    sectionId: raw.section ?? '',
    sectionCode: raw.section ?? '',
    facultyId: raw.facultyId ?? '',
    facultyName: raw.faculty
      ? `${raw.faculty.firstName} ${raw.faculty.lastName}`
      : '—',
    roomId: raw.roomId ?? '',
    roomNumber: raw.room?.roomNumber ?? '—',
    day: DAY_MAP[day] ?? 'MON',
    startTime: start.slice(0, 5),
    endTime: end.slice(0, 5),
    loadType: (raw.loadType ?? 'lecture') as LoadType,
    deptId: '',
    deptColor: '#800000',
  };
}

export default function TimetablePage() {
  const user = useAuthStore((s) => s.user);

  // Local state for pending moves — applied immediately on drop
  const [pendingMoves, setPendingMoves] = useState<
    Record<string, { day: Day; startTime: string; endTime: string }>
  >({});

  const {
    data: activeTerm,
    isLoading: termLoading,
    error: termError,
  } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
    enabled: !!user,
  });

  const {
    data: schedules,
    isLoading: schedulesLoading,
    error: schedulesError,
  } = useQuery({
    queryKey: ['schedules', activeTerm?.termId],
    queryFn: () => fetchSchedules(activeTerm?.termId),
    enabled: !!user && !!activeTerm,
  });

  const entries = useMemo(() => {
    return (schedules ?? []).map((raw) => {
      const base = toEntry(raw);
      const override = pendingMoves[base.id];
      return override ? { ...base, ...override } : base;
    });
  }, [schedules, pendingMoves]);

  const handleMove = useCallback(
    (entryId: string, newDay: string, newStartTime: string) => {
      setPendingMoves((prev) => {
        const existing = entries.find((e) => e.id === entryId);
        if (!existing) return prev;

        const startMin = timeToMinutes(newStartTime);
        const duration =
          timeToMinutes(existing.endTime) - timeToMinutes(existing.startTime);
        const newEnd = minutesToTime(startMin + duration);

        return {
          ...prev,
          [entryId]: {
            day: newDay as Day,
            startTime: newStartTime,
            endTime: newEnd,
          },
        };
      });
    },
    [entries],
  );

  const handleClick = useCallback((entry: ScheduleEntry) => {
    console.log('Clicked schedule entry:', entry);
    // TODO: open detail drawer
  }, []);

  const isLoading = termLoading || schedulesLoading;
  const error = termError || schedulesError;

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary">Timetable</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {activeTerm
              ? `${activeTerm.termName} — AY ${activeTerm.schoolYear}`
              : 'Loading term...'}
          </p>
        </div>
        {activeTerm && !isLoading && !error && (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-base">
              calendar_view_month
            </span>
            {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
          </div>
        )}
      </div>

      {/* States */}
      {isLoading && <LoadingState message="Loading schedule…" />}
      {error && (
        <ErrorState
          message={`Failed to load schedule: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`}
        />
      )}
      {!isLoading && !error && !activeTerm && (
        <EmptyState
          title="No active term"
          description="An administrator needs to activate a term before schedules can be displayed."
        />
      )}
      {!isLoading && !error && activeTerm && entries.length === 0 && (
        <EmptyState
          title="No schedule entries yet"
          description="Plot a subject to get started."
        />
      )}
      {!isLoading && !error && activeTerm && entries.length > 0 && (
        <TimetableGrid
          entries={entries}
          onEntryMove={handleMove}
          onEntryClick={handleClick}
        />
      )}
    </div>
  );
}