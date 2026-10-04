import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import TimetableGrid from './components/TimetableGrid';
import type { ScheduleEntry, Day, LoadType } from './types';
import {
  fetchSchedules,
  fetchActiveTerm,
  updateSchedule,
  type RawSchedule,
} from '../../api/schedule.api';
import { fetchSubjects } from '../../api/subjects.api';
import { fetchFaculty } from '../../api/faculty.api';
import { fetchRooms } from '../../api/rooms.api';
import { useAuthStore } from '../../store/auth.store';
import { timeToMinutes, minutesToTime } from './utils/time.util';
import LoadingState from '../../components/feedback/LoadingState';
import ErrorState from '../../components/feedback/ErrorState';
import EmptyState from '../../components/feedback/EmptyState';
import Icon from '../../components/ui/Icon';
import PlotSubjectModal from '../plot-subject/PlotSubjectModal';
import ScheduleDetailDrawer from './components/ScheduleDetailDrawer';

const DAY_MAP: Record<string, Day> = {
  Monday: 'MON',
  Tuesday: 'TUE',
  Wednesday: 'WED',
  Thursday: 'THU',
  Friday: 'FRI',
  Saturday: 'SAT',
  Sunday: 'SUN',
};

const DAY_MAP_REVERSE: Record<Day, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

function toEntry(raw: RawSchedule): ScheduleEntry {
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
    status: raw.status,
    remarks: raw.remarks,
    loadType: (raw.loadType ?? 'lecture') as LoadType,
    deptId: '',
    deptColor: '#800000',
  };
}

export default function TimetablePage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [plotOpen, setPlotOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);

  // ── Fetch active term ──
  const {
    data: activeTerm,
    isLoading: termLoading,
    error: termError,
  } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
    enabled: !!user,
  });

  // ── Fetch schedules ──
  const {
    data: schedules,
    isLoading: schedulesLoading,
    error: schedulesError,
  } = useQuery({
    queryKey: ['schedules', activeTerm?.termId],
    queryFn: () => fetchSchedules(activeTerm?.termId),
    enabled: !!user && !!activeTerm,
  });

  // ── Fetch dropdown data ──
  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: fetchSubjects,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: faculty = [] } = useQuery({
    queryKey: ['faculty'],
    queryFn: fetchFaculty,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms'],
    queryFn: fetchRooms,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const entries = useMemo(
    () => (schedules ?? []).map(toEntry),
    [schedules],
  );

  // ── Move mutation ──
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
      alert(
        err?.response?.data?.message ??
          err?.message ??
          'Failed to move schedule entry',
      );
    },
  });

  const handleMove = useCallback(
    (entryId: string, newDay: string, newStartTime: string) => {
      const existing = entries.find((e) => e.id === entryId);
      if (!existing) return;

      const startMin = timeToMinutes(newStartTime);
      const duration =
        timeToMinutes(existing.endTime) - timeToMinutes(existing.startTime);
      const newEnd = minutesToTime(startMin + duration);

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

      moveMutation.mutate({
        id: entryId,
        dayOfWeek: DAY_MAP_REVERSE[newDay as Day] ?? 'Monday',
        startTime: newStartTime,
        endTime: newEnd,
      });
    },
    [entries, moveMutation, queryClient, activeTerm?.termId],
  );

  const handleClick = useCallback((entry: ScheduleEntry) => {
    setSelectedEntry(entry);
  }, []);

  const handleEdit = useCallback((entry: ScheduleEntry) => {
    // TODO: open PlotSubjectModal in "edit mode" (Option A1.1 — future)
    console.log('TODO: open edit form for', entry);
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

        <div className="flex items-center gap-3">
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

          {activeTerm && (
            <button
              onClick={() => setPlotOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:bg-tertiary transition"
            >
              <Icon name="add" size={16} />
              Plot Subject
            </button>
          )}
        </div>
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
          description='Click "Plot Subject" to add your first class.'
        />
      )}
      {!isLoading && !error && activeTerm && entries.length > 0 && (
        <TimetableGrid
          entries={entries}
          onEntryMove={handleMove}
          onEntryClick={handleClick}
        />
      )}

      {/* Plot Subject Modal */}
      {activeTerm && (
        <PlotSubjectModal
          open={plotOpen}
          onClose={() => setPlotOpen(false)}
          termId={activeTerm.termId}
          subjects={subjects.map((s) => ({
            subjectId: s.subjectId,
            subjectCode: s.subjectCode,
            title: s.title,
          }))}
          faculty={faculty.map((f) => ({
            facultyId: f.facultyId,
            firstName: f.firstName,
            lastName: f.lastName,
            deptId: f.deptId,
          }))}
          rooms={rooms.map((r) => ({
            roomId: r.roomId,
            roomNumber: r.roomNumber,
            roomType: r.roomType,
          }))}
        />
      )}

      {/* Detail Drawer */}
      {activeTerm && (
        <ScheduleDetailDrawer
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onEdit={handleEdit}
          termId={activeTerm.termId}
        />
      )}
    </div>
  );
}