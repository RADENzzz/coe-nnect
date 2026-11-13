import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import RollingValue, {
  RollingNumber,
  RollingText,
} from '../../components/ui/RollingValue';
import { useDepartmentLabel } from '../../hooks/use-department-label';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchSchedules,
  fetchActiveTerm,
  fetchFlagged,
  fetchRoomSufficiency,
  type RawSchedule,
} from '../../api/schedule.api';
import { fetchFaculty, fetchFacultyStatusSummary } from '../../api/faculty.api';
import { fetchFacultyRequests } from '../../api/faculty-requests.api';
import { fetchDesignations } from '../../api/system-config.api';
import {
  ReportCard,
  SummaryCard,
  TodayScheduleStrip,
  LiveClock,
} from './components';
import {
  fmtTime,
  relativeTime,
  scheduleStart,
  scheduleEnd,
  timeToMinutes,
} from './utils/dashboard.utils';

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
  return [
    schedule.dayOfWeek ?? schedule.timeSlot?.dayOfWeek,
    fmtTime(scheduleStart(schedule)),
  ]
    .filter(Boolean)
    .join(' · ');
}

export default function DashboardPage() {
  const { deptName } = useDepartmentLabel();
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;

  // Keep the clock and the Today strip current in long-lived tabs.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
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

  const { data: faculty = [], isLoading: facultyLoading, isFetching: facultyFetching } =
    useQuery({
      queryKey: ['faculty', { includeInactive: false }],
      queryFn: () => fetchFaculty(false),
      enabled: !!profile,
    });

  const { data: statusSummary = [], isLoading: statusLoading } = useQuery({
    queryKey: ['faculty-status-summary', myDeptId],
    queryFn: () => fetchFacultyStatusSummary(myDeptId ?? undefined),
    enabled: !!myDeptId,
  });

  const { data: designations = [] } = useQuery({
    queryKey: ['designations'],
    queryFn: fetchDesignations,
    enabled: !!profile,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: roomReports = [],
    isLoading: roomLoading,
    isFetching: roomFetching,
  } = useQuery({
    queryKey: ['room-sufficiency', myDeptId],
    queryFn: () =>
      fetchRoomSufficiency(myDeptId ? { deptId: myDeptId } : undefined),
    enabled: !!profile,
    staleTime: 30 * 1000,
  });

  const refreshAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['active-term'] });
    qc.invalidateQueries({ queryKey: ['schedules'] });
    qc.invalidateQueries({ queryKey: ['flagged'] });
    qc.invalidateQueries({ queryKey: ['faculty-requests'] });
    qc.invalidateQueries({ queryKey: ['faculty'] });
    qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
    qc.invalidateQueries({ queryKey: ['room-sufficiency'] });
  }, [qc]);

  // ── Department rows ──
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

  const myFaculty = useMemo(
    () =>
      faculty.filter(
        (f) => !myDeptId || String(f.deptId ?? '') === myDeptId,
      ),
    [faculty, myDeptId],
  );

  // ── Workload + qualification summary ──
  const workload = useMemo(() => {
    const releaseById = new Map<string, number>();
    for (const designation of designations) {
      releaseById.set(
        String(designation.designationId),
        Number(designation.releaseHours ?? 0),
      );
    }

    const assignedById = new Map<string, number>();
    for (const schedule of mySchedules) {
      if (!schedule.facultyId) continue;
      assignedById.set(
        schedule.facultyId,
        (assignedById.get(schedule.facultyId) ?? 0) +
          scheduleHours(schedule),
      );
    }

    const rows: FacultyLoadRow[] = myFaculty.map((member) => {
      const assigned = assignedById.get(member.facultyId) ?? 0;
      const baseRequired = member.requiredHours ?? DEFAULT_REQUIRED_HOURS;
      const release = member.designationId
        ? releaseById.get(String(member.designationId)) ?? 0
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
          Math.abs(b.assigned - b.required) -
          Math.abs(a.assigned - a.required)
        );
      })
      .slice(0, 2);

    return { rows, counts, needsReview };
  }, [myFaculty, mySchedules, designations]);

  const qualificationById = useMemo(
    () => new Map(statusSummary.map((row) => [row.facultyId, row])),
    [statusSummary],
  );

  const qualifiedCount = useMemo(
    () =>
      myFaculty.filter(
        (member) => qualificationById.get(member.facultyId)?.hasQualifications,
      ).length,
    [myFaculty, qualificationById],
  );

  const qualificationPct =
    myFaculty.length > 0
      ? Math.round((qualifiedCount / myFaculty.length) * 100)
      : 0;

  // ── Schedule status summary ──
  const scheduleStats = useMemo(() => {
    const byStatus = { draft: 0, review: 0, finalized: 0, published: 0 };
    for (const schedule of mySchedules) byStatus[schedule.status] += 1;

    const total = mySchedules.length;
    const complete = byStatus.finalized + byStatus.published;

    return {
      byStatus,
      total,
      complete,
      completionRate: total > 0 ? Math.round((complete / total) * 100) : 0,
    };
  }, [mySchedules]);

  // ── Attention items ──
  const gapRows = useMemo(
    () =>
      mySchedules.filter((schedule) => {
        const hasFaculty = Boolean(
          schedule.facultyId || schedule.externalFacultyName?.trim(),
        );
        const hasRoom = Boolean(
          schedule.roomId || schedule.externalRoomName?.trim(),
        );
        return !hasFaculty || !hasRoom;
      }),
    [mySchedules],
  );

  const attentionCount = useMemo(() => {
    const ids = new Set<string>();
    for (const schedule of myFlagged) ids.add(schedule.scheduleId);
    for (const schedule of gapRows) ids.add(schedule.scheduleId);
    return ids.size + pendingIncoming.length;
  }, [myFlagged, gapRows, pendingIncoming]);

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    const seenSchedules = new Set<string>();

    for (const schedule of myFlagged) {
      if (items.length >= 5) break;
      seenSchedules.add(schedule.scheduleId);
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
        to: `/timetable?focus=${schedule.scheduleId}`,
      });
    }

    for (const schedule of gapRows) {
      if (items.length >= 5) break;
      if (seenSchedules.has(schedule.scheduleId)) continue;
      seenSchedules.add(schedule.scheduleId);

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
        to: `/timetable?focus=${schedule.scheduleId}`,
      });
    }

    for (const request of pendingIncoming) {
      if (items.length >= 5) break;
      items.push({
        key: `request-${request.requestId}`,
        icon: 'pending_actions',
        color: 'text-amber-600',
        title: 'Cross-department faculty request',
        detail: request.reason,
        to: '/approvals',
      });
    }

    return items;
  }, [myFlagged, gapRows, pendingIncoming]);

  // ── Rooms + activity ──
  const roomReport = roomReports[0];
  const roomsMissing =
    roomReport?.deficits.reduce(
      (sum, deficit) => sum + deficit.suggestedExtraRooms,
      0,
    ) ?? 0;

  const roomStatusLabel = !roomReport
    ? 'No room data'
    : roomReport.sufficient
      ? 'Sufficient'
      : `${roomsMissing} room${roomsMissing === 1 ? '' : 's'} short`;

  const recentActivity = useMemo(
    () =>
      [...myRequests]
        .sort(
          (a, b) =>
            new Date(b.createdAt ?? 0).getTime() -
            new Date(a.createdAt ?? 0).getTime(),
        )
        .slice(0, 4),
    [myRequests],
  );

  const isLoading = schedLoading || reqLoading || facultyLoading;
  const isFetchingAny =
    schedFetching ||
    flaggedFetching ||
    reqFetching ||
    facultyFetching ||
    roomFetching;

  // Derive "updated X ago" from the freshest dashboard query — survives
  // background refetches correctly (vs. the old loading-transition effect).
  const lastUpdated = Math.max(
    schedUpdatedAt,
    flaggedUpdatedAt,
    reqUpdatedAt,
  );
  const refreshedLabel = isFetchingAny
    ? 'Refreshing…'
    : lastUpdated > 0
      ? `Updated ${relativeTime(new Date(lastUpdated).toISOString())}`
      : 'Ready';

  const dateLabel = now.toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const attentionHint =
    [
      myFlagged.length > 0 ? `${myFlagged.length} flagged` : '',
      gapRows.length > 0 ? `${gapRows.length} unassigned` : '',
      pendingIncoming.length > 0
        ? `${pendingIncoming.length} request${pendingIncoming.length === 1 ? '' : 's'}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'All clear';

  const statusItems = [
    {
      label: 'Published',
      value: scheduleStats.byStatus.published,
      dot: 'bg-emerald-500',
    },
    {
      label: 'Finalized',
      value: scheduleStats.byStatus.finalized,
      dot: 'bg-blue-500',
    },
    {
      label: 'In review',
      value: scheduleStats.byStatus.review,
      dot: 'bg-amber-500',
    },
    {
      label: 'Draft',
      value: scheduleStats.byStatus.draft,
      dot: 'bg-slate-400',
    },
  ];

  return (
    <div className="space-y-4">
      {/* ── Compact masthead: department, term, live date/time ── */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
            Department dashboard
          </p>
          <h1 className="mt-1 truncate text-2xl font-extrabold tracking-tight text-on-surface">
            {deptName}
          </h1>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            {activeTerm
              ? `${activeTerm.termName} · ${activeTerm.schoolYear}`
              : 'No active term'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="text-right">
            <p className="text-xl font-bold leading-none tabular-nums text-on-surface">
              <LiveClock />
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
            <Link
              to="/reports"
              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-low"
            >
              <Icon name="bar_chart" size={14} />
              Reports
            </Link>
            <Link
              to="/timetable"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90"
            >
              <Icon name="calendar_view_month" size={14} />
              Timetable
            </Link>
          </div>
        </div>
      </header>

      {/* ── Four essentials at a glance ── */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-outline-variant bg-outline-variant/50 shadow-sm md:grid-cols-4">
        <SummaryCard
          icon="view_timeline"
          label="Class blocks"
          value={scheduleStats.total}
          hint={
            scheduleStats.total > 0
              ? `${scheduleStats.byStatus.finalized + scheduleStats.byStatus.published} finalized or published`
              : 'Nothing plotted yet'
          }
          isLoading={schedLoading}
          onClick={() => navigate('/timetable')}
        />
        <SummaryCard
          icon="group"
          label="Faculty"
          value={myFaculty.length}
          hint={
            statusLoading
              ? 'Checking qualifications…'
              : `${qualifiedCount} with qualifications`
          }
          isLoading={facultyLoading}
          onClick={() => navigate('/reports/workload')}
        />
        <SummaryCard
          icon="meeting_room"
          label="Room sufficiency"
          value={
            !roomReport
              ? 'No data'
              : roomReport.sufficient
                ? 'Sufficient'
                : `${roomsMissing} short`
          }
          hint={
            roomReport
              ? `${roomReport.totals.rooms} rooms · ${roomReport.totals.blocks} blocks`
              : 'Waiting for room data'
          }
          tone={
            !roomReport
              ? 'default'
              : roomReport.sufficient
                ? 'success'
                : 'danger'
          }
          isLoading={roomLoading}
          onClick={() => navigate('/reports/rooms')}
        />
        <SummaryCard
          icon="notification_important"
          label="Needs attention"
          value={attentionCount}
          hint={attentionHint}
          tone={attentionCount > 0 ? 'warning' : 'success'}
          isLoading={isLoading || flaggedLoading}
          onClick={() =>
            document
              .getElementById('dash-attention')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        />
      </div>

      {/* ── Report cards ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <ReportCard
            title="Faculty workload"
            subtitle="Assigned load vs. required hours"
            to="/reports/workload"
            linkLabel="Workload report"
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold leading-none tabular-nums text-on-surface">
                <RollingNumber
                  value={myFaculty.length}
                  loading={facultyLoading}
                />
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
                    value={`${qualifiedCount}/${myFaculty.length}`}
                    loading={statusLoading}
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
              {[
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
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-2.5 py-2"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.dot}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold tabular-nums text-on-surface">
                    <RollingNumber
                      value={item.value}
                      loading={facultyLoading || schedLoading}
                    />
                  </span>
                  <span className="truncate text-[10px] text-on-surface-variant">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[11px] leading-snug text-on-surface-variant">
              {workload.needsReview.length > 0 ? (
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
            title="Room sufficiency"
            subtitle="Projected demand vs. room capacity"
            to="/reports/rooms"
            linkLabel="Room report"
          >
            <div className="flex items-center gap-2">
              {roomReport && (
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    roomReport.sufficient ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                  aria-hidden="true"
                />
              )}
              <span
                className={`text-lg font-bold leading-tight ${
                  !roomReport
                    ? 'text-on-surface'
                    : roomReport.sufficient
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                }`}
              >
                <RollingValue value={roomStatusLabel} loading={roomLoading} />
              </span>
            </div>
            <p className="mt-1 text-[11px] text-on-surface-variant">
              {roomReport ? (
                <RollingValue
                  value={`${roomReport.totals.rooms} rooms · ${roomReport.totals.blocks} class blocks`}
                  loading={roomLoading}
                />
              ) : (
                'The room report will appear once a term is active.'
              )}
            </p>

            {roomReport && !roomReport.sufficient ? (
              <div className="mt-4 space-y-2">
                {roomReport.deficits.slice(0, 3).map((deficit) => (
                  <div
                    key={deficit.roomType}
                    className="flex items-center justify-between gap-3 text-[11px]"
                  >
                    <span className="truncate capitalize text-on-surface-variant">
                      {deficit.roomType}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-amber-700">
                      <RollingValue
                        value={`${deficit.shortByHours.toFixed(1)}h short`}
                        loading={roomLoading}
                      />
                    </span>
                  </div>
                ))}
              </div>
            ) : roomReport ? (
              <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                <Icon name="check_circle" size={12} />
                No shortfalls detected.
              </p>
            ) : null}
          </ReportCard>
        </div>

        <div className="lg:col-span-4">
          <ReportCard
            title="Schedules"
            subtitle="Status of this term's class blocks"
            to="/timetable"
            linkLabel="Timetable"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold leading-none tabular-nums text-on-surface">
                  <RollingNumber
                    value={scheduleStats.total}
                    loading={schedLoading}
                  />
                </span>
                <span className="text-xs text-on-surface-variant">
                  class blocks
                </span>
              </div>
              <span className="text-xs font-semibold text-on-surface-variant tabular-nums">
                <RollingValue
                  value={`${scheduleStats.completionRate}% complete`}
                  loading={schedLoading}
                />
              </span>
            </div>

            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-container">
              {scheduleStats.total > 0 && (
                <>
                  <span
                    className="bg-emerald-500"
                    style={{
                      width: `${(scheduleStats.byStatus.published / scheduleStats.total) * 100}%`,
                    }}
                  />
                  <span
                    className="bg-blue-500"
                    style={{
                      width: `${(scheduleStats.byStatus.finalized / scheduleStats.total) * 100}%`,
                    }}
                  />
                  <span
                    className="bg-amber-500"
                    style={{
                      width: `${(scheduleStats.byStatus.review / scheduleStats.total) * 100}%`,
                    }}
                  />
                  <span
                    className="bg-slate-400"
                    style={{
                      width: `${(scheduleStats.byStatus.draft / scheduleStats.total) * 100}%`,
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
                    <RollingNumber
                      value={item.value}
                      loading={schedLoading}
                    />
                  </span>
                </div>
              ))}
            </div>
          </ReportCard>
        </div>
      </div>

      {/* ── Attention + today ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section
          id="dash-attention"
          className="flex scroll-mt-4 flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm lg:col-span-7"
        >
          <header className="flex items-start justify-between gap-3 border-b border-outline-variant/70 px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-on-surface">
                Needs attention
              </h2>
              <p className="mt-0.5 text-[11px] text-on-surface-variant">
                <RollingValue
                  value={
                    attentionCount > 0
                      ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} to review`
                      : 'Flagged classes, unassigned blocks, and pending requests'
                  }
                  loading={isLoading || flaggedLoading}
                />
              </p>
            </div>
            {attentionCount > 0 && (
              <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-800">
                <RollingNumber
                  value={attentionCount}
                  loading={isLoading || flaggedLoading}
                />
              </span>
            )}
          </header>

          {isLoading || flaggedLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 py-12 text-xs text-on-surface-variant">
              <Icon
                name="progress_activity"
                size={14}
                className="animate-spin"
              />
              Checking schedules…
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
            schedules={mySchedules}
            now={now}
            loading={schedLoading}
            onOpenTimetable={() => navigate('/timetable')}
          />
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
              Latest faculty requests in your department
            </p>
          </div>
          {recentActivity.length > 0 && (
            <Link
              to="/approvals"
              className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
            >
              View all
            </Link>
          )}
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-on-surface-variant">
            <Icon
              name="progress_activity"
              size={14}
              className="animate-spin"
            />
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
