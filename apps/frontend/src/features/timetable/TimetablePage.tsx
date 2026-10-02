import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import TimetableGrid from './components/TimetableGrid';
import type { ScheduleEntry, Day, LoadType } from './types';
import {
  fetchSchedules,
  fetchActiveTerm,
  updateSchedule,
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

const DAY_MAP_REVERSE: Record<Day, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
};

function toEntry(raw: RawSchedule): ScheduleEntry {
  // Prefer schedule-level day/time over timeslot
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
  const queryClient = useQueryClient();

  // ── 1. Fetch the active term ──
  const {
    data: activeTerm,
    isLoading: termLoading,
    error: termError,
  } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
    enabled: !!user,
  });

  // ── 2. Fetch schedule entries for that term ──
  const {
    data: schedules,
    isLoading: schedulesLoading,
    error: schedulesError,
  } = useQuery({
    queryKey: ['schedules', activeTerm?.termId],
    queryFn: () => fetchSchedules(activeTerm?.termId),
    enabled: !!user && !!activeTerm,
  });

  // ── 3. Convert to grid entries ──
  const entries = useMemo(
    () => (schedules ?? []).map(toEntry),
    [schedules],
  );

  // ── 4. Move mutation ──
  const moveMutation = useMutation({
    mutationFn: (args: {
      id: string;
      dayOfWeek: string;
      startTime: string;
      endTime: string;
    }) =>
      updateSchedule(args.id, {
        dayOfWeek: args.dayOfWeek,
        startTime: args.startTime,
        endTime: args.endTime,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['schedules', activeTerm?.termId],
      });
    },
    onError: (err: any) => {
      console.error('[Move] Failed:', err);
      // TODO: show toast notification
      alert(
        err?.response?.data?.message ??
          err?.message ??
          'Failed to move schedule entry',
      );
    },
  });

  // ── 5. Drag handler ──
  const handleMove = useCallback(
    (entryId: string, newDay: string, newStartTime: string) => {
      const existing = entries.find((e) => e.id === entryId);
      if (!existing) return;

      const startMin = timeToMinutes(newStartTime);
      const duration =
        timeToMinutes(existing.endTime) - timeToMinutes(existing.startTime);
      const newEnd = minutesToTime(startMin + duration);

      // Optimistic update: apply locally first
      queryClient.setQueryData<RawSchedule[]>(
        ['schedules', activeTerm?.termId],
        (old) => {
          if (!old) return old;
          return old.map((raw) => {
            if (raw.scheduleId !== entryId) return raw;
            return {
              ...raw,
              dayOfWeek: DAY_MAP_REVERSE[newDay as Day] ?? raw.dayOfWeek,
              startTime: `${newStartTime}:00`,
              endTime: `${newEnd}:00`,
            };
          });
        },
      );

      // Persist to backend
      moveMutation.mutate({
        id: entryId,
        dayOfWeek: DAY_MAP_REVERSE[newDay as Day] ?? 'Monday',
        startTime: newStartTime,
        endTime: newEnd,
      });
    },
    [entries, moveMutation, queryClient, activeTerm?.termId],
  );

  // ── 6. Click handler (detail drawer later) ──
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
            {moveMutation.isPending && (
              <span className="ml-2 text-primary font-medium animate-pulse">
                Saving…
              </span>
            )}
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