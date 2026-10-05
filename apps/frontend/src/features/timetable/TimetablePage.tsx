import { useCallback, useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import TimetableGrid from './components/TimetableGrid';
import type { ScheduleEntry, Day, LoadType } from './types';
import {
  fetchSchedules,
  fetchActiveTerm,
  updateSchedule,
  validatePlot,
  type RawSchedule,
  type ValidateResult,
} from '../../api/schedule.api';
import { fetchSubjects } from '../../api/subjects.api';
import { fetchFaculty } from '../../api/faculty.api';
import { fetchRooms } from '../../api/rooms.api';
import { fetchSections } from '../../api/sections.api';
import { fetchDepartments } from '../../api/departments.api';
import { useAuthStore } from '../../store/auth.store';
import { timeToMinutes, minutesToTime } from './utils/time.util';
import LoadingState from '../../components/feedback/LoadingState';
import ErrorState from '../../components/feedback/ErrorState';
import EmptyState from '../../components/feedback/EmptyState';
import Icon from '../../components/ui/Icon';
import PlotSubjectModal from '../plot-subject/PlotSubjectModal';
import ScheduleDetailDrawer from './components/ScheduleDetailDrawer';
import { colorForSubject } from './utils/color.util';
import StackPicker from './components/StackPicker';
import ExportToolbar from './export/ExportToolbar';

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
      : 'VL',
    roomId: raw.roomId ?? '',
    roomNumber: raw.room?.roomNumber ?? '—',
    building: raw.room?.building ?? '',
    day: DAY_MAP[day] ?? 'MON',
    startTime: start.slice(0, 5),
    endTime: end.slice(0, 5),
    status: raw.status,
    remarks: raw.remarks,
    loadType: (raw.loadType ?? 'lecture') as LoadType,
    deptId: raw.subject?.deptId ?? '',
    deptColor: '#800000',
    color: colorForSubject(raw.subjectId),
  };
}

type ViewMode = 'master' | 'department' | 'room' | 'faculty' | 'section';

export default function TimetablePage() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [plotOpen, setPlotOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [stackOpen, setStackOpen] = useState<ScheduleEntry[] | null>(null);

  // ── View mode ──
  // Default: Master for everyone, but DHs default to their own department.
  const isDepartmentHead = profile?.role === 'department_head';
  const myDeptId = profile?.dept_id ? String(profile.dept_id) : '';

  const [viewMode, setViewMode] = useState<ViewMode>('master');
  const [viewTargetId, setViewTargetId] = useState('');

  // Once the profile loads, if this is a DH with a dept, jump to their dept view.
  // Runs once — subsequent manual changes aren't overridden.
  const [defaultedToDept, setDefaultedToDept] = useState(false);
  useEffect(() => {
    if (defaultedToDept) return;
    if (!profile) return;
    if (isDepartmentHead && myDeptId) {
      setViewMode('department');
      setViewTargetId(myDeptId);
    }
    setDefaultedToDept(true);
  }, [profile, isDepartmentHead, myDeptId, defaultedToDept]);

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
    queryFn: () => fetchSubjects(false),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: faculty = [] } = useQuery({
    queryKey: ['faculty'],
    queryFn: () => fetchFaculty(false),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => fetchRooms(false),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: fetchSections,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const allEntries = useMemo(
    () => (schedules ?? []).map(toEntry),
    [schedules],
  );

  // ── Apply filter ──
  const entries = useMemo(() => {
    if (viewMode === 'master' || !viewTargetId) return allEntries;
    return allEntries.filter((e) => {
      if (viewMode === 'department') return e.deptId === viewTargetId;
      if (viewMode === 'room') return e.roomId === viewTargetId;
      if (viewMode === 'faculty') return e.facultyId === viewTargetId;
      if (viewMode === 'section') return e.sectionCode === viewTargetId;
      return true;
    });
  }, [allEntries, viewMode, viewTargetId]);

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
    async (entryId: string, newDay: string, newStartTime: string) => {
      const existing = allEntries.find((e) => e.id === entryId);
      if (!existing || !activeTerm) return;

      const startMin = timeToMinutes(newStartTime);
      const duration =
        timeToMinutes(existing.endTime) - timeToMinutes(existing.startTime);
      const newEnd = minutesToTime(startMin + duration);
      const newDayOfWeek = DAY_MAP_REVERSE[newDay as Day] ?? 'Monday';

      let validation: ValidateResult;
      try {
        validation = await validatePlot({
          termId: activeTerm.termId,
          subjectId: existing.subjectId,
          facultyId: existing.facultyId || undefined,
          roomId: existing.roomId || undefined,
          section: existing.sectionCode || undefined,
          dayOfWeek: newDayOfWeek,
          startTime: newStartTime,
          endTime: newEnd,
          loadType: existing.loadType,
          excludeId: entryId,
        });
      } catch (err) {
        console.error('[Move] validate failed:', err);
        alert('Failed to validate the move.');
        return;
      }

      if (validation.hardConflicts.length > 0) {
        const lines = validation.hardConflicts
          .map((c) => `• ${c.ruleId}: ${c.reason}`)
          .join('\n');
        alert(`Move rejected:\n\n${lines}`);
        return;
      }

      if (validation.softWarnings.length > 0) {
        const lines = validation.softWarnings
          .map((w) => `• ${w.ruleId}: ${w.reason}`)
          .join('\n');
        if (!window.confirm(`Move has warnings:\n\n${lines}\n\nProceed?`)) {
          return;
        }
      }

      queryClient.setQueryData<RawSchedule[]>(
        ['schedules', activeTerm.termId],
        (old) => {
          if (!old) return old;
          return old.map((raw) => {
            if (raw.scheduleId !== entryId) return raw;
            return {
              ...raw,
              dayOfWeek: newDayOfWeek,
              startTime: `${newStartTime}:00`,
              endTime: `${newEnd}:00`,
            };
          });
        },
      );

      moveMutation.mutate({
        id: entryId,
        dayOfWeek: newDayOfWeek,
        startTime: newStartTime,
        endTime: newEnd,
      });
    },
    [allEntries, moveMutation, queryClient, activeTerm?.termId],
  );

  const handleClick = useCallback(
    (entry: ScheduleEntry) => {
      const sameSlot = entries.filter(
        (e) => e.day === entry.day && e.startTime === entry.startTime,
      );
      if (sameSlot.length > 1) {
        setStackOpen(sameSlot);
      } else {
        setSelectedEntry(entry);
      }
    },
    [entries],
  );

  const handleEdit = useCallback((entry: ScheduleEntry) => {
    // TODO: open edit form
    console.log('TODO: open edit form for', entry);
  }, []);

  const handlePickFromStack = useCallback((entry: ScheduleEntry) => {
    setStackOpen(null);
    setSelectedEntry(entry);
  }, []);

  const isLoading = termLoading || schedulesLoading;
  const error = termError || schedulesError;

  // ── View target options depend on mode ──
  const viewOptions = useMemo(() => {
    if (viewMode === 'department') {
      return departments
        .filter((d) => d.isActive)
        .map((d) => ({
          value: String(d.deptId),
          label: `[${d.deptCode}] ${d.deptName}`,
        }));
    }
    if (viewMode === 'room') {
      return rooms
        .filter((r) => r.isActive)
        .map((r) => ({
          value: r.roomId,
          label: `Room ${r.roomNumber} (${r.building})`,
        }));
    }
    if (viewMode === 'faculty') {
      return faculty
        .filter((f) => f.isActive)
        .map((f) => ({
          value: f.facultyId,
          label: `${f.lastName}, ${f.firstName}`,
        }));
    }
    if (viewMode === 'section') {
      return sections
        .filter((s) => s.isActive)
        .map((s) => ({
          value: s.sectionCode,
          label: s.sectionCode,
        }));
    }
    return [];
  }, [viewMode, departments, rooms, faculty, sections]);

  const viewModeLabel: Record<ViewMode, string> = {
    master: 'Master View',
    department: 'By Department',
    room: 'By Room',
    faculty: 'By Faculty',
    section: 'By Section',
  };

  // Label for the target selector dropdown
  const targetLabel =
    viewMode === 'department'
      ? 'Department'
      : viewMode === 'room'
      ? 'Room'
      : viewMode === 'faculty'
      ? 'Faculty'
      : viewMode === 'section'
      ? 'Section'
      : '';

    // ── Export scope metadata ──
  const exportScope = useMemo(() => {
    const termSlug = activeTerm
      ? `${activeTerm.termName}-AY${activeTerm.schoolYear}`
          .replace(/\s+/g, '-')
          .replace(/[^a-zA-Z0-9-]+/g, '')
      : 'term';

    const dateSlug = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    if (viewMode === 'master' || !viewTargetId) {
      return {
        scopeLabel: 'Master View',
        filename: `CoE-NNECT_master_${termSlug}_${dateSlug}`,
      };
    }

    if (viewMode === 'department') {
      const d = departments.find(
        (x) => String(x.deptId) === String(viewTargetId),
      );
      const label = d ? `${d.deptCode} ${d.deptName}` : 'Department';
      return {
        scopeLabel: label,
        filename: `CoE-NNECT_dept-${d?.deptCode ?? viewTargetId}_${termSlug}_${dateSlug}`,
      };
    }

    if (viewMode === 'room') {
      const r = rooms.find((x) => String(x.roomId) === String(viewTargetId));
      const label = r ? `Room ${r.roomNumber} (${r.building})` : 'Room';
      return {
        scopeLabel: label,
        filename: `CoE-NNECT_room-${r?.roomNumber ?? viewTargetId}_${termSlug}_${dateSlug}`,
      };
    }

    if (viewMode === 'faculty') {
      const f = faculty.find(
        (x) => String(x.facultyId) === String(viewTargetId),
      );
      const label = f ? `${f.lastName}, ${f.firstName}` : 'Faculty';
      return {
        scopeLabel: label,
        filename: `CoE-NNECT_faculty-${f?.lastName ?? viewTargetId}_${termSlug}_${dateSlug}`,
      };
    }

    if (viewMode === 'section') {
      const label = viewTargetId || 'Section';
      return {
        scopeLabel: label,
        filename: `CoE-NNECT_section-${label}_${termSlug}_${dateSlug}`,
      };
    }

    return {
      scopeLabel: 'Master View',
      filename: `CoE-NNECT_master_${termSlug}_${dateSlug}`,
    };
  }, [viewMode, viewTargetId, activeTerm, departments, rooms, faculty]);
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
              {viewMode !== 'master' && (
                <span className="text-primary font-medium">
                  ({viewModeLabel[viewMode]})
                </span>
              )}
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

      {/* ── View Filters ── */}
      {activeTerm && (
        <div className="mb-4 flex flex-wrap items-end gap-3 p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              View
            </label>
            <select
              value={viewMode}
              onChange={(e) => {
                setViewMode(e.target.value as ViewMode);
                // Auto-select the DH's own dept when switching to By Department
                if (e.target.value === 'department' && myDeptId) {
                  setViewTargetId(myDeptId);
                } else {
                  setViewTargetId('');
                }
              }}
              className="bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary min-w-[180px]"
            >
              <option value="master">Master View</option>
              <option value="department">By Department</option>
              <option value="room">By Room</option>
              <option value="faculty">By Faculty</option>
              <option value="section">By Section</option>
            </select>
          </div>

          {viewMode !== 'master' && (
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                {targetLabel}
              </label>
              <select
                value={viewTargetId}
                onChange={(e) => setViewTargetId(e.target.value)}
                className="bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary min-w-[220px]"
              >
                <option value="">— select —</option>
                {viewOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {viewMode !== 'master' && viewTargetId && (
            <button
              onClick={() => {
                setViewMode('master');
                setViewTargetId('');
              }}
              className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

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
          title={
            viewMode !== 'master' && viewTargetId
              ? 'No entries for this view'
              : 'No schedule entries yet'
          }
          description={
            viewMode !== 'master' && viewTargetId
              ? 'Try selecting a different department, room, faculty, or section.'
              : 'Click "Plot Subject" to add your first class.'
          }
        />
      )}
      {!isLoading && !error && activeTerm && entries.length > 0 && (
        <>
          {/* ── Export toolbar ── */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-surface-variant bg-surface-container-lowest">
            <div className="text-xs text-on-surface-variant">
              Exporting:{' '}
              <strong className="text-on-surface">
                {exportScope.scopeLabel}
              </strong>{' '}
              · {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
            </div>
            <ExportToolbar
              entries={entries}
              scopeLabel={exportScope.scopeLabel}
              termLabel={
                activeTerm
                  ? `${activeTerm.termName} — AY ${activeTerm.schoolYear}`
                  : 'Term'
              }
              suggestedFilename={exportScope.filename}
              gridAvailable={
                viewMode === 'room' || viewMode === 'master'
              }
              gridScopeLabel={
                viewMode === 'room'
                  ? exportScope.scopeLabel
                  : 'Master Schedule'
              }
            />
          </div>

          <TimetableGrid
            entries={entries}
            onEntryMove={handleMove}
            onEntryClick={handleClick}
          />
        </>
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
            lectureUnits: s.lectureUnits,
            labUnits: s.labUnits,
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

      {/* Stack Picker */}
      <StackPicker
        entries={stackOpen}
        onClose={() => setStackOpen(null)}
        onPick={handlePickFromStack}
      />
    </div>
  );
}