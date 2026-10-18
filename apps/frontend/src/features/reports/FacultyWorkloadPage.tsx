import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { fetchFaculty, type FacultyClass } from '../../api/faculty.api';
import { fetchDepartments } from '../../api/departments.api';
import {
  fetchSchedules,
  fetchActiveTerm,
  type RawSchedule,
} from '../../api/schedule.api';
import { fetchDesignations } from '../../api/system-config.api';
import Icon from '../../components/ui/Icon';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import StatusBadge from '../../components/ui/StatusBadge';
import type { RowAction } from '../../components/ui/RowActionMenu';
import { timeToMinutes } from '../timetable/utils/time.util';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type StatusTone = 'danger' | 'warning' | 'success' | 'neutral';
type WorkloadStatus = 'overload' | 'full' | 'under' | 'idle';
type SortKey = 'name' | 'assigned' | 'remaining' | 'status';
type SortDir = 'asc' | 'desc';

interface WorkloadRow {
  facultyId: string;
  firstName: string;
  lastName: string;
  classification: FacultyClass;
  deptId: string | null;
  assignedHours: number;
  requiredHours: number;
  remaining: number;
  overloadHours: number;
  underloadHours: number;
  status: WorkloadStatus;
  entryCount: number;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const DEFAULT_REQUIRED_HOURS = 18;
const FULL_BAND_HOURS = 2;

const STATUS_META: Record<
  WorkloadStatus,
  { label: string; tone: StatusTone; color: string; barColor: string }
> = {
  overload: {
    label: 'Overload',
    tone: 'danger',
    color: 'text-red-700',
    barColor: 'bg-red-500',
  },
  under: {
    label: 'Under',
    tone: 'warning',
    color: 'text-amber-700',
    barColor: 'bg-amber-500',
  },
  full: {
    label: 'Full',
    tone: 'success',
    color: 'text-emerald-700',
    barColor: 'bg-emerald-500',
  },
  idle: {
    label: 'No load',
    tone: 'neutral',
    color: 'text-slate-500',
    barColor: 'bg-slate-300',
  },
};

const CLASSIFICATION_TONE: Record<
  FacultyClass,
  'info' | 'warning' | 'purple' | 'neutral'
> = {
  regular: 'info',
  part_time: 'warning',
  visiting_lecturer: 'purple',
  other: 'neutral',
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function scheduleHours(s: RawSchedule): number {
  const start = s.startTime ?? s.timeSlot?.startTime ?? null;
  const end = s.endTime ?? s.timeSlot?.endTime ?? null;
  if (!start || !end) return 0;
  const startMin = timeToMinutes(start.slice(0, 5));
  const endMin = timeToMinutes(end.slice(0, 5));
  return Math.max(0, (endMin - startMin) / 60);
}

function classify(assigned: number, required: number): WorkloadStatus {
  if (assigned === 0) return 'idle';
  if (assigned > required + FULL_BAND_HOURS) return 'overload';
  if (Math.abs(assigned - required) <= FULL_BAND_HOURS) return 'full';
  return 'under';
}

function formatHours(h: number): string {
  return `${h.toFixed(1)}h`;
}

// ─────────────────────────────────────────────
// Summary Tile
// ─────────────────────────────────────────────

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
  tone: StatusTone;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const iconMap: Record<StatusTone, string> = {
    danger: 'error',
    warning: 'warning',
    success: 'check_circle',
    neutral: 'remove_circle_outline',
  };
  const iconBg: Record<StatusTone, string> = {
    danger: 'bg-red-50 border-red-200',
    warning: 'bg-amber-50 border-amber-200',
    success: 'bg-emerald-50 border-emerald-200',
    neutral: 'bg-slate-50 border-slate-200',
  };
  const iconColor: Record<StatusTone, string> = {
    danger: 'text-red-600',
    warning: 'text-amber-600',
    success: 'text-emerald-600',
    neutral: 'text-slate-500',
  };

  const Comp = onClick ? 'button' : 'div';

  return (
    <Comp
      onClick={onClick}
      className={`text-left p-4 border rounded-xl flex items-start gap-3 transition w-full ${
        active
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-surface-variant bg-surface-container-lowest'
      } ${onClick ? 'hover:border-primary/40 cursor-pointer' : ''}`}
      title={hint}
    >
      <div
        className={`w-9 h-9 border flex items-center justify-center shrink-0 rounded-lg ${iconBg[tone]}`}
      >
        <Icon name={iconMap[tone]} filled size={18} className={iconColor[tone]} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold text-on-surface leading-tight tabular-nums">
          {value}
        </p>
        <p className="text-xs font-semibold text-on-surface-variant">{label}</p>
        {hint && (
          <p className="text-[10px] text-on-surface-variant/70 mt-0.5">
            {hint}
          </p>
        )}
      </div>
    </Comp>
  );
}

// ─────────────────────────────────────────────
// Workload bar (inline mini-chart)
// ─────────────────────────────────────────────

function WorkloadBar({
  assigned,
  required,
}: {
  assigned: number;
  required: number;
}) {
  // Scale: 0 to max(assigned, required) * 1.15
  const max = Math.max(assigned, required) * 1.15 || 1;
  const assignedPct = (assigned / max) * 100;
  const requiredPct = (required / max) * 100;
  const isOver = assigned > required + FULL_BAND_HOURS;

  return (
    <div className="relative w-full h-2 rounded-full bg-slate-100 overflow-hidden min-w-[80px]">
      <div
        className="absolute inset-y-0 left-0 bg-primary/40 rounded-full"
        style={{ width: `${assignedPct}%` }}
      />
      {isOver && (
        <div
          className="absolute inset-y-0 left-0 bg-red-500/70 rounded-full"
          style={{ width: `${assignedPct}%` }}
        />
      )}
      {/* Marker for required */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-slate-900"
        style={{ left: `${requiredPct}%` }}
        title={`Required: ${formatHours(required)}`}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function FacultyWorkloadPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);

  const isDH = profile?.role === 'department_head';
  const isDeanOrAdmin =
    profile?.role === 'college_dean' || profile?.role === 'administrator';
  const prefix = isDeanOrAdmin ? '/dean' : '';

    

  const [deptFilter, setDeptFilter] = useState<string>(() =>
    isDH && profile?.dept_id ? String(profile.dept_id) : 'all',
  );
  const [classFilter, setClassFilter] = useState<'all' | FacultyClass>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | WorkloadStatus>(
    'all',
  );
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [search, setSearch] = useState('');

  // ── Data ──
  const { data: activeTerm } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
    enabled: !!user,
  });

  const { data: faculty = [], isLoading: facLoading } = useQuery({
    queryKey: ['faculty', { includeInactive: false }],
    queryFn: () => fetchFaculty(false),
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: !!user,
  });

  const { data: designations = [] } = useQuery({
    queryKey: ['designations'],
    queryFn: fetchDesignations,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: schedules = [], isLoading: schedLoading } = useQuery({
    queryKey: ['schedules', activeTerm?.termId],
    queryFn: () => fetchSchedules(activeTerm?.termId),
    enabled: !!user && !!activeTerm,
  });

  const isLoading = facLoading || schedLoading;

  // ── Compute workload rows ──
  const rows = useMemo<WorkloadRow[]>(() => {
    const releaseById = new Map<string, number>();
    for (const d of designations) {
      releaseById.set(String(d.designationId), Number(d.releaseHours ?? 0));
    }

    const schedulesByFaculty = new Map<string, RawSchedule[]>();
    for (const s of schedules) {
      const fid = s.facultyId ?? '';
      if (!fid) continue;
      if (!schedulesByFaculty.has(fid)) schedulesByFaculty.set(fid, []);
      schedulesByFaculty.get(fid)!.push(s);
    }

    return faculty.map((f) => {
      const entries = schedulesByFaculty.get(f.facultyId) ?? [];
      const assigned = entries.reduce((sum, s) => sum + scheduleHours(s), 0);

      const baseRequired = f.requiredHours ?? DEFAULT_REQUIRED_HOURS;
      const release = f.designationId
        ? releaseById.get(String(f.designationId)) ?? 0
        : 0;
      const required = Math.max(0, baseRequired - release);

      return {
        facultyId: f.facultyId,
        firstName: f.firstName,
        lastName: f.lastName,
        classification: f.classification,
        deptId: f.deptId,
        assignedHours: assigned,
        requiredHours: required,
        remaining: required - assigned,
        overloadHours: Math.max(0, assigned - required),
        underloadHours: Math.max(0, required - assigned),
        status: classify(assigned, required),
        entryCount: entries.length,
      };
    });
  }, [faculty, schedules, designations]);

  // ── Filter ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (deptFilter !== 'all' && String(r.deptId ?? '') !== deptFilter) {
        return false;
      }
      if (classFilter !== 'all' && r.classification !== classFilter) {
        return false;
      }
      if (statusFilter !== 'all' && r.status !== statusFilter) {
        return false;
      }
      if (q) {
        const name = `${r.lastName}, ${r.firstName}`.toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [rows, deptFilter, classFilter, statusFilter, search]);

  // ── Sort ──
  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return (
            `${a.lastName}, ${a.firstName}`.localeCompare(
              `${b.lastName}, ${b.firstName}`,
            ) * dir
          );
        case 'assigned':
          return (a.assignedHours - b.assignedHours) * dir;
        case 'remaining':
          return (a.remaining - b.remaining) * dir;
        case 'status': {
          const order: Record<WorkloadStatus, number> = {
            overload: 0,
            under: 1,
            full: 2,
            idle: 3,
          };
          const oa = order[a.status];
          const ob = order[b.status];
          if (oa !== ob) return (oa - ob) * dir;
          return a.remaining - b.remaining;
        }
      }
    });
  }, [filtered, sortKey, sortDir]);

  // ── Summary ──
  const summary = useMemo(() => {
    let overload = 0;
    let under = 0;
    let full = 0;
    let idle = 0;
    let overloadTotal = 0;
    let underloadTotal = 0;
    for (const r of filtered) {
      if (r.status === 'overload') overload++;
      else if (r.status === 'under') under++;
      else if (r.status === 'full') full++;
      else idle++;
      overloadTotal += r.overloadHours;
      underloadTotal += r.underloadHours;
    }
    return {
      overload,
      under,
      full,
      idle,
      overloadTotal,
      underloadTotal,
      total: filtered.length,
    };
  }, [filtered]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const clearFilters = () => {
    setClassFilter('all');
    setStatusFilter('all');
    setSearch('');
    if (isDeanOrAdmin) setDeptFilter('all');
  };

  const hasAnyFilter =
    classFilter !== 'all' ||
    statusFilter !== 'all' ||
    !!search ||
    (isDeanOrAdmin && deptFilter !== 'all');

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

  // ── Columns ──
  const columns: Column<WorkloadRow>[] = [
    {
      key: 'name',
      header: <SortHeader label="Faculty" sortKeyName="name" />,
      cardVariant: 'title',
      cellClassName: 'text-on-surface font-medium',
      render: (r) => `${r.lastName}, ${r.firstName}`,
    },
    {
      key: 'classification',
      header: 'Class',
      cardVariant: 'badge',
      render: (r) => (
        <StatusBadge tone={CLASSIFICATION_TONE[r.classification]}>
          {r.classification.replace('_', ' ')}
        </StatusBadge>
      ),
    },
    {
      key: 'assigned',
      header: <SortHeader label="Assigned" sortKeyName="assigned" />,
      cardVariant: 'mono',
      cellClassName: 'text-on-surface font-mono text-xs',
      render: (r) => formatHours(r.assignedHours),
    },
    {
      key: 'required',
      header: 'Required',
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant font-mono text-xs',
      render: (r) => formatHours(r.requiredHours),
    },
    {
      key: 'remaining',
      header: <SortHeader label="Remaining" sortKeyName="remaining" />,
      cardVariant: 'mono',
      cellClassName: 'font-mono text-xs',
      render: (r) => (
        <span
          className={
            r.remaining < 0 ? 'text-red-700 font-semibold' : 'text-on-surface-variant'
          }
        >
          {r.remaining < 0 ? '−' : ''}
          {formatHours(Math.abs(r.remaining))}
        </span>
      ),
    },
    {
      key: 'bar',
      header: 'Load',
      cardVariant: 'mono',
      cellClassName: '',
      render: (r) => (
        <div className="min-w-[100px] max-w-[160px]">
          <WorkloadBar assigned={r.assignedHours} required={r.requiredHours} />
        </div>
      ),
    },
    {
      key: 'status',
      header: <SortHeader label="Status" sortKeyName="status" />,
      cardVariant: 'badge',
      render: (r) => {
        const meta = STATUS_META[r.status];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: () => null,
    },
  ];

  const getActions = (r: WorkloadRow): RowAction[] => [
    {
      label: 'Open faculty',
      icon: 'edit',
      onClick: () => navigate(`${prefix}/faculty?focus=${r.facultyId}`),
    },
    {
      label: 'View schedule',
      icon: 'grid_on',
      onClick: () => navigate(`${prefix}/timetable?faculty=${r.facultyId}`),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-on-surface">
          Faculty Workload Summary
        </h1>
        <p className="text-on-surface-variant text-sm mt-1">
          Compare each faculty member's assigned hours against their required
          load.
          {activeTerm
            ? ` ${activeTerm.termName} — AY ${activeTerm.schoolYear}.`
            : ''}
        </p>
      </div>

      {!activeTerm && (
        <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm flex items-start gap-2">
          <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
          <span>
            No active term — workload can't be computed until an administrator
            sets one.
          </span>
        </div>
      )}

      {/* Summary tiles (clickable filters) */}
      {activeTerm && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryTile
            label="Total"
            value={summary.total}
            tone="neutral"
            onClick={() => setStatusFilter('all')}
            active={statusFilter === 'all'}
          />
          <SummaryTile
            label="Overloaded"
            value={summary.overload}
            tone="danger"
            hint={`${formatHours(summary.overloadTotal)} over`}
            onClick={() =>
              setStatusFilter(statusFilter === 'overload' ? 'all' : 'overload')
            }
            active={statusFilter === 'overload'}
          />
          <SummaryTile
            label="Under-loaded"
            value={summary.under}
            tone="warning"
            hint={`${formatHours(summary.underloadTotal)} under`}
            onClick={() =>
              setStatusFilter(statusFilter === 'under' ? 'all' : 'under')
            }
            active={statusFilter === 'under'}
          />
          <SummaryTile
            label="Full"
            value={summary.full}
            tone="success"
            hint="Within ±2h"
            onClick={() =>
              setStatusFilter(statusFilter === 'full' ? 'all' : 'full')
            }
            active={statusFilter === 'full'}
          />
          <SummaryTile
            label="No load"
            value={summary.idle}
            tone="neutral"
            hint="Zero hours"
            onClick={() =>
              setStatusFilter(statusFilter === 'idle' ? 'all' : 'idle')
            }
            active={statusFilter === 'idle'}
          />
          <SummaryTile
            label="Total Overload"
            value={formatHours(summary.overloadTotal)}
            tone="danger"
            hint="Sum across filtered"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Search
          </label>
          <div className="relative">
            <Icon
              name="search"
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Faculty name…"
              className="w-full pl-9 pr-9 py-2 text-sm bg-surface-container-low border border-surface-variant rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                aria-label="Clear"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        </div>

        {isDeanOrAdmin && (
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

        <div className="min-w-[180px]">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Classification
          </label>
          <select
            value={classFilter}
            onChange={(e) =>
              setClassFilter(e.target.value as 'all' | FacultyClass)
            }
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">All classifications</option>
            <option value="regular">Regular</option>
            <option value="part_time">Part-Time</option>
            <option value="visiting_lecturer">Visiting Lecturer</option>
            <option value="other">Other</option>
          </select>
        </div>

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
          of {rows.length}
        </div>
      </div>

      {/* Table */}
      <ResponsiveTable
        columns={columns}
        rows={sorted}
        rowKey={(r) => r.facultyId}
        rowTitle={(r) => `${r.lastName}, ${r.firstName}`}
        rowSubtitle={(r) =>
          `${formatHours(r.assignedHours)} assigned · ${r.entryCount} schedule entr${
            r.entryCount === 1 ? 'y' : 'ies'
          }`
        }
        isLoading={isLoading}
        hasSourceRows={faculty.length > 0}
        emptyMessage="No faculty to report on."
        noMatchMessage="No faculty match your filters."
        getActions={getActions}
        onRowClick={(r) => navigate(`${prefix}/timetable?faculty=${r.facultyId}`)}
      />
    </div>
  );
}