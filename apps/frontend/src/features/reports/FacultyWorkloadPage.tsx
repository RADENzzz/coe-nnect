import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchFaculty,
  type FacultyClass,
} from '../../api/faculty.api';
import { fetchDepartments } from '../../api/departments.api';
import {
  fetchSchedules,
  fetchActiveTerm,
  type RawSchedule,
} from '../../api/schedule.api';
import { fetchDesignations } from '../../api/system-config.api';
import Icon from '../../components/ui/Icon';
import ResponsiveTable, {
  type Column,
} from '../../components/ui/ResponsiveTable';
import StatusBadge from '../../components/ui/StatusBadge';
import { timeToMinutes } from '../timetable/utils/time.util';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type StatusTone = 'danger' | 'warning' | 'success' | 'neutral';
type WorkloadStatus = 'overload' | 'full' | 'under' | 'idle';

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

/** Default required hours when neither `faculty.requiredHours` nor a designation applies. */
const DEFAULT_REQUIRED_HOURS = 18;

/** |assigned − required| ≤ this → considered "full". */
const FULL_BAND_HOURS = 2;

const STATUS_META: Record<
  WorkloadStatus,
  { label: string; tone: StatusTone }
> = {
  overload: { label: 'Overload', tone: 'danger' },
  under: { label: 'Under', tone: 'warning' },
  full: { label: 'Full', tone: 'success' },
  idle: { label: 'No load', tone: 'neutral' },
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

/** Duration of a schedule entry in hours. */
function scheduleHours(s: RawSchedule): number {
  const start = s.startTime ?? s.timeSlot?.startTime ?? null;
  const end = s.endTime ?? s.timeSlot?.endTime ?? null;
  if (!start || !end) return 0;
  const startMin = timeToMinutes(start.slice(0, 5));
  const endMin = timeToMinutes(end.slice(0, 5));
  return Math.max(0, (endMin - startMin) / 60);
}

function classify(
  assigned: number,
  required: number,
): WorkloadStatus {
  if (assigned === 0) return 'idle';
  if (assigned > required + FULL_BAND_HOURS) return 'overload';
  if (Math.abs(assigned - required) <= FULL_BAND_HOURS) return 'full';
  return 'under';
}

function formatHours(h: number): string {
  return `${h.toFixed(1)}h`;
}

// ─────────────────────────────────────────────
// Summary tile
// ─────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: StatusTone;
  hint?: string;
}) {
  
  const iconMap: Record<StatusTone, string> = {
    danger: 'error',
    warning: 'warning',
    success: 'check_circle',
    neutral: 'remove_circle_outline',
  };
  const iconBg: Record<StatusTone, string> = {
    danger: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800',
    warning: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800',
    success: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800',
    neutral: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
  };
  const iconColor: Record<StatusTone, string> = {
    danger: 'text-red-600 dark:text-red-400',
    warning: 'text-amber-600 dark:text-amber-400',
    success: 'text-emerald-600 dark:text-emerald-400',
    neutral: 'text-slate-500 dark:text-slate-400',
  };
  return (
    <div
      className="p-4 border flex items-start gap-3"
      style={{
        backgroundColor: 'rgb(var(--surface))',
        borderColor: 'rgb(var(--outline-variant))',
      }}
    >
      <div
        className={`w-9 h-9 border flex items-center justify-center shrink-0 ${iconBg[tone]}`}
      >
        <Icon name={iconMap[tone]} filled size={18} className={iconColor[tone]} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold text-on-surface leading-tight">
          {value}
        </p>
        <p className="text-xs font-semibold text-on-surface-variant">{label}</p>
        {hint && (
          <p className="text-[10px] text-on-surface-variant/70 mt-0.5">{hint}</p>
        )}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function FacultyWorkloadPage() {
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);

  const isDH = profile?.role === 'department_head';
  const isDeanOrAdmin =
    profile?.role === 'college_dean' || profile?.role === 'administrator';

  const [deptFilter, setDeptFilter] = useState<string>(() =>
    isDH && profile?.dept_id ? String(profile.dept_id) : 'all',
  );
  const [classFilter, setClassFilter] = useState<'all' | FacultyClass>('all');
  const [onlyProblem, setOnlyProblem] = useState(false);

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
    // Designation → release hours
    const releaseById = new Map<string, number>();
    for (const d of designations) {
      releaseById.set(String(d.designationId), Number(d.releaseHours ?? 0));
    }

    // Group schedule entries by facultyId
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
      const overloadHours = Math.max(0, assigned - required);
      const underloadHours = Math.max(0, required - assigned);

      return {
        facultyId: f.facultyId,
        firstName: f.firstName,
        lastName: f.lastName,
        classification: f.classification,
        deptId: f.deptId,
        assignedHours: assigned,
        requiredHours: required,
        remaining: required - assigned,
        overloadHours,
        underloadHours,
        status: classify(assigned, required),
        entryCount: entries.length,
      };
    });
  }, [faculty, schedules, designations]);

  // ── Apply filters ──
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (deptFilter !== 'all' && String(r.deptId ?? '') !== deptFilter) {
        return false;
      }
      if (classFilter !== 'all' && r.classification !== classFilter) {
        return false;
      }
      if (onlyProblem && r.status !== 'overload' && r.status !== 'under') {
        return false;
      }
      return true;
    });
  }, [rows, deptFilter, classFilter, onlyProblem]);

  // ── Sort: overload → under → full → idle; ties by remaining asc ──
  const sorted = useMemo(() => {
    const order: Record<WorkloadStatus, number> = {
      overload: 0,
      under: 1,
      full: 2,
      idle: 3,
    };
    return [...filtered].sort((a, b) => {
      const oa = order[a.status];
      const ob = order[b.status];
      if (oa !== ob) return oa - ob;
      return a.remaining - b.remaining;
    });
  }, [filtered]);

  // ── Summary counts ──
  const summary = useMemo(() => {
    let overload = 0;
    let under = 0;
    let full = 0;
    let idle = 0;
    for (const r of filtered) {
      if (r.status === 'overload') overload++;
      else if (r.status === 'under') under++;
      else if (r.status === 'full') full++;
      else idle++;
    }
    return { overload, under, full, idle };
  }, [filtered]);

  const totals = useMemo(() => {
    let overloadTotal = 0;
    let underloadTotal = 0;
    for (const r of filtered) {
      overloadTotal += r.overloadHours;
      underloadTotal += r.underloadHours;
    }
    return { overloadTotal, underloadTotal };
    }, [filtered]);

  // ── Columns ──
  const columns: Column<WorkloadRow>[] = [
    {
      key: 'name',
      header: 'Faculty',
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
      header: 'Assigned',
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
      header: 'Remaining',
      cardVariant: 'mono',
      cellClassName: 'font-mono text-xs',
      render: (r) => (
        <span
          className={
            r.remaining < 0
              ? 'text-red-700 dark:text-red-400'
              : 'text-on-surface-variant'
          }
        >
          {r.remaining < 0 ? '−' : ''}
          {formatHours(Math.abs(r.remaining))}
        </span>
      ),
    },
    {
      key: 'overload',
      header: 'Overload',
      cardVariant: 'mono',
      cellClassName: 'font-mono text-xs text-red-700 dark:text-red-400',
      render: (r) =>
        r.overloadHours > 0 ? `+${formatHours(r.overloadHours)}` : '—',
    },
    {
      key: 'underload',
      header: 'Under',
      cardVariant: 'mono',
      cellClassName: 'font-mono text-xs text-amber-700 dark:text-amber-400',
      render: (r) =>
        r.underloadHours > 0 ? `−${formatHours(r.underloadHours)}` : '—',
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (r) => {
        const meta = STATUS_META[r.status];
        return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
      },
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
        <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-sm">
          No active term — workload can't be computed until an administrator
          sets one.
        </div>
      )}

      {/* Summary tiles */}
      {activeTerm && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryTile
            label="Overloaded"
            value={summary.overload}
            tone="danger"
            hint="Above required"
          />
          <SummaryTile
            label="Under-loaded"
            value={summary.under}
            tone="warning"
            hint="Below required"
          />
          <SummaryTile
            label="Full"
            value={summary.full}
            tone="success"
            hint="Within ±2h"
          />
          <SummaryTile
            label="No load"
            value={summary.idle}
            tone="neutral"
            hint="Zero hours"
          />
          <SummaryTile
            label="Total Overload"
            value={Number(totals.overloadTotal.toFixed(1))}
            tone="danger"
            hint="Sum across filtered"
          />
          <SummaryTile
            label="Total Under"
            value={Number(totals.underloadTotal.toFixed(1))}
            tone="warning"
            hint="Sum across filtered"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
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

        <label className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyProblem}
            onChange={(e) => setOnlyProblem(e.target.checked)}
            className="accent-[#5c1219]"
          />
          Only overloaded / under-loaded
        </label>

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
          `${r.entryCount} schedule entr${r.entryCount === 1 ? 'y' : 'ies'}`
        }
        isLoading={isLoading}
        hasSourceRows={faculty.length > 0}
        emptyMessage="No faculty to report on."
        noMatchMessage="No faculty match your filters."
      />
    </div>
  );
}