import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchFacultyRequests,
  type FacultyRequest,
  type FacultyRequestStatus,
} from '../../api/faculty-requests.api';
import { fetchDepartments } from '../../api/departments.api';
import { fetchActiveTerm } from '../../api/schedule.api';
import Icon from '../../components/ui/Icon';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import StatusBadge from '../../components/ui/StatusBadge';
import ApprovalsExportToolbar from './export/ApprovalsExportToolbar';
import { useNavigate } from 'react-router-dom';

type StatusFilter = 'all' | FacultyRequestStatus;
type TimeRange = 'all' | '7d' | '30d' | '90d' | 'term';
type SortKey = 'id' | 'dept' | 'created' | 'responded' | 'status';

const STATUS_TONE: Record<
  FacultyRequestStatus,
  'warning' | 'success' | 'danger' | 'neutral'
> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
}

/** Hours between two ISO timestamps, or null. */
function hoursBetween(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (b - a) / 3600000;
}

function fmtHoursShort(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export default function ApprovalsReportPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isDH = profile?.role === 'department_head';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: activeTerm } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
    enabled: !!user,
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['faculty-requests'],
    queryFn: fetchFacultyRequests,
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchDepartments(),
    enabled: !!user,
  });

  const deptCode = (id: string) =>
    departments.find((d) => String(d.deptId) === String(id))?.deptCode ??
    `#${id}`;

  const deptName = (id: string) =>
    departments.find((d) => String(d.deptId) === String(id))?.deptName ??
    `#${id}`;

  // ── Apply filters ──
  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff =
      timeRange === '7d'
        ? now - 7 * 86400000
        : timeRange === '30d'
        ? now - 30 * 86400000
        : timeRange === '90d'
        ? now - 90 * 86400000
        : null;

    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (deptFilter !== 'all') {
        const inReq = String(r.requestingDeptId) === deptFilter;
        const inTgt = String(r.targetDeptId) === deptFilter;
        if (!inReq && !inTgt) return false;
      }
      if (cutoff) {
        const t = new Date(r.createdAt ?? 0).getTime();
        if (Number.isNaN(t) || t < cutoff) return false;
      }
      // DH scope
      if (isDH && profile?.dept_id) {
        const myDept = String(profile.dept_id);
        const inReq = String(r.requestingDeptId) === myDept;
        const inTgt = String(r.targetDeptId) === myDept;
        if (!inReq && !inTgt) return false;
      }
      return true;
    });
  }, [
    requests,
    statusFilter,
    deptFilter,
    timeRange,
    isDH,
    profile?.dept_id,
  ]);

  // ── Sort ──
  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'id':
          return (Number(a.requestId) - Number(b.requestId)) * dir;
        case 'dept': {
          const av = deptCode(a.requestingDeptId);
          const bv = deptCode(b.requestingDeptId);
          return av.localeCompare(bv) * dir;
        }
        case 'created':
          return (
            (new Date(a.createdAt ?? 0).getTime() -
              new Date(b.createdAt ?? 0).getTime()) *
            dir
          );
        case 'responded':
          return (
            (new Date(a.respondedAt ?? 0).getTime() -
              new Date(b.respondedAt ?? 0).getTime()) *
            dir
          );
        case 'status':
          return a.status.localeCompare(b.status) * dir;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir]);

  // ── Summary ──
  const summary = useMemo(() => {
    const counts = {
      total: filtered.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    };
    let respondedCount = 0;
    let respondedHoursTotal = 0;
    for (const r of filtered) {
      if (r.status === 'pending') counts.pending++;
      else if (r.status === 'approved') counts.approved++;
      else if (r.status === 'rejected') counts.rejected++;
      else if (r.status === 'cancelled') counts.cancelled++;
      const h = hoursBetween(r.createdAt, r.respondedAt);
      if (h != null) {
        respondedCount++;
        respondedHoursTotal += h;
      }
    }
    const avgResponseHours =
      respondedCount > 0 ? respondedHoursTotal / respondedCount : null;
    return { ...counts, avgResponseHours, respondedCount };
  }, [filtered]);

  // ── Dept breakdown ──
  const deptBreakdown = useMemo(() => {
    const map = new Map<string, { code: string; count: number }>();
    for (const r of filtered) {
      const key = String(r.requestingDeptId);
      const cur = map.get(key) ?? {
        code: deptCode(r.requestingDeptId),
        count: 0,
      };
      cur.count++;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [filtered, departments]);

  const hasAnyFilter =
    statusFilter !== 'all' || deptFilter !== 'all' || timeRange !== 'all';

  const clearFilters = () => {
    setStatusFilter('all');
    setDeptFilter('all');
    setTimeRange('all');
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortHeader = ({
    label,
    sortKeyName,
  }: {
    label: string;
    sortKeyName: SortKey;
  }) => {
    const active = sortKey === sortKeyName;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortKeyName)}
        className={`inline-flex items-center gap-1 hover:text-primary transition ${
          active ? 'text-primary' : ''
        }`}
      >
        {label}
        <Icon
          name={
            !active
              ? 'unfold_more'
              : sortDir === 'asc'
              ? 'arrow_upward'
              : 'arrow_downward'
          }
          size={12}
        />
      </button>
    );
  };

  const columns: Column<FacultyRequest>[] = [
    {
      key: 'id',
      header: <SortHeader label="ID" sortKeyName="id" />,
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant font-mono text-xs',
      render: (r) => `#${r.requestId}`,
    },
    {
      key: 'requesting',
      header: <SortHeader label="Requesting" sortKeyName="dept" />,
      cardVariant: 'meta',
      cellClassName: 'text-on-surface text-xs',
      render: (r) => (
        <span className="font-mono font-bold text-primary">
          {deptCode(r.requestingDeptId)}
        </span>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      cardVariant: 'title',
      cellClassName: 'text-on-surface font-medium',
      render: (r) => (
        <span className="font-mono font-bold">{deptCode(r.targetDeptId)}</span>
      ),
    },
    {
      key: 'faculty',
      header: 'Faculty',
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (r) =>
        r.facultyId ? (
          <span className="font-mono">#{r.facultyId}</span>
        ) : (
          <span className="italic">any available</span>
        ),
    },
    {
      key: 'subject',
      header: 'Subject',
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (r) => <span className="font-mono">#{r.subjectId}</span>,
    },
    {
      key: 'created',
      header: <SortHeader label="Created" sortKeyName="created" />,
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (r) => (
        <span title={formatDate(r.createdAt)}>
          {relativeTime(r.createdAt) || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: <SortHeader label="Status" sortKeyName="status" />,
      cardVariant: 'badge',
      render: (r) => (
        <StatusBadge tone={STATUS_TONE[r.status]}>
          <span className="capitalize">{r.status}</span>
        </StatusBadge>
      ),
    },
    {
      key: 'responded',
      header: <SortHeader label="Responded" sortKeyName="responded" />,
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (r) => (
        <span title={formatDate(r.respondedAt)}>
          {r.respondedAt ? relativeTime(r.respondedAt) : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">
            Approvals Report
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Cross-department faculty assignment requests.
            {activeTerm
              ? ` ${activeTerm.termName} — AY ${activeTerm.schoolYear}.`
              : ''}
          </p>
        </div>
        <ApprovalsExportToolbar
          rows={sorted}
          deptCode={deptCode}
          deptName={deptName}
          termLabel={
            activeTerm
              ? `${activeTerm.termName} — AY ${activeTerm.schoolYear}`
              : 'All terms'
          }
        />
      </div>

      {/* Summary tiles — clickable filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryTile
          label="Total"
          value={summary.total}
          tone="neutral"
          onClick={() => setStatusFilter('all')}
          active={statusFilter === 'all'}
        />
        <SummaryTile
          label="Pending"
          value={summary.pending}
          tone="warning"
          onClick={() =>
            setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')
          }
          active={statusFilter === 'pending'}
        />
        <SummaryTile
          label="Approved"
          value={summary.approved}
          tone="success"
          onClick={() =>
            setStatusFilter(statusFilter === 'approved' ? 'all' : 'approved')
          }
          active={statusFilter === 'approved'}
        />
        <SummaryTile
          label="Rejected"
          value={summary.rejected}
          tone="danger"
          onClick={() =>
            setStatusFilter(statusFilter === 'rejected' ? 'all' : 'rejected')
          }
          active={statusFilter === 'rejected'}
        />
        <SummaryTile
          label="Avg response"
          value={fmtHoursShort(summary.avgResponseHours)}
          tone="neutral"
          hint={
            summary.respondedCount > 0
              ? `across ${summary.respondedCount} responded`
              : 'No responses yet'
          }
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
        <div className="min-w-[180px]">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="min-w-[150px]">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Time range
          </label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="term">This term</option>
          </select>
        </div>

        {!isDH && (
          <div className="min-w-[220px]">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Department
            </label>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="all">All departments</option>
              {departments
                .filter((d) => d.isActive)
                .map((d) => (
                  <option key={d.deptId} value={d.deptId}>
                    [{d.deptCode}] {d.deptName}
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
            Clear all
          </button>
        )}

        <div className="ml-auto text-xs text-on-surface-variant">
          Showing <strong className="text-on-surface">{sorted.length}</strong>{' '}
          of {requests.length}
        </div>
      </div>

      {/* Department breakdown (only when admin/dean and 2+ depts) */}
      {!isDH && deptBreakdown.length > 1 && (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-3">
            Top requesting departments
          </p>
          <div className="space-y-2">
            {deptBreakdown.map((d) => {
              const max = deptBreakdown[0]?.count ?? 1;
              const pct = Math.round((d.count / max) * 100);
              return (
                <div key={d.code} className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-primary w-16 truncate">
                    {d.code}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-slate-600 w-8 text-right">
                    {d.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table */}
      <ResponsiveTable
        columns={columns}
        rows={sorted}
        rowKey={(r) => r.requestId}
        rowTitle={(r) =>
          `${deptCode(r.requestingDeptId)} → ${deptCode(r.targetDeptId)}`
        }
        rowSubtitle={(r) =>
          `Request #${r.requestId} · ${formatDate(r.createdAt)}`
        }
        isLoading={isLoading}
        hasSourceRows={requests.length > 0}
        emptyMessage="No faculty requests yet."
        noMatchMessage="No requests match your filters."
        onRowClick={(r) =>
          navigate(`/dean/approvals?deptFilter=${r.targetDeptId}`)
        }
      />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  hint,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  tone: 'neutral' | 'warning' | 'success' | 'danger';
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClasses = {
    neutral: 'text-slate-600',
    warning: 'text-amber-600',
    success: 'text-emerald-600',
    danger: 'text-red-600',
  };
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={`text-left p-4 border rounded-xl transition w-full ${
        active
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-surface-variant bg-surface-container-lowest'
      } ${onClick ? 'hover:border-primary/40 cursor-pointer' : ''}`}
      title={hint}
    >
      <p
        className={`text-2xl font-extrabold leading-tight tabular-nums ${toneClasses[tone]}`}
      >
        {value}
      </p>
      <p className="text-xs font-semibold text-on-surface-variant mt-0.5">
        {label}
      </p>
      {hint && (
        <p className="text-[10px] text-on-surface-variant/70 mt-0.5">{hint}</p>
      )}
    </Comp>
  );
}