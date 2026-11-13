import { useCallback, useMemo } from 'react';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { fetchDepartments } from '../../api/departments.api';
import {
  fetchSchedules,
  fetchActiveTerm,
  fetchFlagged,
  type RawSchedule,
} from '../../api/schedule.api';
import { fetchUserDirectory } from '../../api/users.api';
import { fetchFaculty, fetchFacultyStatusSummary } from '../../api/faculty.api';
import { fetchFacultyRequests } from '../../api/faculty-requests.api';
import { fetchDesignations } from '../../api/system-config.api';
import Icon from '../../components/ui/Icon';
import RollingValue, {
  RollingNumber,
  RollingText,
} from '../../components/ui/RollingValue';
import {
  ReportCard,
  SummaryCard,
  TodayScheduleStrip,
} from '../dashboard/components';
import { useAuthStore } from '../../store/auth.store';
import { useOnlineUsers } from '../../hooks/use-online-users';
import { useNow } from '../../hooks/use-now';
import { formatLastSeen } from '../../lib/utils/format.util';
import {
  DAY_FULL_NAMES,
  fmtTime,
  greeting,
  humanizeRole,
  initials,
  relativeTime,
  scheduleDay,
  scheduleEnd,
  scheduleStart,
  timeToMinutes,
} from '../dashboard/utils/dashboard.utils';

type WorkloadStatus = 'overload' | 'under' | 'full' | 'idle';

interface FacultyLoadRow {
  facultyId: string;
  name: string;
  assigned: number;
  required: number;
  status: WorkloadStatus;
}

interface AttentionItem {
  key: string;
  icon: string;
  color: string;
  title: string;
  detail?: string;
  to: string;
}

const DEFAULT_REQUIRED_HOURS = 18;
const LOAD_BAND_HOURS = 2;

const DAY_ABBR: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

function normalizeDay(value: string): string {
  if (!value) return '';
  const cleaned = value.trim();
  const full = DAY_FULL_NAMES.find(
    (day) => day.toLowerCase() === cleaned.toLowerCase(),
  );
  if (full) return full;
  return DAY_ABBR[cleaned.slice(0, 3).toUpperCase()] ?? cleaned;
}

function scheduleHours(schedule: RawSchedule): number {
  const start = scheduleStart(schedule);
  const end = scheduleEnd(schedule);
  if (!start || !end) return 0;
  return Math.max(0, (timeToMinutes(end) - timeToMinutes(start)) / 60);
}

function classifyLoad(assigned: number, required: number): WorkloadStatus {
  if (assigned === 0) return 'idle';
  if (assigned > required + LOAD_BAND_HOURS) return 'overload';
  if (Math.abs(assigned - required) <= LOAD_BAND_HOURS) return 'full';
  return 'under';
}

function scheduleWhen(schedule: RawSchedule): string {
  return [scheduleDay(schedule), fmtTime(scheduleStart(schedule))]
    .filter(Boolean)
    .join(' · ');
}

export default function DeanDashboardPage() {
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const role = profile?.role;
  const isSecretary = role === 'college_secretary';
  const isDean = role === 'college_dean';
  const canApprove = isDean || role === 'administrator';
  const roleLabel = role ? humanizeRole(role) : undefined;
  const approvalsPath = canApprove ? '/dean/approvals' : '/dean/timetable';

  // ── Queries ──────────────────────────────────────────────────────────
  const {
    data: departments = [],
    isLoading: deptLoading,
    dataUpdatedAt: deptUpdatedAt,
  } = useQuery({
    queryKey: ['departments', { includeInactive: true }],
    queryFn: () => fetchDepartments(true),
  });

  const { data: directory = [], isLoading: dirLoading } = useQuery({
    queryKey: ['users', 'directory'],
    queryFn: fetchUserDirectory,
    refetchInterval: 60_000,
  });

  const { data: activeTerm, isLoading: termLoading } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
  });

  const {
    data: schedules = [],
    isLoading: schedLoading,
    dataUpdatedAt: schedUpdatedAt,
  } = useQuery({
    queryKey: ['schedules', activeTerm?.termId],
    queryFn: () => fetchSchedules(activeTerm?.termId),
    enabled: !!activeTerm?.termId,
  });

  const {
    data: faculty = [],
    isLoading: facultyLoading,
    dataUpdatedAt: facultyUpdatedAt,
  } = useQuery({
    queryKey: ['faculty', { includeInactive: false }],
    queryFn: () => fetchFaculty(false),
    enabled: !!profile,
  });

  const { data: statusSummary = [], isLoading: statusLoading } = useQuery({
    queryKey: ['faculty-status-summary', 'college'],
    queryFn: () => fetchFacultyStatusSummary(),
    enabled: !!profile,
  });

  const { data: designations = [], dataUpdatedAt: desUpdatedAt } = useQuery({
    queryKey: ['designations'],
    queryFn: fetchDesignations,
    enabled: !!profile,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: facultyRequests = [],
    isLoading: reqLoading,
    dataUpdatedAt: reqUpdatedAt,
  } = useQuery({
    queryKey: ['faculty-requests'],
    queryFn: fetchFacultyRequests,
    enabled: !!profile,
  });

  const { data: flagged = [], isLoading: flaggedLoading } = useQuery({
    queryKey: ['flagged', activeTerm?.termId],
    queryFn: () => fetchFlagged(activeTerm!.termId),
    enabled: !!activeTerm?.termId && isDean,
  });

  const { onlineUsers, isConnected } = useOnlineUsers();
  const now = useNow();
  const nowDate = new Date(now);

  const isFetchingAny =
    useIsFetching({
      predicate: (query) =>
        [
          'departments',
          'users',
          'active-term',
          'schedules',
          'faculty',
          'faculty-status-summary',
          'faculty-requests',
          'flagged',
          'designations',
        ].includes(String(query.queryKey[0])),
    }) > 0;

  const refreshAll = useCallback(() => {
    for (const key of [
      'departments',
      'users',
      'active-term',
      'schedules',
      'faculty',
      'faculty-status-summary',
      'faculty-requests',
      'flagged',
      'designations',
    ]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  }, [qc]);

  // ── Department + schedule summaries ──────────────────────────────────
  const activeDepts = useMemo(
    () => departments.filter((d) => d.isActive),
    [departments],
  );
  const inactiveDepts = useMemo(
    () => departments.filter((d) => !d.isActive),
    [departments],
  );

  const reviewSchedules = useMemo(
    () => schedules.filter((s) => s.status === 'review'),
    [schedules],
  );
  const finalizedSchedules = useMemo(
    () =>
      schedules.filter(
        (s) => s.status === 'finalized' || s.status === 'published',
      ),
    [schedules],
  );
  const publishedSchedules = useMemo(
    () => schedules.filter((s) => s.status === 'published'),
    [schedules],
  );

  const statusCounts = useMemo(
    () => ({
      draft: schedules.filter((s) => s.status === 'draft').length,
      review: reviewSchedules.length,
      finalized: schedules.filter((s) => s.status === 'finalized').length,
      published: publishedSchedules.length,
    }),
    [schedules, reviewSchedules.length, publishedSchedules.length],
  );

  const completionRate =
    schedules.length > 0
      ? Math.round((finalizedSchedules.length / schedules.length) * 100)
      : 0;

  const pendingRequests = useMemo(
    () => facultyRequests.filter((r) => r.status === 'pending'),
    [facultyRequests],
  );

  const deptScheduleStats = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    for (const row of schedules) {
      const deptId = row.subject?.deptId;
      if (!deptId) continue;
      const key = String(deptId);
      const current = map.get(key) ?? { total: 0, completed: 0 };
      current.total += 1;
      if (row.status === 'finalized' || row.status === 'published') {
        current.completed += 1;
      }
      map.set(key, current);
    }
    return map;
  }, [schedules]);

  const deptCodeFor = useCallback(
    (id: string | null | undefined) => {
      if (!id) return '—';
      return (
        departments.find((d) => String(d.deptId) === String(id))?.deptCode ??
        `#${id}`
      );
    },
    [departments],
  );

  // ── College-wide faculty workload + qualification coverage ───────────
  const workload = useMemo(() => {
    const releaseById = new Map<string, number>();
    for (const designation of designations) {
      releaseById.set(
        String(designation.designationId),
        Number(designation.releaseHours ?? 0),
      );
    }

    const assignedById = new Map<string, number>();
    for (const schedule of schedules) {
      if (!schedule.facultyId) continue;
      assignedById.set(
        schedule.facultyId,
        (assignedById.get(schedule.facultyId) ?? 0) + scheduleHours(schedule),
      );
    }

    const rows: FacultyLoadRow[] = faculty.map((member) => {
      const assigned = assignedById.get(member.facultyId) ?? 0;
      const baseRequired = member.requiredHours ?? DEFAULT_REQUIRED_HOURS;
      const release = member.designationId
        ? (releaseById.get(String(member.designationId)) ?? 0)
        : 0;
      const required = Math.max(0, baseRequired - release);

      return {
        facultyId: member.facultyId,
        name: `${member.lastName}, ${member.firstName}`,
        assigned,
        required,
        status: classifyLoad(assigned, required),
      };
    });

    const counts = {
      overload: rows.filter((r) => r.status === 'overload').length,
      under: rows.filter((r) => r.status === 'under').length,
      full: rows.filter((r) => r.status === 'full').length,
      idle: rows.filter((r) => r.status === 'idle').length,
    };

    const needsReview = rows
      .filter((r) => r.status === 'overload' || r.status === 'under')
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'overload' ? -1 : 1;
        return (
          Math.abs(b.assigned - b.required) - Math.abs(a.assigned - a.required)
        );
      })
      .slice(0, 2);

    return { counts, needsReview };
  }, [faculty, schedules, designations]);

  const qualificationById = useMemo(
    () => new Map(statusSummary.map((row) => [row.facultyId, row])),
    [statusSummary],
  );

  const qualifiedCount = useMemo(
    () =>
      faculty.filter(
        (member) => qualificationById.get(member.facultyId)?.hasQualifications,
      ).length,
    [faculty, qualificationById],
  );

  const qualificationPct =
    faculty.length > 0
      ? Math.round((qualifiedCount / faculty.length) * 100)
      : 0;

  // ── Presence + department-head coverage ──────────────────────────────
  const deptHeads = useMemo(
    () => directory.filter((u) => u.role === 'department_head' && u.is_active),
    [directory],
  );

  const onlineUserIds = useMemo(
    () => new Set(onlineUsers.map((u) => u.user_id)),
    [onlineUsers],
  );

  const deptsWithHeads = useMemo(
    () =>
      [...departments]
        .sort(
          (a, b) =>
            Number(b.isActive) - Number(a.isActive) ||
            a.deptName.localeCompare(b.deptName),
        )
        .map((dept) => {
          const head = deptHeads.find(
            (u) => String(u.dept_id) === String(dept.deptId),
          );
          return {
            dept,
            head,
            isOnline: head ? onlineUserIds.has(head.user_id) : false,
          };
        }),
    [departments, deptHeads, onlineUserIds],
  );

  const activeWithHead = useMemo(
    () =>
      activeDepts.filter((dept) =>
        deptHeads.some((u) => String(u.dept_id) === String(dept.deptId)),
      ).length,
    [activeDepts, deptHeads],
  );

  const departmentsWithoutHead = useMemo(
    () =>
      activeDepts.filter(
        (dept) =>
          !deptHeads.some((u) => String(u.dept_id) === String(dept.deptId)),
      ),
    [activeDepts, deptHeads],
  );

  const onlineDHs = useMemo(
    () =>
      activeDepts.filter((dept) => {
        const head = deptHeads.find(
          (u) => String(u.dept_id) === String(dept.deptId),
        );
        return head ? onlineUserIds.has(head.user_id) : false;
      }).length,
    [activeDepts, deptHeads, onlineUserIds],
  );

  const headsPct =
    activeDepts.length > 0
      ? Math.round((activeWithHead / activeDepts.length) * 100)
      : 0;

  // ── Today + day distribution ─────────────────────────────────────────
  const todayName = DAY_FULL_NAMES[nowDate.getDay()];

  const dayInsight = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of schedules) {
      const day = normalizeDay(scheduleDay(row));
      if (!day) continue;
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    let busiest: { day: string; count: number } | null = null;
    for (const [day, count] of counts) {
      if (!busiest || count > busiest.count) busiest = { day, count };
    }
    return {
      classesToday: counts.get(todayName) ?? 0,
      busiest,
    };
  }, [schedules, todayName]);

  // ── Attention queue ──────────────────────────────────────────────────
  const gapRows = useMemo(
    () =>
      schedules.filter((schedule) => {
        const hasFaculty = Boolean(
          schedule.facultyId || schedule.externalFacultyName?.trim(),
        );
        const hasRoom = Boolean(
          schedule.roomId || schedule.externalRoomName?.trim(),
        );
        return !hasFaculty || !hasRoom;
      }),
    [schedules],
  );

  const scheduleAttentionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const schedule of reviewSchedules) ids.add(schedule.scheduleId);
    for (const schedule of flagged) ids.add(schedule.scheduleId);
    for (const schedule of gapRows) ids.add(schedule.scheduleId);
    return ids;
  }, [reviewSchedules, flagged, gapRows]);

  const attentionCount =
    scheduleAttentionIds.size + pendingRequests.length + inactiveDepts.length;

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    const seen = new Set<string>();

    for (const schedule of reviewSchedules.slice(0, 3)) {
      if (items.length >= 6) break;
      seen.add(schedule.scheduleId);
      items.push({
        key: `review-${schedule.scheduleId}`,
        icon: 'pending_actions',
        color: 'text-amber-600',
        title: `${schedule.subject?.subjectCode ?? 'Class block'} ${
          canApprove ? 'awaits approval' : 'is in review'
        }`,
        detail: [
          deptCodeFor(schedule.subject?.deptId),
          schedule.faculty
            ? `${schedule.faculty.firstName} ${schedule.faculty.lastName}`
            : 'No faculty',
          scheduleWhen(schedule),
        ]
          .filter(Boolean)
          .join(' · '),
        to: approvalsPath,
      });
    }

    for (const request of pendingRequests.slice(0, 2)) {
      if (items.length >= 6) break;
      items.push({
        key: `request-${request.requestId}`,
        icon: 'swap_horiz',
        color: 'text-amber-600',
        title: 'Cross-department faculty request',
        detail: `${deptCodeFor(request.requestingDeptId)} → ${deptCodeFor(
          request.targetDeptId,
        )} · ${request.reason}`,
        to: '/dean/requests',
      });
    }

    for (const dept of inactiveDepts.slice(0, 1)) {
      if (items.length >= 6) break;
      items.push({
        key: `dept-${dept.deptId}`,
        icon: 'domain_disabled',
        color: 'text-rose-600',
        title: `${dept.deptName} is deactivated`,
        detail: 'No new schedules can be plotted for this department.',
        to: '/dean/departments',
      });
    }

    for (const schedule of flagged) {
      if (items.length >= 6) break;
      if (seen.has(schedule.scheduleId)) continue;
      seen.add(schedule.scheduleId);
      items.push({
        key: `flag-${schedule.scheduleId}`,
        icon: 'flag',
        color: 'text-rose-600',
        title: `${schedule.subject?.subjectCode ?? 'Class block'} is flagged`,
        detail:
          schedule.flagReason?.trim() ||
          [schedule.section, scheduleWhen(schedule)]
            .filter(Boolean)
            .join(' · '),
        to: `/dean/timetable?focus=${schedule.scheduleId}`,
      });
    }

    for (const schedule of gapRows) {
      if (items.length >= 6) break;
      if (seen.has(schedule.scheduleId)) continue;
      seen.add(schedule.scheduleId);

      const missingFaculty = !(
        schedule.facultyId || schedule.externalFacultyName?.trim()
      );
      const missingRoom = !(
        schedule.roomId || schedule.externalRoomName?.trim()
      );
      const missing =
        missingFaculty && missingRoom
          ? 'an instructor and a room'
          : missingFaculty
            ? 'an instructor'
            : 'a room';

      items.push({
        key: `gap-${schedule.scheduleId}`,
        icon: 'report',
        color: 'text-amber-600',
        title: `${schedule.subject?.subjectCode ?? 'Class block'} needs ${missing}`,
        detail: [schedule.section, scheduleWhen(schedule)]
          .filter(Boolean)
          .join(' · '),
        to: `/dean/timetable?focus=${schedule.scheduleId}`,
      });
    }

    return items;
  }, [
    reviewSchedules,
    pendingRequests,
    inactiveDepts,
    flagged,
    gapRows,
    canApprove,
    approvalsPath,
    deptCodeFor,
  ]);

  const attentionHint = useMemo(() => {
    const parts = [
      reviewSchedules.length > 0 ? `${reviewSchedules.length} in review` : '',
      pendingRequests.length > 0
        ? `${pendingRequests.length} request${
            pendingRequests.length === 1 ? '' : 's'
          }`
        : '',
      inactiveDepts.length > 0 ? `${inactiveDepts.length} inactive` : '',
      flagged.length > 0 ? `${flagged.length} flagged` : '',
      gapRows.length > 0 ? `${gapRows.length} unassigned` : '',
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : 'All clear';
  }, [
    reviewSchedules.length,
    pendingRequests.length,
    inactiveDepts.length,
    flagged.length,
    gapRows.length,
  ]);

  const recentActivity = useMemo(
    () =>
      [...facultyRequests]
        .sort(
          (a, b) =>
            new Date(b.createdAt ?? 0).getTime() -
            new Date(a.createdAt ?? 0).getTime(),
        )
        .slice(0, 4),
    [facultyRequests],
  );

  const quickLinks = useMemo(() => {
    const common = [
      {
        to: '/dean/departments',
        label: 'Departments',
        icon: 'corporate_fare',
      },
      { to: '/dean/faculty', label: 'Faculty', icon: 'groups' },
      { to: '/dean/subjects', label: 'Subjects', icon: 'menu_book' },
      { to: '/dean/sections', label: 'Sections', icon: 'grid_on' },
      { to: '/dean/rooms', label: 'Rooms', icon: 'meeting_room' },
      {
        to: '/dean/timetable',
        label: 'Timetable',
        icon: 'calendar_view_month',
      },
    ];

    if (isSecretary) {
      return [
        ...common.slice(0, 2),
        { to: '/dean/users', label: 'Users', icon: 'manage_accounts' },
        ...common.slice(2),
        { to: '/dean/requests', label: 'Requests', icon: 'swap_horiz' },
      ];
    }

    return [
      ...common,
      { to: '/dean/reports', label: 'Reports', icon: 'bar_chart' },
      {
        to: '/dean/approvals',
        label: 'Approvals',
        icon: 'pending_actions',
      },
    ];
  }, [isSecretary]);

  const lastUpdated = Math.max(
    schedUpdatedAt,
    reqUpdatedAt,
    facultyUpdatedAt,
    deptUpdatedAt,
    desUpdatedAt,
  );
  const refreshedLabel = isFetchingAny
    ? 'Refreshing…'
    : lastUpdated > 0
      ? `Updated ${relativeTime(new Date(lastUpdated).toISOString())}`
      : 'Ready';

  const clock = nowDate.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const dateLabel = nowDate.toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const attentionLoading =
    schedLoading || reqLoading || deptLoading || flaggedLoading;

  const statusItems = [
    {
      label: 'Published',
      value: statusCounts.published,
      dot: 'bg-emerald-500',
    },
    {
      label: 'Finalized',
      value: statusCounts.finalized,
      dot: 'bg-blue-500',
    },
    {
      label: 'In review',
      value: statusCounts.review,
      dot: 'bg-amber-500',
    },
    {
      label: 'Draft',
      value: statusCounts.draft,
      dot: 'bg-slate-400',
    },
  ];

  const workloadItems = [
    {
      label: 'Overloaded',
      value: workload.counts.overload,
      dot: 'bg-rose-500',
    },
    {
      label: 'Under-loaded',
      value: workload.counts.under,
      dot: 'bg-amber-500',
    },
    {
      label: 'On track',
      value: workload.counts.full,
      dot: 'bg-emerald-500',
    },
    {
      label: 'No load',
      value: workload.counts.idle,
      dot: 'bg-slate-400',
    },
  ];

  const coverageItems = [
    {
      label: 'Active',
      value: activeDepts.length,
      dot: 'bg-emerald-500',
    },
    {
      label: 'Inactive',
      value: inactiveDepts.length,
      dot: 'bg-rose-500',
    },
    {
      label: 'Heads online',
      value: onlineDHs,
      dot: 'bg-primary',
    },
    {
      label: 'No head',
      value: departmentsWithoutHead.length,
      dot: 'bg-amber-500',
    },
  ];

  return (
    <div className="space-y-4">
      {/* ── Compact masthead: college, term, live date/time ── */}
      <header
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        data-tour="dean-dash-header"
      >
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
            College dashboard
            {roleLabel ? ` · ${roleLabel}` : ''}
          </p>
          <h1 className="mt-1 truncate text-2xl font-extrabold tracking-tight text-on-surface">
            {greeting()}, {profile?.first_name || 'there'}
          </h1>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            {activeTerm
              ? `${activeTerm.termName} · ${activeTerm.schoolYear} · ${schedules.length} class blocks · ${activeDepts.length} active departments`
              : termLoading
                ? 'Loading the active term…'
                : 'No active term currently set.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="text-right">
            <p className="text-xl font-bold leading-none tabular-nums text-on-surface">
              <RollingNumber value={clock} />
            </p>
            <p className="mt-1 text-[11px] leading-none text-on-surface-variant">
              <RollingText value={dateLabel} />
            </p>
            <p className="mt-1 text-[10px] leading-none text-on-surface-variant/70">
              <RollingText value={refreshedLabel} />
            </p>
          </div>

          <div className="hidden h-9 w-px bg-outline-variant sm:block" />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshAll}
              disabled={isFetchingAny}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant bg-surface text-on-surface-variant transition hover:bg-surface-container-low disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              title="Refresh dashboard"
              aria-label="Refresh dashboard"
            >
              <Icon
                name="refresh"
                size={16}
                className={isFetchingAny ? 'animate-spin' : ''}
              />
            </button>
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant bg-surface text-on-surface-variant transition hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              title="Open public portal"
              aria-label="Open public portal"
            >
              <Icon name="open_in_new" size={16} />
            </a>
            <Link
              to="/dean/system-settings#academic-terms"
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-low"
            >
              <Icon name="calendar_month" size={14} />
              Terms
            </Link>
            {canApprove && (
              <Link
                to="/dean/system-settings?newTerm=1"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90"
              >
                <Icon name="add" size={14} />
                New term
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Four essentials at a glance ── */}
      <div
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-outline-variant bg-outline-variant/50 shadow-sm md:grid-cols-4"
        data-tour="dean-dash-stats"
      >
        <SummaryCard
          icon="corporate_fare"
          label="Active departments"
          value={activeDepts.length}
          hint={
            inactiveDepts.length > 0
              ? `${departments.length} total · ${inactiveDepts.length} inactive`
              : `${departments.length} total`
          }
          isLoading={deptLoading}
          onClick={() => navigate('/dean/departments')}
        />
        <SummaryCard
          icon="view_timeline"
          label="Class blocks"
          value={schedules.length}
          hint={
            schedules.length > 0
              ? `${finalizedSchedules.length} finalized or published`
              : 'Nothing plotted yet'
          }
          isLoading={schedLoading}
          onClick={() => navigate('/dean/timetable')}
        />
        <SummaryCard
          icon="group"
          label="Faculty"
          value={faculty.length}
          hint={
            statusLoading
              ? 'Checking qualifications…'
              : `${qualifiedCount} with qualifications`
          }
          isLoading={facultyLoading}
          onClick={() => navigate('/dean/faculty')}
        />
        <SummaryCard
          icon="notification_important"
          label="Needs attention"
          value={attentionCount}
          hint={attentionHint}
          tone={attentionCount > 0 ? 'warning' : 'success'}
          isLoading={attentionLoading}
          onClick={() =>
            document
              .getElementById('dean-dash-attention')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        />
      </div>

      {/* ── Report cards ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <ReportCard
            title="Schedule progress"
            subtitle="Status of this term's class blocks"
            to="/dean/timetable"
            linkLabel="Timetable"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold leading-none tabular-nums text-on-surface">
                  <RollingNumber value={schedules.length} />
                </span>
                <span className="text-xs text-on-surface-variant">
                  class blocks
                </span>
              </div>
              <span className="text-xs font-semibold tabular-nums text-on-surface-variant">
                <RollingValue value={`${completionRate}% complete`} />
              </span>
            </div>

            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-container">
              {schedules.length > 0 && (
                <>
                  <span
                    className="bg-emerald-500"
                    style={{
                      width: `${(statusCounts.published / schedules.length) * 100}%`,
                    }}
                  />
                  <span
                    className="bg-blue-500"
                    style={{
                      width: `${(statusCounts.finalized / schedules.length) * 100}%`,
                    }}
                  />
                  <span
                    className="bg-amber-500"
                    style={{
                      width: `${(statusCounts.review / schedules.length) * 100}%`,
                    }}
                  />
                  <span
                    className="bg-slate-400"
                    style={{
                      width: `${(statusCounts.draft / schedules.length) * 100}%`,
                    }}
                  />
                </>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {statusItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-1.5 text-[11px]"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.dot}`}
                    aria-hidden="true"
                  />
                  <span className="truncate text-on-surface-variant">
                    {item.label}
                  </span>
                  <span className="ml-auto font-semibold tabular-nums text-on-surface">
                    <RollingNumber value={item.value} />
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/60 pt-3 text-[11px] text-on-surface-variant">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="today" size={12} />
                {dayInsight.classesToday} today
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="trending_up" size={12} />
                {dayInsight.busiest
                  ? `Busiest · ${dayInsight.busiest.day} (${dayInsight.busiest.count})`
                  : 'No day distribution yet'}
              </span>
            </div>
          </ReportCard>
        </div>

        <div className="lg:col-span-4">
          <ReportCard
            title="Faculty workload"
            subtitle="Assigned load vs. required hours"
            to={isSecretary ? '/dean/faculty' : '/dean/reports/workload'}
            linkLabel={isSecretary ? 'Faculty' : 'Workload report'}
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold leading-none tabular-nums text-on-surface">
                <RollingNumber value={faculty.length} />
              </span>
              <span className="text-xs text-on-surface-variant">
                active faculty
              </span>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-on-surface-variant">
                  Qualifications on file
                </span>
                <span className="font-semibold tabular-nums text-on-surface">
                  <RollingValue
                    value={
                      statusLoading
                        ? '—'
                        : `${qualifiedCount}/${faculty.length}`
                    }
                  />
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-container">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${qualificationPct}%` }}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {workloadItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-2.5 py-2"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.dot}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold tabular-nums text-on-surface">
                    <RollingNumber value={item.value} />
                  </span>
                  <span className="truncate text-[10px] text-on-surface-variant">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[11px] leading-snug text-on-surface-variant">
              {!activeTerm ? (
                'No active term — assigned load will appear once a term is active.'
              ) : faculty.length === 0 ? (
                'No active faculty records for the college.'
              ) : workload.needsReview.length > 0 ? (
                <>
                  <span className="font-semibold text-on-surface">
                    {workload.needsReview.map((r) => r.name).join(', ')}
                  </span>{' '}
                  need{workload.needsReview.length === 1 ? 's' : ''} load
                  review.
                </>
              ) : (
                'All faculty are within their load bands.'
              )}
            </p>
          </ReportCard>
        </div>

        <div className="lg:col-span-4">
          <ReportCard
            title="Department coverage"
            subtitle="Active departments and assigned heads"
            to="/dean/departments"
            linkLabel="Departments"
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold leading-none tabular-nums text-on-surface">
                <RollingNumber value={activeDepts.length} />
              </span>
              <span className="text-xs text-on-surface-variant">
                active departments
              </span>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-on-surface-variant">Heads assigned</span>
                <span className="font-semibold tabular-nums text-on-surface">
                  <RollingValue
                    value={`${activeWithHead}/${activeDepts.length}`}
                  />
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-container">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${headsPct}%` }}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {coverageItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-2.5 py-2"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.dot}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold tabular-nums text-on-surface">
                    <RollingNumber value={item.value} />
                  </span>
                  <span className="truncate text-[10px] text-on-surface-variant">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[11px] leading-snug text-on-surface-variant">
              {departmentsWithoutHead.length > 0 ? (
                <>
                  <span className="font-semibold text-on-surface">
                    {departmentsWithoutHead
                      .map((dept) => dept.deptCode)
                      .join(', ')}
                  </span>{' '}
                  need{departmentsWithoutHead.length === 1 ? 's' : ''} a
                  department head.
                </>
              ) : (
                'Every active department has a head assigned.'
              )}
            </p>
          </ReportCard>
        </div>
      </div>

      {/* ── Attention + today ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section
          id="dean-dash-attention"
          className="flex scroll-mt-4 flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm lg:col-span-7"
        >
          <header className="flex items-start justify-between gap-3 border-b border-outline-variant/70 px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-on-surface">
                Needs attention
              </h2>
              <p className="mt-0.5 text-[11px] text-on-surface-variant">
                {attentionCount > 0
                  ? `${attentionCount} item${
                      attentionCount === 1 ? '' : 's'
                    } to review`
                  : 'Flagged classes, unassigned blocks, and pending requests'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {attentionCount > 0 && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-800">
                  <RollingNumber value={attentionCount} />
                </span>
              )}
              {reviewSchedules.length > 0 && (
                <Link
                  to={approvalsPath}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  {canApprove ? 'Review all' : 'View all'}
                </Link>
              )}
            </div>
          </header>

          {attentionLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 py-12 text-xs text-on-surface-variant">
              <Icon
                name="progress_activity"
                size={14}
                className="animate-spin"
              />
              Checking the college…
            </div>
          ) : attentionItems.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
              <Icon
                name="check_circle"
                size={22}
                className="text-emerald-500"
              />
              <p className="text-sm font-medium text-on-surface">
                Nothing needs attention
              </p>
              <p className="text-[11px] text-on-surface-variant">
                Every class block is assigned and no requests are waiting.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant/50">
              {attentionItems.map((item) => (
                <li key={item.key}>
                  <Link
                    to={item.to}
                    className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-container-low focus:outline-none focus-visible:bg-surface-container-low"
                  >
                    <Icon
                      name={item.icon}
                      size={14}
                      className={`mt-0.5 shrink-0 ${item.color}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-on-surface">
                        {item.title}
                      </span>
                      {item.detail && (
                        <span className="mt-0.5 block truncate text-[11px] text-on-surface-variant">
                          {item.detail}
                        </span>
                      )}
                    </span>
                    <Icon
                      name="chevron_right"
                      size={14}
                      className="mt-0.5 shrink-0 text-on-surface-variant/50"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="lg:col-span-5">
          <TodayScheduleStrip
            schedules={schedules}
            now={nowDate}
            onOpenTimetable={() => navigate('/dean/timetable')}
            emptyHint="Nothing scheduled college-wide today."
          />
        </div>
      </div>

      {/* ── Departments + review queue ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section
          className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm lg:col-span-7"
          data-tour="dean-dash-departments"
        >
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/70 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-on-surface">Departments</h2>
              <p className="mt-0.5 text-[11px] text-on-surface-variant">
                {activeDepts.length} active · {inactiveDepts.length} inactive ·{' '}
                {onlineDHs} head{onlineDHs === 1 ? '' : 's'} online
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isConnected
                      ? 'animate-pulse bg-emerald-500'
                      : 'bg-slate-300'
                  }`}
                />
                {isConnected ? 'Presence live' : 'Presence offline'}
              </span>
              <Link
                to="/dean/departments"
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                Manage
              </Link>
            </div>
          </header>

          {deptLoading || dirLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-on-surface-variant">
              <Icon
                name="progress_activity"
                size={14}
                className="animate-spin"
              />
              Loading departments…
            </div>
          ) : deptsWithHeads.length === 0 ? (
            <div className="py-12 text-center text-sm text-on-surface-variant">
              No departments configured.
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/60">
              {deptsWithHeads.map(({ dept, head, isOnline }) => {
                const deptStats = deptScheduleStats.get(String(dept.deptId));
                const pct =
                  deptStats && deptStats.total > 0
                    ? Math.round((deptStats.completed / deptStats.total) * 100)
                    : 0;
                return (
                  <div
                    key={dept.deptId}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-container-low"
                  >
                    <div className="relative shrink-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container text-[10px] font-bold text-on-surface">
                        {head ? (
                          initials(head.username)
                        ) : (
                          <Icon name="person_off" size={15} />
                        )}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${
                          !dept.isActive
                            ? 'bg-rose-400'
                            : isOnline
                              ? 'animate-pulse bg-emerald-500'
                              : 'bg-slate-300'
                        }`}
                        title={
                          !dept.isActive
                            ? 'Deactivated'
                            : isOnline
                              ? 'Online'
                              : 'Offline'
                        }
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <p className="truncate text-sm font-semibold text-on-surface">
                          {dept.deptName}
                        </p>
                        <span className="rounded border border-outline-variant bg-surface-container-low px-1.5 py-0.5 text-[10px] font-bold text-on-surface-variant">
                          {dept.deptCode}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">
                        {head ? `Head: ${head.username}` : 'No head assigned'}
                        {!dept.isActive && ' · Deactivated'}
                      </p>
                      {head && !isOnline && (
                        <p className="mt-0.5 text-[10px] text-on-surface-variant/80">
                          {formatLastSeen(head.last_seen_at, now)}
                        </p>
                      )}
                    </div>

                    <div className="hidden w-24 shrink-0 sm:block">
                      <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
                        <span>
                          {deptStats
                            ? `${deptStats.completed}/${deptStats.total}`
                            : '—'}
                        </span>
                        <span>{pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-container">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            pct >= 100
                              ? 'bg-emerald-500'
                              : pct >= 50
                                ? 'bg-blue-500'
                                : 'bg-amber-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        !dept.isActive
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : isOnline
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-outline-variant bg-surface-container-low text-on-surface-variant'
                      }`}
                    >
                      {!dept.isActive
                        ? 'Inactive'
                        : isOnline
                          ? 'Online'
                          : 'Offline'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="flex flex-col gap-4 lg:col-span-5">
          {/* Review queue */}
          <section className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/70 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-on-surface">
                  {canApprove ? 'Pending approvals' : 'Schedules in review'}
                </h2>
                <p className="mt-0.5 text-[11px] text-on-surface-variant">
                  {canApprove
                    ? 'Department submissions waiting for a decision'
                    : 'Read-only view of the college review queue'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {reviewSchedules.length > 0 && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-800">
                    {reviewSchedules.length}
                  </span>
                )}
                {reviewSchedules.length > 0 && (
                  <Link
                    to={approvalsPath}
                    className="text-[11px] font-semibold text-primary hover:underline"
                  >
                    {canApprove ? 'Review all' : 'View all'}
                  </Link>
                )}
              </div>
            </header>

            {schedLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-on-surface-variant">
                <Icon
                  name="progress_activity"
                  size={14}
                  className="animate-spin"
                />
                Loading queue…
              </div>
            ) : reviewSchedules.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                <Icon
                  name="check_circle"
                  size={22}
                  className="text-emerald-500"
                />
                <p className="text-sm font-medium text-on-surface">
                  All caught up
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  No schedules pending review.
                </p>
              </div>
            ) : (
              <div className="max-h-64 divide-y divide-outline-variant/50 overflow-y-auto">
                {reviewSchedules.slice(0, 5).map((schedule) => (
                  <Link
                    key={schedule.scheduleId}
                    to={
                      canApprove
                        ? approvalsPath
                        : `/dean/timetable?focus=${schedule.scheduleId}`
                    }
                    className="block px-4 py-2.5 transition-colors hover:bg-surface-container-low"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-on-surface">
                        {schedule.subject?.subjectCode ?? 'Unknown subject'}
                      </p>
                      <span className="shrink-0 rounded border border-outline-variant bg-surface-container-low px-1.5 py-0.5 text-[10px] font-bold text-on-surface-variant">
                        {deptCodeFor(schedule.subject?.deptId)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">
                      {[
                        schedule.faculty
                          ? `${schedule.faculty.firstName} ${schedule.faculty.lastName}`
                          : 'No faculty',
                        scheduleWhen(schedule),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Faculty requests */}
          <section className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/70 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-on-surface">
                  Faculty requests
                </h2>
                <p className="mt-0.5 text-[11px] text-on-surface-variant">
                  Cross-department requests awaiting a response
                </p>
              </div>
              <div className="flex items-center gap-2">
                {pendingRequests.length > 0 && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-800">
                    {pendingRequests.length}
                  </span>
                )}
                {pendingRequests.length > 0 && (
                  <Link
                    to="/dean/requests"
                    className="text-[11px] font-semibold text-primary hover:underline"
                  >
                    View all
                  </Link>
                )}
              </div>
            </header>

            {reqLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-on-surface-variant">
                <Icon
                  name="progress_activity"
                  size={14}
                  className="animate-spin"
                />
                Loading requests…
              </div>
            ) : pendingRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                <Icon
                  name="check_circle"
                  size={22}
                  className="text-emerald-500"
                />
                <p className="text-sm font-medium text-on-surface">
                  No pending requests
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  Cross-department faculty requests will appear here.
                </p>
              </div>
            ) : (
              <div className="max-h-56 divide-y divide-outline-variant/50 overflow-y-auto">
                {pendingRequests.slice(0, 5).map((request) => (
                  <Link
                    key={request.requestId}
                    to="/dean/requests"
                    className="block px-4 py-2.5 transition-colors hover:bg-surface-container-low"
                  >
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-on-surface-variant">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">
                        {deptCodeFor(request.requestingDeptId)}
                      </span>
                      <Icon name="arrow_forward" size={10} />
                      <span className="rounded bg-surface-container px-1.5 py-0.5 font-mono">
                        {deptCodeFor(request.targetDeptId)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-on-surface">
                      {request.reason}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Quick links */}
          <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
            <header className="border-b border-outline-variant/70 px-4 py-3">
              <h2 className="text-sm font-bold text-on-surface">Quick links</h2>
              <p className="mt-0.5 text-[11px] text-on-surface-variant">
                Common college tasks
              </p>
            </header>
            <div className="grid grid-cols-2 gap-1.5 p-3">
              {quickLinks.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-2 text-[11px] font-semibold text-on-surface transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Icon
                    name={item.icon}
                    size={14}
                    className="text-on-surface-variant transition-colors group-hover:text-primary"
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* ── Recent activity ── */}
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <header className="flex items-center justify-between gap-3 border-b border-outline-variant/70 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-on-surface">
              Recent activity
            </h2>
            <p className="mt-0.5 text-[11px] text-on-surface-variant">
              Latest faculty requests across the college
            </p>
          </div>
          {recentActivity.length > 0 && (
            <Link
              to="/dean/requests"
              className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
            >
              View all
            </Link>
          )}
        </header>

        {reqLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-on-surface-variant">
            <Icon name="progress_activity" size={14} className="animate-spin" />
            Loading activity…
          </div>
        ) : recentActivity.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
            <Icon name="inbox" size={20} className="text-on-surface-variant" />
            <p className="text-xs font-medium text-on-surface">
              No recent activity
            </p>
            <p className="text-[11px] text-on-surface-variant">
              Faculty requests will appear here once they are created.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/50">
            {recentActivity.map((request) => {
              const tone =
                request.status === 'approved'
                  ? 'bg-emerald-500'
                  : request.status === 'rejected'
                    ? 'bg-rose-500'
                    : request.status === 'cancelled'
                      ? 'bg-slate-400'
                      : 'bg-amber-500';

              return (
                <li
                  key={request.requestId}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone}`}
                    aria-hidden="true"
                  />
                  <p className="min-w-0 flex-1 truncate text-xs text-on-surface-variant">
                    <span className="font-semibold capitalize text-on-surface">
                      {request.status}
                    </span>
                    <span aria-hidden="true"> · </span>
                    {request.reason}
                  </p>
                  <span className="shrink-0 text-[10px] tabular-nums text-on-surface-variant">
                    {relativeTime(request.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
