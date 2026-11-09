import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { useDepartmentLabel } from '../../hooks/use-department-label';
import { useAuthStore } from '../../store/auth.store';
import { useOnlineUsers } from '../../hooks/use-online-users';
import {
  fetchSchedules,
  fetchActiveTerm,
  fetchFlagged,
  type RawSchedule,
} from '../../api/schedule.api';
import { fetchFacultyRequests } from '../../api/faculty-requests.api';
import { fetchDepartments } from '../../api/departments.api';
import { fetchUserDirectory } from '../../api/users.api';
import {
  QuickAction,
  SummaryCard,
  ActivityItem,
  BreakdownEmpty,
  TodayScheduleStrip,
  TermStatusCard,
  DepartmentSnapshot,
  DepartmentHeadsSection,
  UserDetailDrawer,
  SchedulesModal,
  TasksModal,
  CompletionModal,
  FlaggedModal,
} from './components';
import {
  greeting,
  relativeDay,
  relativeTime,
} from './utils/dashboard.utils';
import type { UserDirectoryRecord } from '../../api/users.api';

type BreakdownKind = 'schedules' | 'tasks' | 'completion' | 'flagged' | null;

export default function DashboardPage() {
  const { firstName, deptName } = useDepartmentLabel();
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;

  const [breakdown, setBreakdown] = useState<BreakdownKind>(null);
  const [drawerUser, setDrawerUser] = useState<UserDirectoryRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Ticks once a minute so greeting + Today strip stay current across
  // midnight / afternoon→evening transitions in long-lived tabs.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // ── Queries ──
  const { data: activeTerm } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
  });

  const {
    data: schedules = [],
    isLoading: schedLoading,
    isFetching: schedFetching,
    dataUpdatedAt: schedUpdatedAt,
  } = useQuery({
    queryKey: ['schedules', activeTerm?.termId],
    queryFn: () => fetchSchedules(activeTerm?.termId),
    enabled: !!activeTerm?.termId,
  });

  const {
    data: flagged = [],
    isLoading: flaggedLoading,
    isFetching: flaggedFetching,
    dataUpdatedAt: flaggedUpdatedAt,
  } = useQuery({
    queryKey: ['flagged', activeTerm?.termId],
    queryFn: () => fetchFlagged(activeTerm!.termId),
    enabled: !!activeTerm?.termId,
  });

  const {
    data: requests = [],
    isLoading: reqLoading,
    isFetching: reqFetching,
    dataUpdatedAt: reqUpdatedAt,
  } = useQuery({
    queryKey: ['faculty-requests'],
    queryFn: fetchFacultyRequests,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchDepartments(),
  });

  const { data: directory = [], isLoading: dirLoading } = useQuery({
    queryKey: ['users', 'directory'],
    queryFn: fetchUserDirectory,
  });

  const { onlineUsers, isConnected } = useOnlineUsers();

  const refreshAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['active-term'] });
    qc.invalidateQueries({ queryKey: ['schedules'] });
    qc.invalidateQueries({ queryKey: ['flagged'] });
    qc.invalidateQueries({ queryKey: ['faculty-requests'] });
  }, [qc]);

  const deptCode = useCallback(
    (id: string) =>
      departments.find((d) => String(d.deptId) === String(id))?.deptCode ??
      `#${id}`,
    [departments],
  );

  // ── Presence ──
  const onlineUserIds = useMemo(
    () => new Set(onlineUsers.map((u) => u.user_id)),
    [onlineUsers],
  );

  const otherDeptHeads = useMemo(
    () =>
      directory.filter(
        (u) =>
          u.role === 'department_head' &&
          u.is_active &&
          (!profile?.user_id || u.user_id !== profile.user_id),
      ),
    [directory, profile?.user_id],
  );

  // ── Filtered to my dept ──
  const mySchedules = useMemo(
    () =>
      schedules.filter(
        (s) => s.subject?.deptId && String(s.subject.deptId) === myDeptId,
      ),
    [schedules, myDeptId],
  );

  // ⚠️ Dept-scoped flagged (was previously org-wide)
  const myFlagged = useMemo(
    () =>
      flagged.filter(
        (s) => s.subject?.deptId && String(s.subject.deptId) === myDeptId,
      ),
    [flagged, myDeptId],
  );

  const myRequests = useMemo(
    () =>
      requests.filter((r) => {
        if (!myDeptId) return false;
        return (
          String(r.requestingDeptId) === myDeptId ||
          String(r.targetDeptId) === myDeptId
        );
      }),
    [requests, myDeptId],
  );

  const pendingIncoming = useMemo(
    () =>
      myRequests.filter(
        (r) => r.status === 'pending' && String(r.targetDeptId) === myDeptId,
      ),
    [myRequests, myDeptId],
  );

  // ── Metrics ──
  const totalSchedules = mySchedules.length;
  const byStatus = useMemo(
    () => ({
      draft: mySchedules.filter((s) => s.status === 'draft').length,
      review: mySchedules.filter((s) => s.status === 'review').length,
      finalized: mySchedules.filter((s) => s.status === 'finalized').length,
      published: mySchedules.filter((s) => s.status === 'published').length,
    }),
    [mySchedules],
  );
  const finalizedOrPublished = byStatus.finalized + byStatus.published;
  const completionRate =
    totalSchedules > 0
      ? Math.round((finalizedOrPublished / totalSchedules) * 100)
      : 0;
  const flaggedCount = myFlagged.length;

  const isLoading = schedLoading || reqLoading;
  const isFlaggedLoading = flaggedLoading;
  const isFetchingAny = schedFetching || reqFetching || flaggedFetching;

  const recentActivity = useMemo(
    () =>
      [...myRequests]
        .sort(
          (a, b) =>
            new Date(b.createdAt ?? 0).getTime() -
            new Date(a.createdAt ?? 0).getTime(),
        )
        .slice(0, 5),
    [myRequests],
  );

  const groupedActivity = useMemo(() => {
    const groups: Record<string, typeof recentActivity> = {};
    for (const item of recentActivity) {
      const key = relativeDay(item.createdAt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [recentActivity]);

  const handleOpenFlaggedEntry = (s: RawSchedule) => {
    navigate(`/timetable?focus=${s.scheduleId}`);
  };

  const openDrawer = (u: UserDirectoryRecord) => {
    setDrawerUser(u);
    setDrawerOpen(true);
  };
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Derive "updated X ago" from the freshest dashboard query — survives
  // background refetches correctly (vs. the old loading-transition effect).
  const lastUpdated = Math.max(schedUpdatedAt, flaggedUpdatedAt, reqUpdatedAt);
  const refreshedLabel = isFetchingAny
    ? 'Refreshing…'
    : lastUpdated > 0
    ? `Updated ${relativeTime(new Date(lastUpdated).toISOString())}`
    : 'Ready';

  return (
    <>
      {/* ── Header ── */}
      <div className="mb-6 mt-1 md:mt-0" data-tour="dash-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#5c1219] to-[#3d0b10] flex items-center justify-center shadow-sm shrink-0">
              <Icon name="dashboard" size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1">
                {greeting(now)}, {firstName}
              </h1>
              <p className="text-sm text-slate-500">
                Here is the current status of the{' '}
                <strong className="text-slate-700">{deptName}</strong> department
                schedule
                {activeTerm
                  ? ` ${activeTerm.termName} ${activeTerm.schoolYear}.`
                  : '.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
            <span
              className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5"
              aria-live="polite"
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  isFetchingAny ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                }`}
              />
              <Icon name="schedule" size={12} />
              {refreshedLabel}
            </span>
            <button
              onClick={refreshAll}
              disabled={isFetchingAny}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5c1219]/30"
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
        </div>
      </div>

      <TermStatusCard term={activeTerm} scheduleStatusCounts={byStatus} />

      {(pendingIncoming.length > 0 || flaggedCount > 0) && (
        <div className="mt-4 flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Icon name="warning" size={18} filled />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-900">
              Needs your attention
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              {pendingIncoming.length > 0 &&
                `${pendingIncoming.length} cross-department request${
                  pendingIncoming.length === 1 ? '' : 's'
                } waiting for your review`}
              {pendingIncoming.length > 0 && flaggedCount > 0 && ' · '}
              {flaggedCount > 0 &&
                `${flaggedCount} flagged entr${
                  flaggedCount === 1 ? 'y' : 'ies'
                } to check`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingIncoming.length > 0 && (
              <button
                type="button"
                onClick={() => setBreakdown('tasks')}
                className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800"
              >
                Review requests
              </button>
            )}
            {flaggedCount > 0 && (
              <button
                type="button"
                onClick={() => setBreakdown('flagged')}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
              >
                Review flagged
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Bento grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6 mt-4">
        <div
          className="md:col-span-4 bg-white border border-slate-200 p-5 shadow-sm rounded-xl flex flex-col"
          data-tour="dash-actions"
        >
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Icon name="bolt" size={14} className="text-amber-500" filled />
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-2.5 flex-1">
            <QuickAction
              icon="add_circle"
              label="New Schedule"
              accent="brand"
              onClick={() => navigate('/timetable')}
            />
            <QuickAction
              icon="task_alt"
              label="Tasks"
              accent="amber"
              badge={pendingIncoming.length}
              onClick={() => setBreakdown('tasks')}
            />
            <QuickAction
              icon="flag"
              label="Flagged"
              accent="rose"
              badge={flaggedCount}
              onClick={() => setBreakdown('flagged')}
            />
            <QuickAction
              icon="search"
              label="Search Faculty"
              accent="blue"
              onClick={() => navigate('/faculty')}
            />
            <QuickAction
              icon="calendar_view_month"
              label="Timetable"
              accent="emerald"
              onClick={() => navigate('/timetable')}
            />
            <QuickAction
              icon="bar_chart"
              label="Reports"
              accent="blue"
              onClick={() => navigate('/reports')}
            />
          </div>
        </div>

        <div
          className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          data-tour="dash-stats"
        >
          <SummaryCard
            icon="view_timeline"
            accent="blue"
            badge={activeTerm?.termName ?? 'No term'}
            badgeVariant="neutral"
            label="Active Schedules"
            value={String(totalSchedules)}
            isLoading={isLoading}
            clickable={!isLoading && totalSchedules > 0}
            onClick={() => setBreakdown('schedules')}
            hint={
              totalSchedules > 0
                ? `View all ${totalSchedules} schedule entries`
                : undefined
            }
            footer={
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  <span className="font-semibold text-slate-700">
                    {byStatus.draft}
                  </span>
                  <span>draft</span>
                </span>
                <span className="inline-flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="font-semibold text-amber-700">
                    {byStatus.review}
                  </span>
                  <span>review</span>
                </span>
              </div>
            }
          />
          <SummaryCard
            icon="checklist"
            accent="amber"
            badge={pendingIncoming.length > 0 ? 'Urgent' : 'Clear'}
            badgeVariant={pendingIncoming.length > 0 ? 'danger' : 'success'}
            label="Tasks to do"
            value={String(pendingIncoming.length)}
            isLoading={isLoading}
            clickable={!isLoading && pendingIncoming.length > 0}
            onClick={() => setBreakdown('tasks')}
            hint={
              pendingIncoming.length > 0
                ? `Review ${pendingIncoming.length} pending cross-dept requests`
                : 'No pending tasks'
            }
            footer={
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    pendingIncoming.length > 0
                      ? 'bg-amber-500 animate-pulse'
                      : 'bg-emerald-500'
                  }`}
                />
                <span className="text-xs text-slate-500">
                  {pendingIncoming.length > 0
                    ? `${pendingIncoming.length} request${
                        pendingIncoming.length === 1 ? '' : 's'
                      } pending`
                    : 'No pending requests'}
                </span>
              </div>
            }
          />
          <SummaryCard
            icon="donut_large"
            accent="brand"
            label="Completion Rate"
            value={`${completionRate}%`}
            isLoading={isLoading}
            clickable={!isLoading && totalSchedules > 0}
            onClick={() => setBreakdown('completion')}
            hint={
              totalSchedules > 0
                ? `${finalizedOrPublished} of ${totalSchedules} finalized or published`
                : undefined
            }
            footer={
              <div className="w-full">
                <div className="w-full bg-slate-100 h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-gradient-to-r from-[#5c1219] to-[#8b1e2a] h-2 transition-all duration-500 rounded-full"
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 text-right tabular-nums">
                  {finalizedOrPublished}/{totalSchedules} complete
                </p>
              </div>
            }
          />
          <SummaryCard
            icon="flag"
            accent="rose"
            badge={flaggedCount > 0 ? 'Action' : 'Clean'}
            badgeVariant={flaggedCount > 0 ? 'rose' : 'success'}
            label="Flagged for review"
            value={String(flaggedCount)}
            isLoading={isFlaggedLoading}
            clickable={!isFlaggedLoading && flaggedCount > 0}
            onClick={() => setBreakdown('flagged')}
            hint={
              flaggedCount > 0
                ? `${flaggedCount} entr${flaggedCount === 1 ? 'y' : 'ies'} need review`
                : 'Nothing flagged'
            }
            footer={
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    flaggedCount > 0 ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                />
                <span className="text-xs text-slate-500">
                  {flaggedCount > 0
                    ? `${flaggedCount} entr${
                        flaggedCount === 1 ? 'y' : 'ies'
                      } need review`
                    : 'Nothing flagged'}
                </span>
              </div>
            }
          />
        </div>
      </div>

      <DepartmentSnapshot schedules={mySchedules} />

      {/* ── Today + Recent Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-tour="dash-today">
        <div className="lg:col-span-1">
          <TodayScheduleStrip
            schedules={mySchedules}
            now={now}
            onOpenTimetable={() => navigate('/timetable')}
          />
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/80 to-white">
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Icon name="history" size={14} className="text-slate-400" />
              Recent Scheduling Activity
            </h3>
            {recentActivity.length > 0 && (
              <Link
                to="/approvals"
                className="text-xs font-semibold text-[#5c1219] hover:underline flex items-center gap-1"
              >
                View all
                <Icon name="arrow_forward" size={12} />
              </Link>
            )}
          </div>
          <div>
            {isLoading ? (
              <div className="py-14 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
                <Icon name="progress_activity" size={16} className="animate-spin" />
                Loading activity…
              </div>
            ) : recentActivity.length === 0 ? (
              <BreakdownEmpty
                icon="inbox"
                message="No recent activity in your department."
                actionLabel="Open Approvals"
                onAction={() => navigate('/approvals')}
              />
            ) : (
              Object.entries(groupedActivity).map(([group, items]) => (
                <div key={group}>
                  <div className="px-5 py-2 bg-slate-50/80 border-y border-slate-100">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {group}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map((r) => {
                      const isIncoming =
                        String(r.targetDeptId) === myDeptId &&
                        r.status === 'pending';
                      const isApproved = r.status === 'approved';
                      const isRejected = r.status === 'rejected';
                      const iconName = isApproved
                        ? 'check_circle'
                        : isRejected
                        ? 'cancel'
                        : 'pending_actions';
                      const iconBg = isApproved
                        ? 'bg-emerald-50'
                        : isRejected
                        ? 'bg-red-50'
                        : 'bg-amber-50';
                      const iconColor = isApproved
                        ? 'text-emerald-700'
                        : isRejected
                        ? 'text-red-700'
                        : 'text-amber-700';

                      return (
                        <ActivityItem
                          key={r.requestId}
                          icon={iconName}
                          iconBg={iconBg}
                          iconColor={iconColor}
                          text={
                            <>
                              <span className="font-mono font-bold">
                                {deptCode(r.requestingDeptId)}
                              </span>
                              {' → '}
                              <span className="font-mono font-bold">
                                {deptCode(r.targetDeptId)}
                              </span>
                              {' · '}
                              <span className="text-slate-600">{r.reason}</span>
                            </>
                          }
                          time={relativeTime(r.createdAt)}
                          actionLabel={isIncoming ? 'Review' : 'View'}
                          onAction={() => navigate('/approvals')}
                        />
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <DepartmentHeadsSection
        heads={otherDeptHeads}
        onlineUserIds={onlineUserIds}
        departments={departments}
        isConnected={isConnected}
        dirLoading={dirLoading}
        onSelect={openDrawer}
      />

      {/* ── Modals ── */}
      <SchedulesModal
        open={breakdown === 'schedules'}
        onClose={() => setBreakdown(null)}
        schedules={mySchedules}
        deptName={deptName}
        term={activeTerm}
      />
      <TasksModal
        open={breakdown === 'tasks'}
        onClose={() => setBreakdown(null)}
        pendingIncoming={pendingIncoming}
        deptCode={deptCode}
        onReview={() => {
          setBreakdown(null);
          navigate('/approvals');
        }}
      />
      <CompletionModal
        open={breakdown === 'completion'}
        onClose={() => setBreakdown(null)}
        totalSchedules={totalSchedules}
        finalizedOrPublished={finalizedOrPublished}
        completionRate={completionRate}
        byStatus={byStatus}
      />
      <FlaggedModal
        open={breakdown === 'flagged'}
        onClose={() => setBreakdown(null)}
        flagged={myFlagged}
        term={activeTerm}
        onOpenFlagged={handleOpenFlaggedEntry}
      />

      {/* ── Drawer ── */}
      <UserDetailDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        user={drawerUser}
        departments={departments}
        deptCode={deptCode}
        onlineUserIds={onlineUserIds}
        requests={requests}
      />
    </>
  );
}