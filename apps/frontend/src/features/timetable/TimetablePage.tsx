import { useCallback, useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import TimetableGrid from './components/TimetableGrid';
import AgendaView from './views/AgendaView';
import type { ScheduleEntry, Day, LoadType } from './types';
import {
  fetchSchedules,
  fetchActiveTerm,
  autoGenerateSchedule,
  type RawSchedule,
  type UnscheduledBlock,
} from '../../api/schedule.api';
import { fetchSubjects } from '../../api/subjects.api';
import { fetchFaculty } from '../../api/faculty.api';
import { fetchRooms } from '../../api/rooms.api';
import { fetchSections } from '../../api/sections.api';
import { fetchDepartments } from '../../api/departments.api';
import { useAuthStore } from '../../store/auth.store';
import LoadingState from '../../components/feedback/LoadingState';
import ErrorState from '../../components/feedback/ErrorState';
import EmptyState from '../../components/feedback/EmptyState';
import Icon from '../../components/ui/Icon';
import PlotSubjectModal from '../plot-subject/PlotSubjectModal';
import ScheduleDetailDrawer from './components/ScheduleDetailDrawer';
import { colorForSubject } from './utils/color.util';
import StackPicker from './components/StackPicker';
import ExportToolbar from './export/ExportToolbar';
import type { GridDensity } from './components/GridMetricsContext';
import { useMoveSchedule } from './hooks/useMoveSchedule';
import AutoSchedulePreview from './auto-schedule/AutoSchedulePreview';

const DAY_MAP: Record<string, Day> = {
  Monday: 'MON',
  Tuesday: 'TUE',
  Wednesday: 'WED',
  Thursday: 'THU',
  Friday: 'FRI',
  Saturday: 'SAT',
  Sunday: 'SUN',
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
export type LayoutMode = 'agenda' | 'grid';

const QUERY_VIEW_MAP: Record<string, ViewMode> = {
  master: 'master',
  department: 'department',
  room: 'room',
  faculty: 'faculty',
  section: 'section',
};

function defaultLayoutForViewport(): LayoutMode {
  if (typeof window === 'undefined') return 'grid';
  return window.matchMedia('(min-width: 768px)').matches ? 'grid' : 'agenda';
}

function defaultDensityForViewport(): GridDensity {
  if (typeof window === 'undefined') return 'desktop';
  if (window.matchMedia('(min-width: 1024px)').matches) return 'desktop';
  if (window.matchMedia('(min-width: 768px)').matches) return 'comfortable';
  return 'compact';
}

interface Props {
  readOnly?: boolean;
}

export default function TimetablePage({ readOnly = false }: Props) {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [plotOpen, setPlotOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [stackOpen, setStackOpen] = useState<ScheduleEntry[] | null>(null);
  const [editEntry, setEditEntry] = useState<ScheduleEntry | null>(null);

  const isDepartmentHead = profile?.role === 'department_head';
  const myDeptId = profile?.dept_id ? String(profile.dept_id) : '';
  const [viewMode, setViewMode] = useState<ViewMode>('master');
  const [viewTargetId, setViewTargetId] = useState('');
  const [onlyConflicts, setOnlyConflicts] = useState(false);

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(defaultLayoutForViewport);
  const [gridDensity, setGridDensity] = useState<GridDensity>(defaultDensityForViewport);

  // ── Auto-generate state ──
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoPreview, setAutoPreview] = useState<ScheduleEntry[] | null>(null);
  const [autoUnscheduled, setAutoUnscheduled] = useState<UnscheduledBlock[]>([]);

  // ── Handle ?view= query param ──
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialViewApplied, setInitialViewApplied] = useState(false);
  useEffect(() => {
    if (initialViewApplied) return;
    const qv = searchParams.get('view');
    if (qv && QUERY_VIEW_MAP[qv]) {
      setViewMode(QUERY_VIEW_MAP[qv]);
      setViewTargetId('');
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      setSearchParams(next, { replace: true });
    }
    setInitialViewApplied(true);
  }, [searchParams, setSearchParams, initialViewApplied]);

  const [layoutTouched, setLayoutTouched] = useState(false);
  useEffect(() => {
    if (layoutTouched) return;
    const mq = window.matchMedia('(min-width: 768px)');
    const handle = () => {
      setLayoutMode(mq.matches ? 'grid' : 'agenda');
      setGridDensity(defaultDensityForViewport());
    };
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, [layoutTouched]);

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

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => fetchSubjects(false),
    enabled: !!user && !readOnly,
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

  const allEntries = useMemo(() => (schedules ?? []).map(toEntry), [schedules]);

  const entries = useMemo(() => {
    let filtered = allEntries;

    if (viewMode !== 'master' && viewTargetId) {
      filtered = filtered.filter((e) => {
        if (viewMode === 'department') return e.deptId === viewTargetId;
        if (viewMode === 'room') return e.roomId === viewTargetId;
        if (viewMode === 'faculty') return e.facultyId === viewTargetId;
        if (viewMode === 'section') return e.sectionCode === viewTargetId;
        return true;
      });
    }

    if (onlyConflicts) {
      filtered = filtered.filter((e) => e.hasConflict || e.hasWarning);
    }

    return filtered;
  }, [allEntries, viewMode, viewTargetId, onlyConflicts]);

  const conflictCount = useMemo(
    () => allEntries.filter((e) => e.hasConflict || e.hasWarning).length,
    [allEntries],
  );

  const { moveEntry: handleMove, isPending: movePending } = useMoveSchedule({
    termId: activeTerm?.termId,
    allEntries,
  });

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
    setSelectedEntry(null);
    setEditEntry(entry);
    setPlotOpen(true);
  }, []);

  const handlePickFromStack = useCallback((entry: ScheduleEntry) => {
    setStackOpen(null);
    setSelectedEntry(entry);
  }, []);
  // ── Auto-generate handler ──
  const handleAutoGenerate = useCallback(async () => {
    if (!activeTerm || !myDeptId) return;
    setAutoGenerating(true);
    try {
      const result = await autoGenerateSchedule(activeTerm.termId, myDeptId);

      if (!result.success) {
        // Room deficit → richer message
        if (result.roomDeficits && result.roomDeficits.length > 0) {
          const lines = result.roomDeficits.map(
            (d) =>
              `• ${d.roomType}: need ${d.neededHours}h, have ${d.availableHours}h (short by ${d.shortByHours}h → add ${d.suggestedExtraRooms} room${d.suggestedExtraRooms === 1 ? '' : 's'})`,
          );
          alert(`${result.message}\n\n${lines.join('\n')}`);
          return;
        }

        const detail = result.failures
          ?.slice(0, 5)
          .map((f) => `• ${f.ruleId} ${f.reason}`)
          .join('\n');
        alert(
          `${result.message ?? 'Auto-generation failed'}${detail ? `\n\n${detail}` : ''}`,
        );
        return;
      }

      // Refetch schedules so the new rows flow through the normal channel
      await queryClient.invalidateQueries({
        queryKey: ['schedules', activeTerm.termId],
      });
      const fresh = await fetchSchedules(activeTerm.termId);
      setAutoPreview(fresh.map(toEntry));
      setAutoUnscheduled(result.unscheduled ?? []);
    } catch (err) {
      alert(`Auto-generate failed: ${(err as Error).message}`);
    } finally {
      setAutoGenerating(false);
    }
  }, [activeTerm, myDeptId, queryClient]);

  const isLoading = termLoading || schedulesLoading;
  const error = termError || schedulesError;

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

  const entryCountLabel = `${entries.length} ${
    entries.length === 1 ? 'entry' : 'entries'
  }`;

  const writable = !readOnly;

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto flex flex-col h-full min-h-0">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary">
            Timetable
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {activeTerm
              ? `${activeTerm.termName} — AY ${activeTerm.schoolYear}`
              : 'Loading term...'}
            {readOnly && (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5">
                <Icon name="visibility" size={12} />
                View only
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {activeTerm && !isLoading && !error && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-base">
                calendar_view_month
              </span>
              {entryCountLabel}
              {viewMode !== 'master' && (
                <span className="text-primary font-medium">
                  ({viewModeLabel[viewMode]})
                </span>
              )}
              {writable && movePending && (
                <span className="ml-2 text-primary font-medium animate-pulse">
                  Saving…
                </span>
              )}
            </div>
          )}

          {writable && activeTerm && isDepartmentHead && (
            <button
              onClick={handleAutoGenerate}
              disabled={autoGenerating}
              className="flex items-center gap-2 px-4 py-2 border border-primary text-primary text-sm font-semibold rounded-lg hover:bg-primary/5 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {autoGenerating ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Icon name="auto_awesome" size={16} />
                  Auto-Generate
                </>
              )}
            </button>
          )}

          {writable && activeTerm && (
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

      {activeTerm && (
        <div className="mb-4 flex flex-col gap-3 p-3 md:p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                View
              </label>
              <select
                value={viewMode}
                onChange={(e) => {
                  setViewMode(e.target.value as ViewMode);
                  if (e.target.value === 'department' && myDeptId && isDepartmentHead) {
                    setViewTargetId(myDeptId);
                  } else {
                    setViewTargetId('');
                  }
                }}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="master">Master View</option>
                <option value="department">By Department</option>
                <option value="room">By Room</option>
                <option value="faculty">By Faculty</option>
                <option value="section">By Section</option>
              </select>
            </div>

            {viewMode !== 'master' && (
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  {targetLabel}
                </label>
                <select
                  value={viewTargetId}
                  onChange={(e) => setViewTargetId(e.target.value)}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
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

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-surface-variant">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                Layout
              </span>
              <div
                role="tablist"
                aria-label="Layout"
                className="inline-flex rounded-lg border border-surface-variant bg-surface-container-low p-0.5"
              >
                <button
                  role="tab"
                  aria-selected={layoutMode === 'agenda'}
                  onClick={() => {
                    setLayoutMode('agenda');
                    setLayoutTouched(true);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                    layoutMode === 'agenda'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Icon name="view_list" size={14} />
                  Agenda
                </button>
                <button
                  role="tab"
                  aria-selected={layoutMode === 'grid'}
                  onClick={() => {
                    setLayoutMode('grid');
                    setLayoutTouched(true);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                    layoutMode === 'grid'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Icon name="grid_on" size={14} />
                  Grid
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {layoutMode === 'grid' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                    Density
                  </span>
                  <div className="inline-flex rounded-lg border border-surface-variant bg-surface-container-low p-0.5">
                    <button
                      onClick={() => setGridDensity('compact')}
                      aria-pressed={gridDensity === 'compact'}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                        gridDensity === 'compact'
                          ? 'bg-white text-primary shadow-sm'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      Compact
                    </button>
                    <button
                      onClick={() => setGridDensity('comfortable')}
                      aria-pressed={gridDensity === 'comfortable'}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                        gridDensity === 'comfortable'
                          ? 'bg-white text-primary shadow-sm'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      Comfortable
                    </button>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyConflicts}
                  onChange={(e) => setOnlyConflicts(e.target.checked)}
                  className="accent-[#5c1219]"
                />
                <Icon name="warning" size={14} />
                Only conflicts
                {conflictCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold">
                    {conflictCount}
                  </span>
                )}
              </label>
            </div>
          </div>
        </div>
      )}

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
            onlyConflicts
              ? 'No conflicts detected'
              : viewMode !== 'master' && viewTargetId
              ? 'No entries for this view'
              : 'No schedule entries yet'
          }
          description={
            onlyConflicts
              ? 'Every scheduled class is currently clean — no hard conflicts or soft warnings.'
              : viewMode !== 'master' && viewTargetId
              ? 'Try selecting a different department, room, faculty, or section.'
              : writable
              ? 'Click "Plot Subject" or "Auto-Generate" to add classes.'
              : 'No schedule entries have been created yet.'
          }
        />
      )}

      {!isLoading && !error && activeTerm && entries.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-surface-variant bg-surface-container-lowest">
            <div className="text-xs text-on-surface-variant">
              Exporting:{' '}
              <strong className="text-on-surface">
                {exportScope.scopeLabel}
              </strong>{' '}
              · {entryCountLabel}
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
              gridAvailable={viewMode === 'room' || viewMode === 'master'}
              gridScopeLabel={
                viewMode === 'room'
                  ? exportScope.scopeLabel
                  : 'Master Schedule'
              }
              layoutMode={layoutMode}
            />
          </div>

          <div className="flex-1 min-h-0">
            {layoutMode === 'agenda' ? (
              <AgendaView entries={entries} onEntryClick={handleClick} />
            ) : (
              <TimetableGrid
                entries={entries}
                density={gridDensity}
                fitToContainer
                onEntryMove={writable ? handleMove : undefined}
                onEntryClick={handleClick}
              />
            )}
          </div>
        </>
      )}

      {/* Plot/Edit modal — only mount when writable */}
      {writable && activeTerm && (
        <PlotSubjectModal
          open={plotOpen}
          onClose={() => {
            setPlotOpen(false);
            setEditEntry(null);
          }}
          termId={activeTerm.termId}
          editing={editEntry}
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

      {activeTerm && (
        <ScheduleDetailDrawer
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onEdit={writable ? handleEdit : undefined}
          termId={activeTerm.termId}
          onMove={writable ? handleMove : undefined}
          movePending={movePending}
          readOnly={readOnly}
        />
      )}

      <StackPicker
        entries={stackOpen}
        onClose={() => setStackOpen(null)}
        onPick={handlePickFromStack}
      />

      {/* ── Auto-generate preview overlay ── */}
      {autoPreview && (
        
        <div className="fixed inset-0 z-50 bg-surface-container-lowest">
          <AutoSchedulePreview
            solvedSchedule={autoPreview}
            unscheduledBlocks={autoUnscheduled}
            scopeLabel={
              activeTerm
                ? `${activeTerm.termName} — AY ${activeTerm.schoolYear}`
                : undefined
            }
            onAccept={() => {
              setAutoPreview(null);
              setAutoUnscheduled([]);
              queryClient.invalidateQueries({
                queryKey: ['schedules', activeTerm?.termId],
              });
            }}
            onCancel={() => {
              setAutoPreview(null);
              setAutoUnscheduled([]);
              queryClient.invalidateQueries({
                queryKey: ['schedules', activeTerm?.termId],
              });
            }}
          />
        </div>
      )}
    </div>
  );
}