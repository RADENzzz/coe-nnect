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
import ResponsiveTable, {
  type Column,
} from '../../components/ui/ResponsiveTable';
import StatusBadge from '../../components/ui/StatusBadge';
import ApprovalsExportToolbar from './export/ApprovalsExportToolbar';

type StatusFilter = 'all' | FacultyRequestStatus;

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

export default function ApprovalsReportPage() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isDH = profile?.role === 'department_head';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');

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
    queryFn: fetchDepartments,
    enabled: !!user,
  });

  const deptCode = (id: string) =>
    departments.find((d) => String(d.deptId) === String(id))?.deptCode ??
    `#${id}`;

  const deptName = (id: string) =>
    departments.find((d) => String(d.deptId) === String(id))?.deptName ??
    `#${id}`;

  // Apply filters
  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (deptFilter !== 'all') {
        const inReq = String(r.requestingDeptId) === deptFilter;
        const inTgt = String(r.targetDeptId) === deptFilter;
        if (!inReq && !inTgt) return false;
      }
      // DH: only see requests involving their department
      if (isDH && profile?.dept_id) {
        const myDept = String(profile.dept_id);
        const inReq = String(r.requestingDeptId) === myDept;
        const inTgt = String(r.targetDeptId) === myDept;
        if (!inReq && !inTgt) return false;
      }
      return true;
    });
  }, [requests, statusFilter, deptFilter, isDH, profile?.dept_id]);

  // Sort newest first
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = new Date(a.createdAt ?? 0).getTime();
      const db = new Date(b.createdAt ?? 0).getTime();
      return db - da;
    });
  }, [filtered]);

  // Summary counts
  const summary = useMemo(() => {
    const counts = {
      total: filtered.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    };
    for (const r of filtered) {
      if (r.status === 'pending') counts.pending++;
      else if (r.status === 'approved') counts.approved++;
      else if (r.status === 'rejected') counts.rejected++;
      else if (r.status === 'cancelled') counts.cancelled++;
    }
    return counts;
  }, [filtered]);

  const columns: Column<FacultyRequest>[] = [
    {
      key: 'id',
      header: 'ID',
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant font-mono text-xs',
      render: (r) => `#${r.requestId}`,
    },
    {
      key: 'requesting',
      header: 'Requesting',
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
      render: (r) => (
        <span className="font-mono">#{r.subjectId}</span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (r) => formatDate(r.createdAt),
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (r) => (
        <StatusBadge tone={STATUS_TONE[r.status]}>
          <span className="capitalize">{r.status}</span>
        </StatusBadge>
      ),
    },
    {
      key: 'responded',
      header: 'Responded',
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (r) => formatDate(r.respondedAt),
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

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryTile label="Total" value={summary.total} tone="neutral" />
        <SummaryTile label="Pending" value={summary.pending} tone="warning" />
        <SummaryTile label="Approved" value={summary.approved} tone="success" />
        <SummaryTile label="Rejected" value={summary.rejected} tone="danger" />
        <SummaryTile
          label="Cancelled"
          value={summary.cancelled}
          tone="neutral"
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

        {(statusFilter !== 'all' || deptFilter !== 'all') && (
          <button
            onClick={() => {
              setStatusFilter('all');
              setDeptFilter('all');
            }}
            className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
          >
            Clear
          </button>
        )}

        <div className="ml-auto text-xs text-on-surface-variant">
          Showing <strong className="text-on-surface">{sorted.length}</strong>{' '}
          of {requests.length}
        </div>
      </div>

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
      />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'warning' | 'success' | 'danger';
}) {
  const toneClasses = {
    neutral: 'text-slate-600 dark:text-slate-300',
    warning: 'text-amber-600 dark:text-amber-400',
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-red-600 dark:text-red-400',
  };
  return (
    <div
      className="p-4 border"
      style={{
        backgroundColor: 'rgb(var(--surface))',
        borderColor: 'rgb(var(--outline-variant))',
      }}
    >
      <p
        className={`text-2xl font-extrabold leading-tight ${toneClasses[tone]}`}
      >
        {value}
      </p>
      <p className="text-xs font-semibold text-on-surface-variant mt-0.5">
        {label}
      </p>
    </div>
  );
}