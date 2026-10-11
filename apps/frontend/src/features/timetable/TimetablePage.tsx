import { useCallback, useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import TimetableGrid from './components/TimetableGrid';
import AgendaView from './views/AgendaView';
import type { ScheduleEntry, Day, LoadType } from './types';
import {
  fetchSchedules,
  fetchActiveTerm,
  autoGenerateSchedule,
  fetchUnscheduled,
  confirmAutoGenerate,
  discardAutoGenerate,
  abandonAutoGenerate,
  getPendingAutoGenerate,
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
import Modal from '../../components/ui/Modal';
import PlotSubjectModal from '../plot-subject/PlotSubjectModal';
import ScheduleDetailDrawer from './components/ScheduleDetailDrawer';
import { colorForSubject } from './utils/color.util';
import StackPicker from './components/StackPicker';
import ExportToolbar from './export/ExportToolbar';
import type { GridDensity } from './components/GridMetricsContext';
import { useMoveSchedule } from './hooks/useMoveSchedule';
import MoveScheduleConfirmModal from './components/MoveScheduleConfirmModal';
import AutoSchedulePreview from './auto-schedule/AutoSchedulePreview';
import { fetchAllProspectus } from '../../api/prospectus.api';

const DAY_MAP: Record<string, Day> = {
  Monday: 'MON',
  Tuesday: 'TUE',
  Wednesday: 'WED',
  Thursday: 'THU',
  Friday: 'FRI',
  Saturday: 'SAT',
  Sunday: 'SUN',
};

/**
 * Returns the loading message + progress (0-100) based on how long the
 * auto-generate has been running.
 */
function getGenerationProgressMessage(elapsedMs: number): {
  label: string;
  progress: number;
} {
  const sec = elapsedMs / 1000;

  const raw = 1 - Math.exp(-sec / 6);
  const progress = Math.min(95, Math.round(raw * 100));

  let label: string;
  if (sec < 2) {
    label = 'Starting solver…';
  } else if (sec < 5) {
    label = 'Analyzing constraints…';
  } else if (sec < 10) {
    label = 'Solving schedule…';
  } else if (sec < 20) {
    label = 'Placing classes…';
  } else if (sec < 40) {
    label = 'Almost done…';
  } else {
    label = 'Taking longer than expected…';
  }

  return { label, progress };
}

interface AutoGenerateButtonProps {
  isGenerating: boolean;
  isServerSide: boolean;
  elapsedMs: number;
  onClick: () => void;
}

function AutoGenerateButton({
  isGenerating,
  isServerSide,
  elapsedMs,
  onClick,
}: AutoGenerateButtonProps) {
  const { label, progress } = isServerSide
    ? { label: 'Other user generating…', progress: 60 }
    : getGenerationProgressMessage(elapsedMs);

  return (
    <button
      onClick={onClick}
      disabled={isGenerating}
      aria-busy={isGenerating}
      aria-live="polite"
      className={[
        'relative inline-flex items-center justify-center gap-2',
        'px-3 w-[240px] h-[38px]',
        'text-sm font-semibold rounded-lg transition',
        'overflow-hidden',
        isGenerating
          ? 'bg-primary/5 border border-primary text-primary cursor-not-allowed'
          : 'border border-primary text-primary hover:bg-primary/5',
      ].join(' ')}
    >
      {isGenerating && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-primary/15 transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      )}

      {!isGenerating && (
        <>
          <Icon name="auto_awesome" size={16} className="relative z-10 shrink-0" />
          <span className="relative z-10">Auto-Generate</span>
        </>
      )}

      {isGenerating && (
        <>
          <span
            className="w-3.5 h-3.5 border-2 border-primary/40 border-t-primary rounded-full animate-spin relative z-10 shrink-0"
            aria-hidden
          />
          <span className="relative z-10 tabular-nums truncate min-w-0">
            {label}
          </span>
          <span className="relative z-10 tabular-nums text-xs opacity-70 shrink-0">
            {progress}%
          </span>
        </>
      )}
    </button>
  );
}

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

    flagged: raw.flagged,
    flaggedBy: raw.flaggedBy,
    flaggedAt: raw.flaggedAt,
    flagReason: raw.flagReason,

    loadType: (raw.loadType ?? 'lecture') as LoadType,
    deptId: raw.subject?.deptId ?? '',
    deptColor: '#800000',
    color: colorForSubject(raw.subjectId),
  };
}

type ViewMode = 'master' | 'byDepartment' | 'byRoom' | 'byFaculty';
type SubMode = 'all' | 'bySection' | 'byFaculty';

const QUERY_VIEW_MAP: Record<string, ViewMode> = {
  master: 'master',
  department: 'byDepartment',
  room: 'byRoom',
  faculty: 'byFaculty',
};

export type LayoutMode = 'agenda' | 'grid';

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

interface AlertItem {
  ruleId?: string;
  message: string;
  tone?: 'error' | 'warning' | 'info';
}

interface AlertState {
  title: string;
  subtitle?: string;
  items: AlertItem[];
  tone: 'error' | 'info';
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
  const [viewDeptId, setViewDeptId] = useState('');
  const [subMode, setSubMode] = useState<SubMode>('all');
  const [subTargetId, setSubTargetId] = useState('');
  const [roomTargetId, setRoomTargetId] = useState('');
  const [facultyTargetId, setFacultyTargetId] = useState('');
  const [onlyConflicts, setOnlyConflicts] = useState(false);

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(defaultLayoutForViewport);
  const [gridDensity, setGridDensity] = useState<GridDensity>(defaultDensityForViewport);

  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoPreview, setAutoPreview] = useState<ScheduleEntry[] | null>(null);
  const [autoUnscheduled, setAutoUnscheduled] = useState<UnscheduledBlock[]>([]);
  const [serverSideGenerating, setServerSideGenerating] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [generationElapsedMs, setGenerationElapsedMs] = useState(0);

  // ── Warn before leaving if a generate is running or preview is open ──
  useEffect(() => {
    if (!autoPreview && !autoGenerating) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [autoPreview, autoGenerating]);

  // ── Tick every 500ms while a generation is running ──
  useEffect(() => {
    if (!autoGenerating) {
      setGenerationElapsedMs(0);
      return;
    }

    const startedAt = Date.now();
    setGenerationElapsedMs(0);

    const interval = setInterval(() => {
      setGenerationElapsedMs(Date.now() - startedAt);
    }, 500);

    return () => clearInterval(interval);
  }, [autoGenerating]);

  const [alertState, setAlertState] = useState<AlertState | null>(null);

  const { data: prospectus = [] } = useQuery({
    queryKey: ['prospectus-all'],
    queryFn: fetchAllProspectus,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const [initialViewApplied, setInitialViewApplied] = useState(false);
  useEffect(() => {
    if (initialViewApplied) return;
    const qv = searchParams.get('view');
    if (qv && QUERY_VIEW_MAP[qv]) {
      setViewMode(QUERY_VIEW_MAP[qv]);
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
      setViewMode('byDepartment');
      setViewDeptId(myDeptId);
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

  // ── Count of existing auto-generated drafts for this term ──
  const autoDraftCount = useMemo(() => {
    if (!schedules) return 0;
    return schedules.filter(
      (s) =>
        s.status === 'draft' &&
        s.remarks &&
        s.remarks.startsWith('Auto-generated by solver'),
    ).length;
  }, [schedules]);

  const { data: unscheduledRecords = [] } = useQuery({
    queryKey: ['unscheduled', activeTerm?.termId],
    queryFn: () => fetchUnscheduled(activeTerm!.termId),
    enabled: !!user && !!activeTerm,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => fetchSubjects(false),
    enabled: !!user && !readOnly,
    staleTime: 5 * 60 * 1000,
  });

  // ── Pending auto-generate preview check ──
  const { data: pendingAutoGenerate, refetch: refetchPendingAutoGenerate } =
    useQuery({
      queryKey: ['pending-auto-generate', activeTerm?.termId],
      queryFn: () => getPendingAutoGenerate(activeTerm!.termId),
      enabled: !!activeTerm?.termId && !!user,
      refetchOnMount: true,
      staleTime: 30 * 1000,
    });

  // Derive server-side generating state from lock
  useEffect(() => {
    if (!pendingAutoGenerate) {
      setServerSideGenerating(false);
      return;
    }
    if (pendingAutoGenerate.state === 'running') {
      setServerSideGenerating(true);
    } else {
      setServerSideGenerating(false);
    }
  }, [pendingAutoGenerate]);

  // Poll every 3s while a server-side generation is running
  useEffect(() => {
    if (!serverSideGenerating || !activeTerm?.termId) return;

    const interval = setInterval(() => {
      refetchPendingAutoGenerate();
    }, 3000);

    return () => clearInterval(interval);
  }, [serverSideGenerating, activeTerm?.termId, refetchPendingAutoGenerate]);

  const isGenerating = autoGenerating || serverSideGenerating;

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

  const foreignEntryIds = useMemo(() => {
    if (!isDepartmentHead || !myDeptId) return new Set<string>();
    return new Set(
      allEntries
        .filter((e) => {
          if (!e.deptId) return true;
          return String(e.deptId) !== myDeptId;
        })
        .map((e) => e.id),
    );
  }, [allEntries, isDepartmentHead, myDeptId]);

  const entries = useMemo(() => {
    let filtered = allEntries;

    if (viewMode === 'byDepartment' && viewDeptId) {
      filtered = filtered.filter((e) => e.deptId === viewDeptId);

      if (subMode === 'bySection' && subTargetId) {
        filtered = filtered.filter((e) => e.sectionCode === subTargetId);
      } else if (subMode === 'byFaculty' && subTargetId) {
        filtered = filtered.filter((e) => e.facultyId === subTargetId);
      }
    } else if (viewMode === 'byRoom' && roomTargetId) {
      filtered = filtered.filter((e) => e.roomId === roomTargetId);
    } else if (viewMode === 'byFaculty' && facultyTargetId) {
      filtered = filtered.filter((e) => e.facultyId === facultyTargetId);
    }

    if (onlyConflicts) {
      filtered = filtered.filter((e) => e.hasConflict || e.hasWarning);
    }

    return filtered;
  }, [
    allEntries,
    viewMode,
    viewDeptId,
    subMode,
    subTargetId,
    roomTargetId,
    facultyTargetId,
    onlyConflicts,
  ]);

  // ── Deep-link: open drawer for ?focus=<scheduleId> ──
  const [focusApplied, setFocusApplied] = useState(false);
  useEffect(() => {
    if (focusApplied) return;
    const focusId = searchParams.get('focus');
    if (!focusId || !entries.length) return;

    const entry = entries.find((e) => e.id === focusId);
    if (entry) {
      setSelectedEntry(entry);
    }

    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: true });
    setFocusApplied(true);
  }, [entries, searchParams, setSearchParams, focusApplied]);

  const conflictCount = useMemo(
    () => allEntries.filter((e) => e.hasConflict || e.hasWarning).length,
    [allEntries],
  );

  // ── Resume an abandoned preview ──
  const handleResumePendingPreview = useCallback(async () => {
    if (!activeTerm) return;
    try {
      const fresh = await fetchSchedules(activeTerm.termId);
      const freshEntries = fresh.map(toEntry);
      setAutoPreview(freshEntries);

      const unscheduled = await fetchUnscheduled(activeTerm.termId);
      setAutoUnscheduled(
        unscheduled.map((u) => ({
          sectionId: u.sectionId ?? '',
          sectionCode: u.sectionCode,
          subjectId: u.subjectId,
          subjectCode: u.subjectCode,
          kind: u.kind,
          sessionIndex: u.sessionIndex,
        })),
      );
    } catch (err) {
      console.error('Failed to resume preview:', err);
      setAlertState({
        title: 'Could not resume preview',
        tone: 'error',
        items: [{ message: (err as Error).message, tone: 'error' }],
      });
    }
  }, [activeTerm]);

  // ── Discard the pending preview (from banner) ──
  const handleDiscardPendingPreview = useCallback(async () => {
    if (!activeTerm) return;

    // Optimistic: clear the pending banner immediately.
    queryClient.setQueryData(
      ['pending-auto-generate', activeTerm.termId],
      null,
    );

    try {
      await discardAutoGenerate(activeTerm.termId);
    } catch (err) {
      console.error('Failed to discard pending preview:', err);
      setAlertState({
        title: 'Could not discard preview',
        tone: 'error',
        items: [{ message: (err as Error).message, tone: 'error' }],
      });
    }
    refetchPendingAutoGenerate();
  }, [activeTerm, queryClient, refetchPendingAutoGenerate]);

  // ── Accept the auto-generate preview (from modal) ──
  const handleAcceptPreview = useCallback(async () => {
    if (!activeTerm) return;

    // Optimistic: clear the pending banner immediately so it can't be
    // clicked while the confirm request is in flight.
    queryClient.setQueryData(
      ['pending-auto-generate', activeTerm.termId],
      null,
    );

    try {
      await confirmAutoGenerate(activeTerm.termId);
    } catch (err) {
      console.error('Failed to confirm auto-generate:', err);
    }

    setAutoPreview(null);
    setAutoUnscheduled([]);
    queryClient.invalidateQueries({
      queryKey: ['schedules', activeTerm.termId],
    });
    queryClient.invalidateQueries({
      queryKey: ['unscheduled', activeTerm.termId],
    });
    refetchPendingAutoGenerate();
  }, [activeTerm, queryClient, refetchPendingAutoGenerate]);

  // ── Discard the auto-generate preview (from modal) ──
  const handleDiscardPreview = useCallback(async () => {
    if (!activeTerm) return;

    // Optimistic: clear the pending banner immediately.
    queryClient.setQueryData(
      ['pending-auto-generate', activeTerm.termId],
      null,
    );

    try {
      await discardAutoGenerate(activeTerm.termId);
    } catch (err) {
      console.error('Failed to discard auto-generate:', err);
    }

    setAutoPreview(null);
    setAutoUnscheduled([]);
    queryClient.invalidateQueries({
      queryKey: ['schedules', activeTerm.termId],
    });
    queryClient.invalidateQueries({
      queryKey: ['unscheduled', activeTerm.termId],
    });
    refetchPendingAutoGenerate();
  }, [activeTerm, queryClient, refetchPendingAutoGenerate]);

  const {
    moveEntry: handleMove,
    isPending: movePending,
    pendingConfirmation,
  } = useMoveSchedule({
    termId: activeTerm?.termId,
    allEntries,
    onError: (msg) =>
      setAlertState({
        title: 'Move failed',
        tone: 'error',
        items: [{ message: msg, tone: 'error' }],
      }),
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

  // ── Actual generate call ──
  const performAutoGenerate = useCallback(async () => {
    if (!activeTerm || !myDeptId) return;

    try {
      await abandonAutoGenerate(activeTerm.termId);
    } catch {
      // Ignore — no lock held or transient error
    }

    setAutoGenerating(true);
    try {
      const result = await autoGenerateSchedule(activeTerm.termId, myDeptId);

      if (!result.success) {
        if (result.roomDeficits && result.roomDeficits.length > 0) {
          setAlertState({
            title: 'Not enough rooms',
            subtitle: result.message,
            tone: 'error',
            items: result.roomDeficits.map((d) => ({
              ruleId: d.roomType,
              message: `Need ${d.neededHours}h, have ${d.availableHours}h (short by ${d.shortByHours}h) — add ${d.suggestedExtraRooms} more room${d.suggestedExtraRooms === 1 ? '' : 's'}`,
              tone: 'error' as const,
            })),
          });
          return;
        }

        setAlertState({
          title: 'Auto-generation failed',
          subtitle: result.message ?? 'Unknown error',
          tone: 'error',
          items: (result.failures ?? []).slice(0, 20).map((f) => ({
            ruleId: f.ruleId,
            message: f.reason,
            tone: 'error' as const,
          })),
        });
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ['schedules', activeTerm.termId],
      });
      const fresh = await fetchSchedules(activeTerm.termId);
      setAutoPreview(fresh.map(toEntry));
      setAutoUnscheduled(result.unscheduled ?? []);
      refetchPendingAutoGenerate();
    } catch (err) {
      setAlertState({
        title: 'Auto-generate failed',
        tone: 'error',
        items: [{ message: (err as Error).message, tone: 'error' }],
      });
    } finally {
      setAutoGenerating(false);
    }
  }, [activeTerm, myDeptId, queryClient, refetchPendingAutoGenerate]);

  // ── Entry point from button. Gate on overwrite confirmation. ──
  const handleAutoGenerate = useCallback(async () => {
    if (!activeTerm || !myDeptId) return;

    if (autoDraftCount > 0) {
      setConfirmOverwrite(true);
      return;
    }

    await performAutoGenerate();
  }, [activeTerm, myDeptId, autoDraftCount, performAutoGenerate]);

  // ── Confirmed overwrite → proceed ──
  const handleConfirmOverwrite = useCallback(async () => {
    setConfirmOverwrite(false);
    await performAutoGenerate();
  }, [performAutoGenerate]);

  const isLoading = termLoading || schedulesLoading;
  const error = termError || schedulesError;

  const deptOptions = useMemo(
    () =>
      departments
        .filter((d) => d.isActive)
        .map((d) => ({
          value: String(d.deptId),
          label: `[${d.deptCode}] ${d.deptName}`,
        })),
    [departments],
  );

  const sectionsForDept = useMemo(() => {
    if (!viewDeptId) return sections.filter((s) => s.isActive);
    return sections.filter((s) => s.isActive);
  }, [sections, viewDeptId]);

  const sectionOptions = useMemo(
    () =>
      sectionsForDept.map((s) => ({
        value: s.sectionCode,
        label: s.sectionCode,
      })),
    [sectionsForDept],
  );

  const facultyOptions = useMemo(
    () =>
      faculty
        .filter((f) => f.isActive)
        .map((f) => ({
          value: f.facultyId,
          label: `${f.lastName}, ${f.firstName}`,
        })),
    [faculty],
  );

  const roomOptions = useMemo(
    () =>
      rooms
        .filter((r) => r.isActive)
        .map((r) => ({
          value: r.roomId,
          label: `Room ${r.roomNumber} (${r.building})`,
        })),
    [rooms],
  );

  const hasAnyFilter =
    viewMode !== 'master' &&
    ((viewMode === 'byDepartment' && (viewDeptId || subTargetId)) ||
      (viewMode === 'byRoom' && roomTargetId) ||
      (viewMode === 'byFaculty' && facultyTargetId));

  const clearFilters = () => {
    setViewMode('master');
    setViewDeptId('');
    setSubMode('all');
    setSubTargetId('');
    setRoomTargetId('');
    setFacultyTargetId('');
  };

  const exportScope = useMemo(() => {
    const termSlug = activeTerm
      ? `${activeTerm.termName}-AY${activeTerm.schoolYear}`
          .replace(/\s+/g, '-')
          .replace(/[^a-zA-Z0-9-]+/g, '')
      : 'term';
    const dateSlug = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    if (viewMode === 'byDepartment' && viewDeptId) {
      const d = departments.find((x) => String(x.deptId) === viewDeptId);
      const subLabel =
        subMode === 'bySection' && subTargetId
          ? `-${subTargetId}`
          : subMode === 'byFaculty' && subTargetId
          ? `-${faculty.find((f) => f.facultyId === subTargetId)?.lastName ?? subTargetId}`
          : '';
      return {
        scopeLabel: `${d?.deptCode ?? 'Dept'}${subLabel}`,
        filename: `CoE-NNECT_dept-${d?.deptCode ?? viewDeptId}${subLabel}_${termSlug}_${dateSlug}`,
      };
    }
    if (viewMode === 'byRoom' && roomTargetId) {
      const r = rooms.find((x) => x.roomId === roomTargetId);
      return {
        scopeLabel: `Room ${r?.roomNumber ?? roomTargetId}`,
        filename: `CoE-NNECT_room-${r?.roomNumber ?? roomTargetId}_${termSlug}_${dateSlug}`,
      };
    }
    if (viewMode === 'byFaculty' && facultyTargetId) {
      const f = faculty.find((x) => x.facultyId === facultyTargetId);
      return {
        scopeLabel: f ? `${f.lastName}, ${f.firstName}` : 'Faculty',
        filename: `CoE-NNECT_faculty-${f?.lastName ?? facultyTargetId}_${termSlug}_${dateSlug}`,
      };
    }
    return {
      scopeLabel: 'Master View',
      filename: `CoE-NNECT_master_${termSlug}_${dateSlug}`,
    };
  }, [
    viewMode,
    viewDeptId,
    subMode,
    subTargetId,
    roomTargetId,
    facultyTargetId,
    activeTerm,
    departments,
    rooms,
    faculty,
  ]);

  const entryCountLabel = `${entries.length} ${
    entries.length === 1 ? 'entry' : 'entries'
  }`;

  const writable = !readOnly;

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto flex flex-col h-full min-h-0">
      {/* Header */}
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
              {writable && movePending && (
                <span className="ml-2 text-primary font-medium animate-pulse">
                  Saving…
                </span>
              )}
            </div>
          )}

          {writable && activeTerm && isDepartmentHead && (
            <AutoGenerateButton
              isGenerating={isGenerating}
              isServerSide={serverSideGenerating && !autoGenerating}
              elapsedMs={generationElapsedMs}
              onClick={handleAutoGenerate}
            />
          )}

          {writable && activeTerm && (
            <button
              onClick={() => setPlotOpen(true)}
              disabled={isGenerating}
              title={isGenerating ? 'Wait for the current generation to finish' : undefined}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:bg-tertiary transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
            >
              <Icon name="add" size={16} />
              Plot Subject
            </button>
          )}
        </div>
      </div>

      {/* Someone else is generating */}
      {activeTerm &&
        pendingAutoGenerate &&
        !pendingAutoGenerate.heldByUser &&
        pendingAutoGenerate.state === 'running' && (
          <div className="mb-4 p-3 rounded-xl border border-blue-200 bg-blue-50 flex items-center gap-3">
            <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
            <p className="text-sm text-blue-900">
              Someone else is currently generating a schedule for this term.
              Please wait for it to finish.
            </p>
          </div>
        )}

      {/* ═══ Resume Pending Auto-Generate Preview Banner ═══ */}
      {activeTerm &&
        pendingAutoGenerate &&
        pendingAutoGenerate.heldByUser &&
        pendingAutoGenerate.state === 'pending_confirm' &&
        !autoPreview && (
          <div className="mb-4 p-4 rounded-xl border border-amber-300 bg-amber-50 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <Icon
                name="warning"
                filled
                size={20}
                className="text-amber-700 shrink-0 mt-0.5"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900">
                  You have an unresolved auto-generate preview
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  It was generated in a previous session and is still pending
                  your review. Resume to accept it, or discard to clear it.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDiscardPendingPreview}
                className="px-3 py-2 text-xs font-semibold text-amber-800 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 transition"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleResumePendingPreview}
                className="px-4 py-2 text-xs font-semibold bg-[#5c1219] text-white rounded-lg hover:opacity-90 transition"
              >
                Resume Preview
              </button>
            </div>
          </div>
        )}

      {/* Filter panel */}
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
                  const v = e.target.value as ViewMode;
                  setViewMode(v);
                  setSubMode('all');
                  setSubTargetId('');
                  setRoomTargetId('');
                  setFacultyTargetId('');
                  if (v === 'byDepartment' && myDeptId && isDepartmentHead) {
                    setViewDeptId(myDeptId);
                  } else {
                    setViewDeptId('');
                  }
                }}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="master">Master View</option>
                <option value="byDepartment">By Department</option>
                <option value="byRoom">By Room</option>
                <option value="byFaculty">By Faculty</option>
              </select>
            </div>

            {viewMode === 'byDepartment' && (
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Department
                </label>
                <select
                  value={viewDeptId}
                  onChange={(e) => {
                    setViewDeptId(e.target.value);
                    setSubMode('all');
                    setSubTargetId('');
                  }}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">— select —</option>
                  {deptOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {viewMode === 'byRoom' && (
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Room
                </label>
                <select
                  value={roomTargetId}
                  onChange={(e) => setRoomTargetId(e.target.value)}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">— select —</option>
                  {roomOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {viewMode === 'byFaculty' && (
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Faculty
                </label>
                <select
                  value={facultyTargetId}
                  onChange={(e) => setFacultyTargetId(e.target.value)}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">— select —</option>
                  {facultyOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {hasAnyFilter && (
              <button
                onClick={clearFilters}
                className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
              >
                Clear filter
              </button>
            )}
          </div>

          {viewMode === 'byDepartment' && viewDeptId && (
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-surface-variant">
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Refine by
                </label>
                <select
                  value={subMode}
                  onChange={(e) => {
                    const v = e.target.value as SubMode;
                    setSubMode(v);
                    setSubTargetId('');
                  }}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="all">All (no refinement)</option>
                  <option value="bySection">Section</option>
                  <option value="byFaculty">Faculty</option>
                </select>
              </div>

              {subMode === 'bySection' && (
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Section
                  </label>
                  <select
                    value={subTargetId}
                    onChange={(e) => setSubTargetId(e.target.value)}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">— select —</option>
                    {sectionOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {subMode === 'byFaculty' && (
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Faculty
                  </label>
                  <select
                    value={subTargetId}
                    onChange={(e) => setSubTargetId(e.target.value)}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">— select —</option>
                    {facultyOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

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
            onlyConflicts
              ? 'No conflicts detected'
              : hasAnyFilter
              ? 'No entries for this view'
              : 'No schedule entries yet'
          }
          description={
            onlyConflicts
              ? 'Every scheduled class is currently clean — no hard conflicts or soft warnings.'
              : hasAnyFilter
              ? 'Try selecting a different department, room, faculty, or section.'
              : writable
              ? 'Click "Plot Subject" or "Auto-Generate" to add classes.'
              : 'No schedule entries have been created yet.'
          }
        />
      )}

      {/* Grid + toolbar */}
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
              gridAvailable={viewMode === 'byRoom' || viewMode === 'master'}
              gridScopeLabel={
                viewMode === 'byRoom'
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
                readOnlyEntryIds={foreignEntryIds}
              />
            )}
          </div>
        </>
      )}

      {/* Modals */}
      {writable && activeTerm && (
        <PlotSubjectModal
          open={plotOpen}
          onClose={() => {
            setPlotOpen(false);
            setEditEntry(null);
          }}
          termId={activeTerm.termId}
          editing={editEntry}
          departments={departments.map((d) => ({
            deptId: String(d.deptId),
            deptCode: d.deptCode,
            deptName: d.deptName,
          }))}
          subjects={subjects.map((s) => {
            const entries = prospectus.filter(
              (p) => p.subjectId === s.subjectId,
            );
            const years = entries.map((p) => ({
              yearLevel: p.yearLevel,
              semester: p.semester,
            }));
            // Take the first matching prospectus entry's pattern.
            const first = entries[0];
            return {
              subjectId: s.subjectId,
              subjectCode: s.subjectCode,
              title: s.title,
              lectureUnits: s.lectureUnits,
              labUnits: s.labUnits,
              deptId: s.deptId,
              prospectusYears: years,
              lectureSessionsPerWeek: first?.lectureSessionsPerWeek ?? 1,
              labSessionsPerWeek: first?.labSessionsPerWeek ?? 1,
            };
          })}
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
          existingCounts={(schedules ?? []).map((s) => ({
            scheduleId: s.scheduleId,
            section: s.section,
            subjectId: s.subjectId,
            loadType: (s.loadType ?? 'lecture') as
              | 'lecture'
              | 'laboratory'
              | 'other',
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

      <MoveScheduleConfirmModal pending={pendingConfirmation} />

      {/* Generic alert modal */}
      <Modal
        open={!!alertState}
        onClose={() => setAlertState(null)}
        title={alertState?.title ?? ''}
        size="md"
        footer={
          <button
            type="button"
            onClick={() => setAlertState(null)}
            className="px-5 py-2 text-sm font-semibold bg-[#5c1219] text-white hover:opacity-90 transition"
          >
            OK
          </button>
        }
      >
        {alertState && (
          <div className="space-y-3">
            <div
              className={`flex items-start gap-2 p-3 border ${
                alertState.tone === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              <Icon
                name={alertState.tone === 'error' ? 'error' : 'info'}
                filled
                size={18}
                className="shrink-0 mt-0.5"
              />
              <div className="text-sm">
                {alertState.subtitle ? (
                  <p className="font-medium">{alertState.subtitle}</p>
                ) : (
                  <p className="font-medium">
                    {alertState.items.length} item
                    {alertState.items.length === 1 ? '' : 's'}
                  </p>
                )}
              </div>
            </div>

            {alertState.items.length > 0 && (
              <ul className="space-y-2 max-h-80 overflow-y-auto">
                {alertState.items.map((item, i) => (
                  <li
                    key={`${item.ruleId ?? 'item'}-${i}`}
                    className={`flex items-start gap-2 p-2.5 border text-xs ${
                      item.tone === 'error'
                        ? 'bg-red-50/50 border-red-100'
                        : item.tone === 'warning'
                        ? 'bg-amber-50/50 border-amber-100'
                        : 'bg-slate-50 border-slate-100'
                    }`}
                  >
                    {item.ruleId && (
                      <span
                        className={`font-mono font-bold shrink-0 px-1.5 py-0.5 text-[10px] ${
                          item.tone === 'error'
                            ? 'bg-red-100 text-red-800'
                            : item.tone === 'warning'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {item.ruleId}
                      </span>
                    )}
                    <span className="text-slate-700 leading-relaxed">
                      {item.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

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
            onAccept={handleAcceptPreview}
            onCancel={handleDiscardPreview}
          />
        </div>
      )}

      {/* ═══ Overwrite Confirmation Modal ═══ */}
      <Modal
        open={confirmOverwrite}
        onClose={() => setConfirmOverwrite(false)}
        title="Replace existing auto-generated drafts?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmOverwrite(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmOverwrite}
              className="px-4 py-2 text-sm font-semibold bg-[#5c1219] text-white hover:opacity-90 transition"
            >
              Replace and Generate
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <Icon
              name="warning"
              size={18}
              className="text-amber-700 shrink-0 mt-0.5"
            />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">
                {autoDraftCount} existing auto-generated draft
                {autoDraftCount === 1 ? '' : 's'} will be replaced.
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            Any manual changes made to those drafts after generation will be
            lost. The solver will produce a fresh set of drafts.
          </p>
          <p className="text-xs text-slate-500">
            Tip: use Discard first if you want to keep the current drafts and
            start over. Otherwise, continue to replace them.
          </p>
        </div>
      </Modal>

      {/* Unscheduled panel */}
      {unscheduledRecords.length > 0 && !autoPreview && (
        <div className="fixed bottom-4 right-4 z-40 max-w-md w-[calc(100vw-2rem)] md:w-auto">
          <details className="bg-white border border-amber-200 shadow-lg rounded-lg overflow-hidden">
            <summary className="px-4 py-3 cursor-pointer bg-amber-50 text-amber-900 font-semibold text-sm flex items-center gap-2 hover:bg-amber-100 transition select-none">
              <Icon name="warning" size={16} />
              <span className="flex-1">
                {unscheduledRecords.length} subject
                {unscheduledRecords.length === 1 ? '' : 's'} need manual plotting
              </span>
              <Icon name="expand_more" size={16} />
            </summary>
            <ul className="max-h-80 overflow-y-auto divide-y divide-amber-100">
              {unscheduledRecords.map((u) => (
                <li key={u.unscheduledId} className="px-4 py-3 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono font-bold text-primary">
                      {u.subjectCode}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                      {u.kind}
                    </span>
                  </div>
                  <div className="text-on-surface-variant truncate mt-0.5">
                    {u.subjectTitle}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-on-surface-variant">
                      {u.sectionCode}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setAlertState({
                          title: 'Plot manually',
                          subtitle: `${u.subjectCode} · ${u.sectionCode}`,
                          tone: 'info',
                          items: [
                            {
                              message:
                                "Open the Plot Subject modal, pick this subject, and choose a slot. The scheduler couldn't find one for it.",
                              tone: 'info',
                            },
                          ],
                        })
                      }
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      Plot manually →
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}