import { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchAuditEntries,
  fetchAuditActions,
  fetchAuditSources,
  type AuditEntry,
} from '../../api/audit.api';
import Icon from '../../components/ui/Icon';

const PAGE_SIZE = 50;

// Human-readable labels for each action
const ACTION_LABELS: Record<string, string> = {
  'schedule.create': 'Schedule created',
  'schedule.update': 'Schedule updated',
  'schedule.status_change': 'Schedule status changed',
  'schedule.delete': 'Schedule deleted',
  'faculty_request.create': 'Faculty request created',
  'faculty_request.approve': 'Faculty request approved',
  'faculty_request.reject': 'Faculty request rejected',
  'user.create': 'User created',
  'user.delete': 'User deleted',
  'system_config.update': 'System settings updated',
};

const ACTION_BADGE_STYLES: Record<string, string> = {
  'schedule.create': 'bg-emerald-100 text-emerald-800',
  'schedule.update': 'bg-blue-100 text-blue-800',
  'schedule.status_change': 'bg-amber-100 text-amber-800',
  'schedule.delete': 'bg-red-100 text-red-800',
  'faculty_request.create': 'bg-indigo-100 text-indigo-800',
  'faculty_request.approve': 'bg-emerald-100 text-emerald-800',
  'faculty_request.reject': 'bg-red-100 text-red-800',
  'user.create': 'bg-purple-100 text-purple-800',
  'user.delete': 'bg-red-100 text-red-800',
  'system_config.update': 'bg-slate-200 text-slate-800',
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function AuditTrailPage() {
  const user = useAuthStore((s) => s.user);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState('');
  const [sourceSystem, setSourceSystem] = useState('');
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Filter option sources ──
  const { data: actionOptions = [] } = useQuery({
    queryKey: ['audit-actions'],
    queryFn: fetchAuditActions,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: sourceOptions = [] } = useQuery({
    queryKey: ['audit-sources'],
    queryFn: fetchAuditSources,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // ── Entries ──
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-entries', { from, to, action, sourceSystem, offset }],
    queryFn: () =>
      fetchAuditEntries({
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        action: action || undefined,
        sourceSystem: sourceSystem || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    enabled: !!user,
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasFilters = Boolean(from || to || action || sourceSystem);

  const clearFilters = () => {
    setFrom('');
    setTo('');
    setAction('');
    setSourceSystem('');
    setOffset(0);
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const formatActionLabel = (a: string) =>
    ACTION_LABELS[a] ?? a.replace(/[._]/g, ' ');

  const badgeStyle = (a: string) =>
    ACTION_BADGE_STYLES[a] ?? 'bg-slate-100 text-slate-700';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Audit Trail</h1>
        <p className="text-on-surface-variant text-sm mt-1">
          Every change to the system, tracked with user, timestamp, and affected data.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            From
          </label>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => {
              setFrom(e.target.value);
              setOffset(0);
            }}
            className="bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            To
          </label>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => {
              setTo(e.target.value);
              setOffset(0);
            }}
            className="bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div className="min-w-[200px]">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Action
          </label>
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setOffset(0);
            }}
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All actions</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>
                {formatActionLabel(a)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px]">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Source
          </label>
          <select
            value={sourceSystem}
            onChange={(e) => {
              setSourceSystem(e.target.value);
              setOffset(0);
            }}
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            <option value="">All sources</option>
            {sourceOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
          >
            Clear
          </button>
        )}
        <div className="ml-auto text-xs text-on-surface-variant">
          Showing{' '}
          <strong className="text-on-surface">{rows.length}</strong> of{' '}
          <strong className="text-on-surface">{total}</strong>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
          Failed to load audit entries:{' '}
          {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-variant text-on-surface-variant text-xs uppercase tracking-wider bg-surface-container-low">
              <th className="text-left px-5 py-3">Timestamp</th>
              <th className="text-left px-5 py-3">User</th>
              <th className="text-left px-5 py-3">Action</th>
              <th className="text-left px-5 py-3">Source</th>
              <th className="text-right px-5 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-8 text-center text-on-surface-variant"
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading…
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-12 text-center text-on-surface-variant"
                >
                  {hasFilters
                    ? 'No audit entries match your filters.'
                    : 'No audit entries yet. Changes to schedules, users, and system settings will appear here.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <AuditRow
                  key={row.auditId}
                  row={row}
                  expanded={expandedId === row.auditId}
                  onToggle={() => toggleExpand(row.auditId)}
                  formatAction={formatActionLabel}
                  badgeStyle={badgeStyle}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-on-surface-variant">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0 || isLoading}
              className="px-3 py-2 rounded-lg border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <button
              onClick={() =>
                setOffset(
                  offset + PAGE_SIZE < total ? offset + PAGE_SIZE : offset,
                )
              }
              disabled={offset + PAGE_SIZE >= total || isLoading}
              className="px-3 py-2 rounded-lg border border-surface-variant text-sm font-semibold text-on-surface hover:bg-surface-container-low transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────
// Row + expander
// ────────────────────────────────────────────

function AuditRow({
  row,
  expanded,
  onToggle,
  formatAction,
  badgeStyle,
}: {
  row: AuditEntry;
  expanded: boolean;
  onToggle: () => void;
  formatAction: (a: string) => string;
  badgeStyle: (a: string) => string;
}) {
  return (
    <>
      <tr className="border-b border-white/5 hover:bg-surface-container-low">
        <td className="px-5 py-3.5 text-on-surface-variant font-mono text-xs whitespace-nowrap">
          {formatTimestamp(row.timestamp)}
        </td>
        <td className="px-5 py-3.5">
          {row.user ? (
            <div>
              <p className="text-on-surface font-medium text-xs">
                {row.user.username}
              </p>
              <p className="text-on-surface-variant text-[11px]">
                {row.user.email}
              </p>
            </div>
          ) : (
            <span className="text-on-surface-variant text-xs">—</span>
          )}
        </td>
        <td className="px-5 py-3.5">
          <span
            className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${badgeStyle(
              row.action,
            )}`}
          >
            {formatAction(row.action)}
          </span>
        </td>
        <td className="px-5 py-3.5 text-on-surface-variant text-xs">
          {row.sourceSystem ?? '—'}
        </td>
        <td className="px-5 py-3.5 text-right">
          <button
            onClick={onToggle}
            className="text-xs px-3 py-1 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition inline-flex items-center gap-1"
          >
            <Icon
              name={expanded ? 'expand_less' : 'expand_more'}
              size={14}
            />
            {expanded ? 'Hide' : 'View'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface-container-low border-b border-white/5">
          <td colSpan={5} className="px-5 py-4">
            <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              Affected Data
            </p>
            <pre className="text-xs font-mono text-on-surface bg-surface-container-lowest border border-surface-variant rounded-lg p-3 overflow-x-auto max-h-96 whitespace-pre-wrap break-words">
              {row.affectedData
                ? JSON.stringify(row.affectedData, null, 2)
                : 'No data captured'}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}