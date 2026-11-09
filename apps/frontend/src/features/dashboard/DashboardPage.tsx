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
  DashboardHeader,
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
  computeDepartmentSnapshot,
  greeting,
  humanizeRole,
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
  const snapshotStats = useMemo(
    () => computeDepartmentSnapshot(mySchedules),
    [mySchedules],
  );
  const headerRole = profile?.role ? humanizeRole(profile.role) : undefined;

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
      <DashboardHeader
        tourId="dash-header"
        eyebrow="Department overview"
        roleLabel={headerRole}
        title={`${greeting(now)}, ${firstName}`}
        subtitle={
          <>
            A quick read on{' '}
            <strong className="font-semibold text-on-surface">
              {deptName}
            </strong>{' '}
            — today's classes, teaching load, and requests.
          </>
        }
        status={
          <div className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-2.5 py-1.5 shadow-sm">
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
              {refreshedLabel}
            </span>
            <button
              type="button"
              onClick={refreshAll}
              disabled={isFetchingAny}
              className="rounded-md p-1 text-on-surface-variant transition hover:bg-surface-container disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
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
            <Link
              to="/reports"
              className="hidden items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-low sm:inline-flex"
            >
              <Icon name="bar_chart" size={14} />
              Reports
            </Link>
            <Link
              to="/timetable"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90"
            >
              <Icon name="calendar_view_month" size={14} />
              Open timetable
            </Link>
          </>
        }
      />

      <TermStatusCard term={activeTerm} scheduleStatusCounts={byStatus} />

      <div
        className="mt-3 flex flex-wrap items-center gap-1.5"
        data-tour="dash-actions"
      >
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
          Quick actions
        </span>
        <QuickAction
          icon="add"
          label="New schedule"
          onClick={() => navigate('/timetable')}
        />
        <QuickAction
          icon="task_alt"
          label="Tasks"
          badge={pendingIncoming.length}
          accent={pendingIncoming.length > 0 ? 'amber' : 'default'}
          onClick={() => setBreakdown('tasks')}
        />
        <QuickAction
          icon="flag"
          label="Flagged"
          badge={flaggedCount}
          accent={flaggedCount > 0 ? 'rose' : 'default'}
          onClick={() => setBreakdown('flagged')}
        />
        <QuickAction
          icon="search"
          label="Faculty"
          onClick={() => navigate('/faculty')}
        />
      </div>

      <div
        className="mt-3 overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm"
        data-tour="dash-stats"
      >
        <div className="grid grid-cols-2 gap-px bg-outline-variant/50 md:grid-cols-4">
          <SummaryCard
            icon="view_timeline"
            label="Class blocks"
            value={totalSchedules}
            hint={
              !activeTerm
                ? 'No active term'
                : totalSchedules > 0
                ? `${byStatus.draft} draft · ${byStatus.review} in review`
                : 'No class blocks yet'
            }
            isLoading={isLoading}
            onClick={
              totalSchedules > 0
                ? () => setBreakdown('schedules')
                : undefined
            }
          />
          <SummaryCard
            icon="check_circle"
            label="Completion"
            value={`${completionRate}%`}
            hint={
              totalSchedules > 0
                ? `${finalizedOrPublished} of ${totalSchedules} finalized or published`
                : 'Nothing scheduled yet'
            }
            tone={
              totalSchedules > 0 && completionRate === 100
                ? 'success'
                : 'default'
            }
            isLoading={isLoading}
            onClick={
              totalSchedules > 0
                ? () => setBreakdown('completion')
                : undefined
            }
          />
          <SummaryCard
            icon="task_alt"
            label="Pending tasks"
            value={pendingIncoming.length}
            hint={
              pendingIncoming.length > 0
                ? 'Cross-department requests'
                : 'Nothing waiting'
            }
            tone={pendingIncoming.length > 0 ? 'warning' : 'success'}
            isLoading={isLoading}
            onClick={
              pendingIncoming.length > 0
                ? () => setBreakdown('tasks')
                : undefined
            }
          />
          <SummaryCard
            icon="flag"
            label="Flagged"
            value={flaggedCount}
            hint={
              !activeTerm
                ? 'No active term'
                : flaggedCount > 0
                ? 'Entries to review'
                : 'Nothing flagged'
            }
            tone={
              !activeTerm
                ? 'default'
                : flaggedCount > 0
                ? 'danger'
                : 'success'
            }
            isLoading={isFlaggedLoading}
            onClick={
              flaggedCount > 0 ? () => setBreakdown('flagged') : undefined
            }
          />
        </div>
        {activeTerm && (
          <div className="border-t border-outline-variant/60 px-4 py-2.5">
            <DepartmentSnapshot
              schedules={mySchedules}
              stats={snapshotStats}
              onReviewGaps={() => navigate('/timetable')}
            />
          </div>
        )}
      </div>

      {/* ── Today + Recent Activity ── */}
      <div
        className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12"
        data-tour="dash-today"
      >
        <div className="lg:col-span-5">
          <TodayScheduleStrip
            schedules={mySchedules}
            now={now}
            onOpenTimetable={() => navigate('/timetable')}
          />
        </div>

        <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm lg:col-span-7">
          <div className="flex items-center justify-between gap-3 border-b border-outline-variant/70 px-4 py-3">
            <h3 className="text-sm font-bold text-on-surface">
              Recent activity
            </h3>
            {recentActivity.length > 0 && (
              <Link
                to="/approvals"
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                View all
              </Link>
            )}
          </div>
          <div className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-14 text-sm text-on-surface-variant">
                <Icon
                  name="progress_activity"
                  size={16}
                  className="animate-spin"
                />
                Loading activity…
              </div>
            ) : recentActivity.length === 0 ? (
              <BreakdownEmpty
                icon="inbox"
                message="No recent activity in your department."
                actionLabel="Open approvals"
                onAction={() => navigate('/approvals')}
              />
            ) : (
              Object.entries(groupedActivity).map(([group, items]) => (
                <div key={group}>
                  <div className="border-y border-outline-variant/50 bg-surface-container-low/60 px-4 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      {group}
                    </span>
                  </div>
                  <div className="divide-y divide-outline-variant/50">
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
                        ? 'bg-rose-50'
                        : 'bg-amber-50';
                      const iconColor = isApproved
                        ? 'text-emerald-700'
                        : isRejected
                        ? 'text-rose-700'
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
                              <span className="text-on-surface-variant">
                                {r.reason}
                              </span>
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
