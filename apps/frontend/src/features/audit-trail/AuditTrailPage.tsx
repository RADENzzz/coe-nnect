import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchAuditEntries,
  fetchAuditActions,
  fetchAuditSources,
  type AuditEntry,
} from '../../api/audit.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import StatusBadge from '../../components/ui/StatusBadge';
import type { RowAction } from '../../components/ui/RowActionMenu';

const PAGE_SIZE = 50;

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

const ACTION_TONE: Record<
  string,
  'success' | 'info' | 'warning' | 'danger' | 'neutral' | 'purple'
> = {
  'schedule.create': 'success',
  'schedule.update': 'info',
  'schedule.status_change': 'warning',
  'schedule.delete': 'danger',
  'faculty_request.create': 'info',
  'faculty_request.approve': 'success',
  'faculty_request.reject': 'danger',
  'user.create': 'purple',
  'user.delete': 'danger',
  'system_config.update': 'neutral',
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

export default function AuditTrailPage() {
  const user = useAuthStore((s) => s.user);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState('');
  const [sourceSystem, setSourceSystem] = useState('');
  const [offset, setOffset] = useState(0);
  const [detailRow, setDetailRow] = useState<AuditEntry | null>(null);

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

  const formatActionLabel = (a: string) =>
    ACTION_LABELS[a] ?? a.replace(/[._]/g, ' ');

  const columns: Column<AuditEntry>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant font-mono text-xs whitespace-nowrap',
      render: (r) => formatTimestamp(r.timestamp),
    },
    {
      key: 'user',
      header: 'User',
      cardVariant: 'title',
      render: (r) => r.user?.username ?? '—',
    },
    {
      key: 'email',
      header: 'Email',
      cardVariant: 'meta',
      hideOnMobile: true,
      cellClassName: 'text-on-surface-variant text-[11px]',
      render: (r) => r.user?.email ?? '—',
    },
    {
      key: 'action',
      header: 'Action',
      cardVariant: 'badge',
      render: (r) => (
        <StatusBadge tone={ACTION_TONE[r.action] ?? 'neutral'}>
          {formatActionLabel(r.action)}
        </StatusBadge>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (r) => r.sourceSystem ?? '—',
    },
    {
      key: 'actions',
      header: 'Details',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (r: AuditEntry): RowAction[] => [
    {
      label: 'View details',
      icon: 'data_object',
      onClick: () => setDetailRow(r),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Audit Trail</h1>
        <p className="text-on-surface-variant text-sm mt-1">
          Every change to the system, tracked with user, timestamp, and affected data.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
        <div className="flex-1 min-w-[140px]">
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
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
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
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
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
        <div className="flex-1 min-w-[140px]">
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
          Showing <strong className="text-on-surface">{rows.length}</strong> of{' '}
          <strong className="text-on-surface">{total}</strong>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
          Failed to load audit entries:{' '}
          {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      <ResponsiveTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.auditId}
        rowTitle={(r) => formatActionLabel(r.action)}
        rowSubtitle={(r) => r.user?.username ?? '—'}
        isLoading={isLoading}
        hasSourceRows={total > 0}
        emptyMessage="No audit entries yet."
        noMatchMessage="No audit entries match your filters."
        getActions={getActions}
      />

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

      <Modal
        open={!!detailRow}
        onClose={() => setDetailRow(null)}
        title="Audit entry details"
        description={
          detailRow
            ? `${formatActionLabel(detailRow.action)} · ${formatTimestamp(detailRow.timestamp)}`
            : ''
        }
        size="lg"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                User
              </p>
              <p className="text-slate-900">{detailRow?.user?.username ?? '—'}</p>
              <p className="text-slate-500 text-xs">
                {detailRow?.user?.email ?? ''}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Source
              </p>
              <p className="text-slate-900">{detailRow?.sourceSystem ?? '—'}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Affected Data
            </p>
            <pre className="text-xs font-mono text-on-surface bg-surface-container-low border border-surface-variant rounded-lg p-3 overflow-x-auto max-h-96 whitespace-pre-wrap break-words">
              {detailRow?.affectedData
                ? JSON.stringify(detailRow.affectedData, null, 2)
                : 'No data captured'}
            </pre>
          </div>
        </div>
      </Modal>
    </div>
  );
}