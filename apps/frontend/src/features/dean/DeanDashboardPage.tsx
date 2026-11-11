import { useMemo } from 'react';
import {
  useIsFetching,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchDepartments } from '../../api/departments.api';
import { fetchSchedules, fetchActiveTerm } from '../../api/schedule.api';
import { fetchUserDirectory } from '../../api/users.api';
import { fetchStatsOverview } from '../../api/stats.api';
import { fetchFacultyRequests } from '../../api/faculty-requests.api';
import Icon from '../../components/ui/Icon';
import { useAuthStore } from '../../store/auth.store';
import { useOnlineUsers } from '../../hooks/use-online-users';
import { useNow } from '../../hooks/use-now';
import { formatLastSeen } from '../../lib/utils/format.util';
import { DashboardHeader } from '../dashboard/components';
import {
  DAY_FULL_NAMES,
  greeting,
  humanizeRole,
  scheduleDay,
} from '../dashboard/utils/dashboard.utils';

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

function initials(username: string): string {
  if (!username) return '—';
  return username.slice(0, 2).toUpperCase();
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color = 'brand',
  to,
  actionLabel,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  color?: 'brand' | 'green' | 'amber' | 'blue';
  to?: string;
  actionLabel?: string;
}) {
  const colors = {
    brand: 'bg-primary/10 border-primary/20 text-primary',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
  };

  const inner = (
    <>
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg border ${colors[color]}`}
      >
        <Icon name={icon} filled size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
          {label}
        </p>
        <p className="mt-0.5 text-3xl font-extrabold tracking-tight text-on-surface tabular-nums">
          {value}
        </p>
        {sub && (
          <p className="mt-1 text-xs leading-snug text-on-surface-variant">
            {sub}
          </p>
        )}
      </div>
    </>
  );

  const className =
    'group flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface p-5 shadow-sm transition' +
    (to
      ? ' cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
      : '');

  if (to) {
    return (
      <Link to={to} className={className} title={actionLabel ?? label}>
        {inner}
        <span className="mt-auto flex items-center gap-1 text-[10px] font-semibold text-primary opacity-0 transition group-hover:opacity-100">
          {actionLabel ?? 'View'}
          <Icon name="arrow_forward" size={11} />
        </span>
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}

export default function DeanDashboardPage() {
  const profile = useAuthStore((s) => s.profile);
  const qc = useQueryClient();

  const role = profile?.role;
  const isSecretary = role === 'college_secretary';
  const canApprove = role === 'college_dean' || role === 'administrator';
  const roleLabel = role ? humanizeRole(role) : undefined;
  const approvalsPath = canApprove ? '/dean/approvals' : '/dean/timetable';

  // ALL departments (active + inactive) — the dashboard needs the full
  // list to (a) show the correct "X total" count, (b) show "N deactivated"
  // hint, and (c) render the heads list for deactivated depts too.
  // The "Active Departments" stat filters `activeDepts` downstream.
  const { data: departments = [], isLoading: deptLoading } = useQuery({
    queryKey: ['departments', { includeInactive: true }],
    queryFn: () => fetchDepartments(true),
  });

  const { data: directory = [] } = useQuery({
    queryKey: ['users', 'directory'],
    queryFn: fetchUserDirectory,
    refetchInterval: 60_000,
  });

  const { data: activeTerm } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ['schedules', activeTerm?.termId],
    queryFn: () => fetchSchedules(activeTerm?.termId),
    enabled: !!activeTerm?.termId,
  });

  const { data: stats } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: fetchStatsOverview,
  });

  const { data: facultyRequests = [] } = useQuery({
    queryKey: ['faculty-requests'],
    queryFn: fetchFacultyRequests,
  });

  const { onlineUsers, isConnected } = useOnlineUsers();
  const now = useNow();

  const isFetchingAny =
    useIsFetching({
      predicate: (query) =>
        [
          'departments',
          'users',
          'active-term',
          'schedules',
          'stats',
          'faculty-requests',
        ].includes(String(query.queryKey[0])),
    }) > 0;

  const refreshAll = () => {
    for (const key of [
      'departments',
      'users',
      'active-term',
      'schedules',
      'stats',
      'faculty-requests',
    ]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };

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

  const todayName = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
  });

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
        {
          to: '/dean/requests',
          label: 'Requests',
          icon: 'swap_horiz',
        },
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
      activeDepts.map((dept) => {
        const head = deptHeads.find(
          (u) => String(u.dept_id) === String(dept.deptId),
        );
        return {
          dept,
          head,
          isOnline: head ? onlineUserIds.has(head.user_id) : false,
        };
      }),
    [activeDepts, deptHeads, onlineUserIds],
  );

  const onlineDHs = deptsWithHeads.filter((x) => x.isOnline).length;

  const deptCode = (id: string) =>
    departments.find((d) => String(d.deptId) === String(id))?.deptCode ??
    `#${id}`;

  const attentionParts = [
    reviewSchedules.length > 0
      ? `${reviewSchedules.length} schedule${
          reviewSchedules.length === 1 ? '' : 's'
        } awaiting approval`
      : null,
    pendingRequests.length > 0
      ? `${pendingRequests.length} faculty request${
          pendingRequests.length === 1 ? '' : 's'
        } pending`
      : null,
    inactiveDepts.length > 0
      ? `${inactiveDepts.length} department${
          inactiveDepts.length === 1 ? '' : 's'
        } deactivated`
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <DashboardHeader
        tourId="dean-dash-header"
        eyebrow="College overview"
        roleLabel={roleLabel}
        title={`${greeting()}, ${profile?.first_name || 'there'}`}
        subtitle={
          activeTerm
            ? `${activeTerm.termName} · ${activeTerm.schoolYear} · ${schedules.length} class blocks · ${activeDepts.length} active departments`
            : 'No active term currently set.'
        }
        status={
          <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3 py-1.5 shadow-sm">
            <span
              className="flex items-center gap-1.5 font-mono text-[11px] text-on-surface-variant"
              aria-live="polite"
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  isFetchingAny ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                }`}
              />
              <Icon name="schedule" size={12} />
              {isFetchingAny ? 'Refreshing…' : 'Live data'}
            </span>
            <button
              type="button"
              onClick={refreshAll}
              disabled={isFetchingAny}
              className="rounded-md p-1.5 text-on-surface-variant transition hover:bg-surface-container disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              title="Refresh dashboard"
              aria-label="Refresh dashboard"
            >
              <Icon
                name="refresh"
                size={14}
                className={isFetchingAny ? 'animate-spin' : ''}
              />
            </button>
          </div>
        }
        actions={
          <>
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container"
            >
              <Icon name="open_in_new" size={15} />
              Public portal
            </a>
            <Link
              to="/dean/system-settings#academic-terms"
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container"
            >
              <Icon name="calendar_month" size={15} />
              Manage terms
            </Link>
            <Link
              to="/dean/system-settings?newTerm=1"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90"
            >
              <Icon name="add" size={15} />
              New term
            </Link>
          </>
        }
      />

      {attentionParts.length > 0 && (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Icon name="warning" size={18} filled />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-900">Needs attention</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
              {attentionParts.join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {reviewSchedules.length > 0 && (
              <Link
                to={approvalsPath}
                className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800"
              >
                {canApprove ? 'Review approvals' : 'View review queue'}
              </Link>
            )}
            {pendingRequests.length > 0 && (
              <Link
                to="/dean/requests"
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
              >
                Review requests
              </Link>
            )}
            {inactiveDepts.length > 0 && (
              <Link
                to="/dean/departments"
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
              >
                Manage departments
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div
        className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6"
        data-tour="dean-dash-stats"
      >
        <StatCard
          icon="corporate_fare"
          label="Active Departments"
          value={deptLoading ? '—' : activeDepts.length}
          sub={
            inactiveDepts.length > 0
              ? `${departments.length} total · ${inactiveDepts.length} inactive`
              : `${departments.length} total`
          }
          color="brand"
          to="/dean/departments"
        />
        <StatCard
          icon="pending_actions"
          label={canApprove ? 'Pending Approvals' : 'Schedules in Review'}
          value={reviewSchedules.length}
          sub={
            reviewSchedules.length > 0
              ? canApprove
                ? 'Waiting for your decision'
                : 'Read-only view'
              : 'Nothing in review'
          }
          color={reviewSchedules.length > 0 ? 'amber' : 'green'}
          to={approvalsPath}
          actionLabel={canApprove ? 'Review' : 'View'}
        />
        <StatCard
          icon="check_circle"
          label="Finalized Schedules"
          value={finalizedSchedules.length}
          sub={activeTerm ? `For ${activeTerm.termName}` : '—'}
          color="green"
          to="/dean/reports/approvals"
        />
        <StatCard
          icon="publish"
          label="Published Schedules"
          value={publishedSchedules.length}
          sub="Visible on the public portal"
          color="green"
          to="/dean/timetable"
        />
        <StatCard
          icon="groups"
          label="Active Faculty"
          value={stats?.activeFaculty ?? '—'}
          sub={`${stats?.activeDepartments ?? '—'} departments`}
          color="blue"
          to="/dean/faculty"
        />
        <StatCard
          icon="swap_horiz"
          label="Faculty Requests"
          value={pendingRequests.length}
          sub={
            pendingRequests.length > 0
              ? 'Cross-department, pending'
              : 'No pending requests'
          }
          color={pendingRequests.length > 0 ? 'amber' : 'blue'}
          to="/dean/requests"
          actionLabel="Open requests"
        />
      </div>

      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        data-tour="dean-dash-progress"
      >
        <div className="rounded-xl border border-outline-variant bg-surface shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/70 px-5 py-4">
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-on-surface">
                Schedule Progress
              </h2>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                Active term · {schedules.length} class blocks
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-outline-variant bg-surface-container-low px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant">
                {dayInsight.classesToday} today
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                {completionRate}% complete
              </span>
            </div>
          </div>
          <div className="space-y-4 p-5">
            {[
              {
                label: 'Published',
                count: statusCounts.published,
                tone: 'bg-emerald-500',
              },
              {
                label: 'Finalized',
                count: statusCounts.finalized,
                tone: 'bg-blue-500',
              },
              {
                label: 'In review',
                count: statusCounts.review,
                tone: 'bg-amber-500',
              },
              {
                label: 'Draft',
                count: statusCounts.draft,
                tone: 'bg-slate-400',
              },
            ].map((row) => {
              const pct =
                schedules.length > 0
                  ? Math.round((row.count / schedules.length) * 100)
                  : 0;
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-on-surface">
                      {row.label}
                    </span>
                    <span className="text-on-surface-variant tabular-nums">
                      {row.count} · {pct}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-container">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${row.tone}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/70 pt-3 text-sm">
              <span className="text-on-surface-variant">Total class blocks</span>
              <strong className="text-on-surface tabular-nums">
                {schedules.length}
              </strong>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-on-surface-variant">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="today" size={13} />
                Today · {dayInsight.classesToday} class
                {dayInsight.classesToday === 1 ? '' : 'es'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="trending_up" size={13} />
                {dayInsight.busiest
                  ? `Busiest · ${dayInsight.busiest.day} (${dayInsight.busiest.count})`
                  : 'No day distribution yet'}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface shadow-sm">
          <div className="border-b border-outline-variant/70 px-5 py-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-on-surface">
              Quick Links
            </h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              Common {isSecretary ? 'secretary' : 'college-level'} tasks
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 p-4">
            {quickLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-xs font-semibold text-on-surface transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Icon
                  name={item.icon}
                  size={15}
                  className="text-on-surface-variant transition-colors group-hover:text-primary"
                />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Departments list */}
        <div
          className="rounded-xl border border-outline-variant bg-surface shadow-sm lg:col-span-2"
          data-tour="dean-dash-departments"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/70 px-5 py-4">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-on-surface">
              Active Departments
            </h2>
            <div className="flex items-center gap-3 text-xs text-on-surface-variant">
              <span>{activeDepts.length} active</span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                {onlineDHs} online
              </span>
            </div>
          </div>
          {deptLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : activeDepts.length === 0 ? (
            <div className="py-12 text-center text-sm text-on-surface-variant">
              No active departments.
              {inactiveDepts.length > 0 && (
                <Link
                  to="/dean/departments"
                  className="mt-2 block text-xs text-primary hover:underline"
                >
                  View {inactiveDepts.length} deactivated department
                  {inactiveDepts.length === 1 ? '' : 's'} →
                </Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/70">
              {deptsWithHeads.map(({ dept, head, isOnline }) => {
                const workload = deptScheduleStats.get(String(dept.deptId));
                const pct =
                  workload && workload.total > 0
                    ? Math.round((workload.completed / workload.total) * 100)
                    : 0;
                return (
                  <div
                    key={dept.deptId}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-surface-container-low"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                          isOnline
                            ? 'animate-pulse bg-emerald-500'
                            : 'bg-slate-300'
                        }`}
                        title={isOnline ? 'Online' : 'Offline'}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-on-surface">
                          {dept.deptName}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-on-surface-variant">
                          {dept.deptCode}
                          {head
                            ? ` · Head: ${head.username}`
                            : ' · No head assigned'}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-container">
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
                          <span className="text-[10px] text-on-surface-variant tabular-nums">
                            {workload
                              ? `${workload.completed}/${workload.total} · ${pct}%`
                              : 'No class blocks yet'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                        isOnline
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-outline-variant bg-surface-container-low text-on-surface-variant'
                      }`}
                    >
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {/* Pending Approvals */}
          <div className="flex flex-col rounded-xl border border-outline-variant bg-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/70 px-5 py-4">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-on-surface">
                {canApprove ? 'Pending Approvals' : 'Schedules in Review'}
              </h2>
              <div className="flex items-center gap-2">
                {reviewSchedules.length > 0 && (
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                    {reviewSchedules.length} pending
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
            </div>
            {reviewSchedules.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-5 py-12 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50">
                  <Icon name="check_circle" filled className="text-emerald-600" />
                </div>
                <p className="text-sm font-semibold text-on-surface">
                  All caught up
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  No schedules pending review.
                </p>
              </div>
            ) : (
              <div className="max-h-72 divide-y divide-outline-variant/70 overflow-y-auto">
                {reviewSchedules.slice(0, 10).map((s) => {
                  const dept = departments.find(
                    (d) => String(d.deptId) === String(s.subject?.deptId),
                  );
                  return (
                    <div
                      key={s.scheduleId}
                      className="px-5 py-3 transition-colors hover:bg-surface-container-low"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-on-surface">
                          {s.subject?.subjectCode ?? 'Unknown Subject'}
                        </p>
                        <span className="shrink-0 rounded border border-outline-variant bg-surface-container-low px-1.5 py-0.5 text-[10px] font-bold text-on-surface-variant">
                          {dept?.deptCode ?? '—'}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-on-surface-variant">
                        {s.faculty
                          ? `${s.faculty.firstName} ${s.faculty.lastName}`
                          : 'No faculty'}{' '}
                        · {s.timeSlot?.dayOfWeek ?? s.dayOfWeek ?? '—'}{' '}
                        {s.timeSlot?.startTime ?? s.startTime ?? ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Faculty Requests */}
          <div className="flex flex-col rounded-xl border border-outline-variant bg-surface shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/70 px-5 py-4">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-on-surface">
                Faculty Requests
              </h2>
              <div className="flex items-center gap-2">
                {pendingRequests.length > 0 && (
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                    {pendingRequests.length} pending
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
            </div>
            {pendingRequests.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50">
                  <Icon name="check_circle" filled className="text-emerald-600" />
                </div>
                <p className="text-sm font-semibold text-on-surface">
                  No pending requests
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Cross-department faculty requests will appear here.
                </p>
              </div>
            ) : (
              <div className="max-h-60 divide-y divide-outline-variant/70 overflow-y-auto">
                {pendingRequests.slice(0, 5).map((request) => (
                  <Link
                    key={request.requestId}
                    to="/dean/requests"
                    className="block px-5 py-3 transition-colors hover:bg-surface-container-low"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-on-surface-variant">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-primary">
                        {deptCode(request.requestingDeptId)}
                      </span>
                      <Icon name="arrow_forward" size={11} />
                      <span className="rounded bg-surface-container px-1.5 py-0.5 font-mono">
                        {deptCode(request.targetDeptId)}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-on-surface">
                      {request.reason}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Department Heads Online */}
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isConnected ? 'animate-pulse bg-emerald-500' : 'bg-slate-300'
              }`}
            />
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-on-surface">
              Department Heads Online
            </h2>
          </div>
          <span className="text-xs text-on-surface-variant">
            {onlineDHs} of {deptHeads.length} online
          </span>
        </div>

        {deptHeads.length === 0 ? (
          <div className="py-12 text-center text-sm text-on-surface-variant">
            No department heads configured.
          </div>
        ) : (
          <div className="grid grid-cols-1 divide-y divide-outline-variant/70 md:grid-cols-2 md:divide-y-0">
            {deptHeads.map((head) => {
              const isOnline = onlineUserIds.has(head.user_id);
              const dept = departments.find(
                (d) => String(d.deptId) === String(head.dept_id),
              );
              const isInactive = dept && !dept.isActive;
              return (
                <div
                  key={head.user_id}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-container-low"
                >
                  <div className="relative shrink-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container text-xs font-bold text-on-surface">
                      {initials(head.username)}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${
                        isOnline && !isInactive
                          ? 'bg-emerald-500'
                          : 'bg-slate-300'
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-on-surface">
                      {head.username}
                      {head.user_id === profile?.user_id && (
                        <span className="ml-1.5 text-[10px] font-normal text-on-surface-variant">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-on-surface-variant">
                      {dept ? (
                        <>
                          [{dept.deptCode}] {dept.deptName}
                          {isInactive && (
                            <span className="ml-1.5 font-semibold text-rose-700">
                              · Deactivated
                            </span>
                          )}
                        </>
                      ) : (
                        'No department'
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        isInactive
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : isOnline
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-outline-variant bg-surface-container-low text-on-surface-variant'
                      }`}
                    >
                      {isInactive ? 'Walled' : isOnline ? 'Online' : 'Offline'}
                    </span>
                    {!isOnline && (
                      <p className="mt-0.5 text-[10px] font-medium text-on-surface-variant">
                        {formatLastSeen(head.last_seen_at, now)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
