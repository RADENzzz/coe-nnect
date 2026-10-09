import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import { useDepartmentLabel } from '../../hooks/use-department-label';
import { useAuthStore } from '../../store/auth.store';
import { useOnlineUsers } from '../../hooks/use-online-users';
import { fetchSchedules, fetchActiveTerm, type RawSchedule } from '../../api/schedule.api';
import {
  fetchFacultyRequests,
  type FacultyRequest,
} from '../../api/faculty-requests.api';
import { fetchDepartments } from '../../api/departments.api';
import { fetchUsers } from '../../api/users.api';
import { timeToMinutes } from '../timetable/utils/time.util';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const DAY_ABBR_TO_LABEL: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

function fmtTime(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${period}`;
}

function scheduleDay(s: RawSchedule): string {
  return s.dayOfWeek ?? s.timeSlot?.dayOfWeek ?? '';
}

function scheduleStart(s: RawSchedule): string {
  return (s.startTime ?? s.timeSlot?.startTime ?? '').slice(0, 5);
}

function scheduleEnd(s: RawSchedule): string {
  return (s.endTime ?? s.timeSlot?.endTime ?? '').slice(0, 5);
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
}

function initials(username: string): string {
  if (!username) return '—';
  return username.slice(0, 2).toUpperCase();
}

// ─────────────────────────────────────────────
// Quick Action Button
// ─────────────────────────────────────────────

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 p-3 flex flex-col items-center justify-center gap-2 transition-all group"
    >
      <Icon
        name={icon}
        className="text-[#5c1219] group-hover:scale-105 transition-transform"
      />
      <span className="text-[11px] font-semibold text-slate-700 text-center">
        {label}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────
// Summary Card
// ─────────────────────────────────────────────

function SummaryCard({
  icon,
  badge,
  badgeVariant = 'neutral',
  label,
  value,
  footer,
  onClick,
  clickable,
}: {
  icon: string;
  badge?: string;
  badgeVariant?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
  label: string;
  value: string;
  footer?: React.ReactNode;
  onClick?: () => void;
  clickable?: boolean;
}) {
  const badgeClasses = {
    neutral: 'bg-slate-50 text-slate-600 border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    brand: 'bg-red-50 text-red-800 border-red-200',
  };

  const Wrapper = clickable ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      disabled={!clickable}
      className={
        'bg-white border border-slate-200 p-5 shadow-sm transition-all text-left w-full ' +
        (clickable
          ? 'hover:border-[#5c1219]/40 hover:shadow cursor-pointer'
          : 'hover:border-slate-300')
      }
    >
      <div className="flex justify-between items-start mb-4">
        <div className="w-9 h-9 bg-red-50 border border-red-200 flex items-center justify-center">
          <Icon name={icon} filled className="text-[#5c1219]" />
        </div>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span
              className={`text-[11px] font-bold uppercase tracking-wide border px-2 py-0.5 ${badgeClasses[badgeVariant]}`}
            >
              {badge}
            </span>
          )}
          {clickable && (
            <Icon
              name="chevron_right"
              size={16}
              className="text-slate-300 group-hover:text-slate-500 transition"
            />
          )}
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-1">{label}</p>
      <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
        {value}
      </div>
      {footer && <div className="mt-4">{footer}</div>}
    </Wrapper>
  );
}

// ─────────────────────────────────────────────
// Activity Item
// ─────────────────────────────────────────────

function ActivityItem({
  icon,
  iconBg,
  iconColor,
  text,
  time,
  actionLabel,
  onAction,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  text: React.ReactNode;
  time: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="p-4 px-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
      <div
        className={`w-8 h-8 flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}
      >
        <Icon name={icon} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900 truncate">{text}</p>
        <p className="text-xs text-slate-500 mt-0.5">{time}</p>
      </div>
      <button
        onClick={onAction}
        className="text-[#5c1219] text-xs font-semibold hover:underline shrink-0"
      >
        {actionLabel}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Breakdown List — shared row components
// ─────────────────────────────────────────────

function BreakdownEmpty({ message }: { message: string }) {
  return (
    <div className="py-12 text-center">
      <Icon
        name="inbox"
        size={36}
        className="text-slate-300 mx-auto mb-2"
      />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

function ScheduleRow({ s }: { s: RawSchedule }) {
  const day = scheduleDay(s);
  const start = scheduleStart(s);
  const end = scheduleEnd(s);
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-b-0">
      <div className="w-14 shrink-0 text-xs font-mono font-bold text-[#5c1219] pt-0.5">
        {DAY_ABBR_TO_LABEL[day] ?? day}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-slate-900 text-sm">
            {s.subject?.subjectCode ?? '—'}
          </span>
          {s.section && (
            <span className="text-xs text-slate-500">· {s.section}</span>
          )}
          <StatusPill status={s.status} />
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {start && end ? `${fmtTime(start)} – ${fmtTime(end)}` : 'No time set'}
          {s.faculty ? ` · ${s.faculty.firstName} ${s.faculty.lastName}` : ''}
          {s.room ? ` · Rm ${s.room.roomNumber}` : ''}
        </p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600 border-slate-200',
    review: 'bg-amber-50 text-amber-700 border-amber-200',
    finalized: 'bg-blue-50 text-blue-700 border-blue-200',
    published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return (
    <span
      className={`text-[10px] uppercase tracking-wider font-bold border px-1.5 py-0.5 ${
        map[status] ?? map.draft
      }`}
    >
      {status}
    </span>
  );
}

function RequestRow({
  r,
  deptCode,
  onClick,
}: {
  r: FacultyRequest;
  deptCode: (id: string) => string;
  onClick?: () => void;
}) {
  return (
    <div className="py-3 border-b border-slate-100 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-[#5c1219]">
              {deptCode(r.requestingDeptId)}
            </span>
            <Icon name="arrow_forward" size={12} className="text-slate-400" />
            <span className="font-mono text-xs font-bold">
              {deptCode(r.targetDeptId)}
            </span>
            <StatusPill status={r.status} />
          </div>
          <p className="text-xs text-slate-600 mt-1 line-clamp-2">
            {r.reason}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Request #{r.requestId} · {relativeTime(r.createdAt)}
          </p>
        </div>
        {onClick && (
          <button
            onClick={onClick}
            className="text-[#5c1219] text-xs font-semibold hover:underline shrink-0"
          >
            Review
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Dashboard Page
// ─────────────────────────────────────────────

type BreakdownKind = 'schedules' | 'tasks' | 'completion' | null;

export default function DashboardPage() {
  const { firstName, deptName } = useDepartmentLabel();
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;

  const [breakdown, setBreakdown] = useState<BreakdownKind>(null);

  // ── Queries ──
  const { data: activeTerm } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
  });

  const { data: schedules = [], isLoading: schedLoading } = useQuery({
    queryKey: ['schedules', activeTerm?.termId],
    queryFn: () => fetchSchedules(activeTerm?.termId),
    enabled: !!activeTerm?.termId,
  });

  const { data: requests = [], isLoading: reqLoading } = useQuery({
    queryKey: ['faculty-requests'],
    queryFn: fetchFacultyRequests,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  const { onlineUsers, isConnected } = useOnlineUsers();

  const deptCode = (id: string) =>
    departments.find((d) => String(d.deptId) === String(id))?.deptCode ??
    `#${id}`;

  // ── Online DHs (excluding self) ──
  const onlineUserIds = new Set(onlineUsers.map((u) => u.user_id));
  const otherDeptHeads = users.filter(
    (u) =>
      u.role === 'department_head' &&
      u.isActive &&
      u.userId !== profile?.user_id,
  );
  const onlineOtherDHs = otherDeptHeads.filter((u) =>
    onlineUserIds.has(u.userId),
  ).length;

  // ── Filter to my dept ──
  const mySchedules = schedules.filter(
    (s) => s.subject?.deptId && String(s.subject.deptId) === myDeptId,
  );

  const myRequests = requests.filter((r) => {
    if (!myDeptId) return false;
    const inReq = String(r.requestingDeptId) === myDeptId;
    const inTgt = String(r.targetDeptId) === myDeptId;
    return inReq || inTgt;
  });

  const pendingIncoming = myRequests.filter(
    (r) =>
      r.status === 'pending' && String(r.targetDeptId) === myDeptId,
  );

  // ── Computed metrics ──
  const totalSchedules = mySchedules.length;
  const byStatus = {
    draft: mySchedules.filter((s) => s.status === 'draft').length,
    review: mySchedules.filter((s) => s.status === 'review').length,
    finalized: mySchedules.filter((s) => s.status === 'finalized').length,
    published: mySchedules.filter((s) => s.status === 'published').length,
  };
  const finalizedOrPublished = byStatus.finalized + byStatus.published;
  const completionRate =
    totalSchedules > 0
      ? Math.round((finalizedOrPublished / totalSchedules) * 100)
      : 0;

  const isLoading = schedLoading || reqLoading;

  const recentActivity = [...myRequests]
    .sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime(),
    )
    .slice(0, 5);

  const schedulesValue = isLoading ? '—' : String(totalSchedules);
  const tasksValue = isLoading ? '—' : String(pendingIncoming.length);
  const completionValue = isLoading ? '—' : `${completionRate}%`;

  return (
    <>
      {/* Welcome Header */}
      <div className="mb-6 mt-1 md:mt-0 border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1">
          Welcome back, {firstName}
        </h1>
        <p className="text-sm text-slate-500">
          Here is the current status of the {deptName} department schedule
          {activeTerm
            ? ` — ${activeTerm.termName} ${activeTerm.schoolYear}.`
            : '.'}
        </p>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
        {/* Quick Actions */}
        <div className="md:col-span-4 bg-white border border-slate-200 p-5 shadow-sm flex flex-col">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500 mb-3 border-b border-slate-100 pb-3">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-2 flex-1">
            <QuickAction
              icon="add_circle"
              label="New Schedule"
              onClick={() => navigate('/timetable')}
            />
            <QuickAction
              icon="search"
              label="Search Faculty"
              onClick={() => navigate('/faculty')}
            />
            <QuickAction
              icon="meeting_room"
              label="Room Status"
              onClick={() => navigate('/rooms')}
            />
            <QuickAction
              icon="calendar_month"
              label="View Calendar"
              onClick={() => navigate('/timetable')}
            />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            icon="view_timeline"
            badge={activeTerm?.termName ?? 'No term'}
            badgeVariant="neutral"
            label="Active Schedules"
            value={schedulesValue}
            clickable={!isLoading && totalSchedules > 0}
            onClick={() => setBreakdown('schedules')}
            footer={
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">
                  {byStatus.draft}
                </span>
                <span>draft</span>
                <span>·</span>
                <span className="font-semibold text-slate-700">
                  {byStatus.review}
                </span>
                <span>review</span>
              </div>
            }
          />

          <SummaryCard
            icon="checklist"
            badge={pendingIncoming.length > 0 ? 'Urgent' : 'Clear'}
            badgeVariant={pendingIncoming.length > 0 ? 'danger' : 'success'}
            label="Tasks to do"
            value={tasksValue}
            clickable={!isLoading && pendingIncoming.length > 0}
            onClick={() => setBreakdown('tasks')}
            footer={
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 ${
                    pendingIncoming.length > 0
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                />
                <span className="text-xs text-slate-500">
                  {pendingIncoming.length > 0
                    ? `${pendingIncoming.length} cross-dept request${
                        pendingIncoming.length === 1 ? '' : 's'
                      } pending`
                    : 'No pending requests'}
                </span>
              </div>
            }
          />

          <SummaryCard
            icon="donut_large"
            label="Completion Rate"
            value={completionValue}
            clickable={!isLoading && totalSchedules > 0}
            onClick={() => setBreakdown('completion')}
            footer={
              <div className="w-full bg-slate-100 h-1.5 overflow-hidden">
                <div
                  className="bg-[#5c1219] h-1.5 transition-all duration-500"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            }
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            Recent Scheduling Activity
          </h3>
          {recentActivity.length > 0 && (
            <Link
              to="/approvals"
              className="text-xs font-semibold text-[#5c1219] hover:underline"
            >
              View all
            </Link>
          )}
        </div>
        <div className="divide-y divide-slate-100">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Loading…
            </div>
          ) : recentActivity.length === 0 ? (
            <BreakdownEmpty message="No recent activity in your department." />
          ) : (
            recentActivity.map((r) => {
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
            })
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────
          Other Department Heads Online
         ───────────────────────────────────── */}
      <div className="mt-6 bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
              }`}
            />
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Other Department Heads
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            {onlineOtherDHs} of {otherDeptHeads.length} online
          </span>
        </div>

        {otherDeptHeads.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No other department heads configured.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 divide-slate-100">
            {otherDeptHeads.map((head) => {
              const isOnline = onlineUserIds.has(head.userId);
              const dept = departments.find(
                (d) => String(d.deptId) === String(head.deptId),
              );
              return (
                <div
                  key={head.userId}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center">
                      {initials(head.username)}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-white rounded-full ${
                        isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {head.username}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {dept
                        ? `[${dept.deptCode}] ${dept.deptName}`
                        : 'No department'}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider border px-2 py-0.5 shrink-0 ${
                      isOnline
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
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

      {/* ─────────────────────────────────────
          Breakdown Modals
         ───────────────────────────────────── */}

      <Modal
        open={breakdown === 'schedules'}
        onClose={() => setBreakdown(null)}
        title="Active Schedules"
        description={`${totalSchedules} ${
          totalSchedules === 1 ? 'entry' : 'entries'
        } in ${deptName}${activeTerm ? ` · ${activeTerm.termName}` : ''}`}
        size="lg"
      >
        {totalSchedules === 0 ? (
          <BreakdownEmpty message="No schedule entries yet. Click Plot Subject to add one." />
        ) : (
          <div>
            {[...mySchedules]
              .sort((a, b) => {
                const da = scheduleDay(a);
                const db = scheduleDay(b);
                if (da !== db) return da.localeCompare(db);
                return timeToMinutes(scheduleStart(a) || '00:00') -
                  timeToMinutes(scheduleStart(b) || '00:00');
              })
              .map((s) => (
                <ScheduleRow key={s.scheduleId} s={s} />
              ))}
          </div>
        )}
      </Modal>

      <Modal
        open={breakdown === 'tasks'}
        onClose={() => setBreakdown(null)}
        title="Pending Tasks"
        description={`${pendingIncoming.length} cross-department request${
          pendingIncoming.length === 1 ? '' : 's'
        } awaiting your decision`}
        size="lg"
      >
        {pendingIncoming.length === 0 ? (
          <BreakdownEmpty message="Nothing pending. You're all caught up." />
        ) : (
          <div>
            {pendingIncoming.map((r) => (
              <RequestRow
                key={r.requestId}
                r={r}
                deptCode={deptCode}
                onClick={() => {
                  setBreakdown(null);
                  navigate('/approvals');
                }}
              />
            ))}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <Link
                to="/approvals"
                className="text-xs font-semibold text-[#5c1219] hover:underline flex items-center gap-1"
              >
                Go to Approvals
                <Icon name="arrow_forward" size={14} />
              </Link>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={breakdown === 'completion'}
        onClose={() => setBreakdown(null)}
        title="Completion Rate"
        description={`${finalizedOrPublished} of ${totalSchedules} entries finalized or published`}
        size="md"
      >
        {totalSchedules === 0 ? (
          <BreakdownEmpty message="No schedule entries to summarize." />
        ) : (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="text-5xl font-extrabold text-[#5c1219]">
                {completionRate}%
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {finalizedOrPublished} of {totalSchedules} complete
              </p>
            </div>

            <div className="w-full bg-slate-100 h-2 overflow-hidden">
              <div
                className="bg-[#5c1219] h-2 transition-all duration-500"
                style={{ width: `${completionRate}%` }}
              />
            </div>

            <div className="pt-2 space-y-2">
              <StatusRow
                label="Draft"
                count={byStatus.draft}
                total={totalSchedules}
                barColor="bg-slate-400"
              />
              <StatusRow
                label="In Review"
                count={byStatus.review}
                total={totalSchedules}
                barColor="bg-amber-500"
              />
              <StatusRow
                label="Finalized"
                count={byStatus.finalized}
                total={totalSchedules}
                barColor="bg-blue-500"
              />
              <StatusRow
                label="Published"
                count={byStatus.published}
                total={totalSchedules}
                barColor="bg-emerald-500"
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────
// Completion breakdown row
// ─────────────────────────────────────────────

function StatusRow({
  label,
  count,
  total,
  barColor,
}: {
  label: string;
  count: number;
  total: number;
  barColor: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="text-slate-500">
          <span className="font-bold text-slate-900">{count}</span>
          {' · '}
          {pct}%
        </span>
      </div>
      <div className="w-full bg-slate-100 h-1.5">
        <div
          className={`${barColor} h-1.5 transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}