import { useState, useMemo } from 'react';
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
  'schedule.auto_generate': 'Auto-generated schedule',
  'schedule.clear_auto_drafts': 'Cleared auto-drafts',
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
  'schedule.auto_generate': 'purple',
  'schedule.clear_auto_drafts': 'neutral',
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

function initials(username?: string | null): string {
  if (!username) return '—';
  return username.slice(0, 2).toUpperCase();
}

type DatePreset = 'all' | 'today' | '7d' | '30d';

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function AuditTrailPage() {
  const user = useAuthStore((s) => s.user);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState('');
  const [sourceSystem, setSourceSystem] = useState('');
  const [userId, setUserId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [detailRow, setDetailRow] = useState<AuditEntry | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');

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

  // Load a broader set to populate the user filter dropdown.
  // (100 entries is plenty for a demo; filter by user still works server-side.)
  const { data: userDirectory } = useQuery({
    queryKey: ['audit-user-directory'],
    queryFn: () =>
      fetchAuditEntries({ limit: 200, offset: 0 }),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: [
      'audit-entries',
      { from, to, action, sourceSystem, userId, offset },
    ],
    queryFn: () =>
      fetchAuditEntries({
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        action: action || undefined,
        userId: userId || undefined,
        sourceSystem: sourceSystem || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    enabled: !!user,
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  // ── Client-side search across the current page ──
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const haystack = [
        r.user?.username ?? '',
        r.user?.email ?? '',
        r.action,
        r.sourceSystem ?? '',
        JSON.stringify(r.affectedData ?? {}),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchQuery]);

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(
    from || to || action || sourceSystem || userId || searchQuery,
  );

  // ── Distinct users from the loaded page (for the filter dropdown) ──
  const userOptions = useMemo(() => {
    const map = new Map<string, { userId: string; username: string }>();
    for (const r of userDirectory?.rows ?? []) {
      if (r.user?.userId && !map.has(r.user.userId)) {
        map.set(r.user.userId, {
          userId: r.user.userId,
          username: r.user.username,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.username.localeCompare(b.username),
    );
  }, [userDirectory?.rows]);

  const clearFilters = () => {
    setFrom('');
    setTo('');
    setAction('');
    setSourceSystem('');
    setUserId('');
    setSearchQuery('');
    setOffset(0);
    setDatePreset('all');
  };

  const applyPreset = (preset: DatePreset) => {
    setDatePreset(preset);
    setOffset(0);

    if (preset === 'all') {
      setFrom('');
      setTo('');
      return;
    }

    const today = new Date();
    const toStr = toIsoDate(today);

    if (preset === 'today') {
      setFrom(toStr);
      setTo(toStr);
      return;
    }

    const daysBack = preset === '7d' ? 7 : 30;
    const start = new Date();
    start.setDate(start.getDate() - daysBack);
    setFrom(toIsoDate(start));
    setTo(toStr);
  };

  const formatActionLabel = (a: string) =>
    ACTION_LABELS[a] ?? a.replace(/[._]/g, ' ');

  // ── CSV export ──
  const handleExportCsv = () => {
    const header = [
      'Timestamp',
      'User',
      'Email',
      'Action',
      'Source',
      'Affected Data',
    ];
    const lines = filteredRows.map((r) => [
      formatTimestamp(r.timestamp),
      r.user?.username ?? '',
      r.user?.email ?? '',
      formatActionLabel(r.action),
      r.sourceSystem ?? '',
      r.affectedData ? JSON.stringify(r.affectedData) : '',
    ]);
    const csv = [header, ...lines]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: Column<AuditEntry>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      cardVariant: 'mono',
      cellClassName:
        'text-on-surface-variant font-mono text-xs whitespace-nowrap',
      render: (r) => formatTimestamp(r.timestamp),
    },
    {
      key: 'user',
      header: 'User',
      cardVariant: 'title',
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 bg-surface-container-high border border-surface-variant flex items-center justify-center text-[10px] font-bold text-on-surface-variant shrink-0">
            {initials(r.user?.username)}
          </span>
          <span className="font-medium">{r.user?.username ?? '—'}</span>
        </div>
      ),
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
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Audit Trail</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Every change to the system, tracked with user, timestamp, and
            affected data.
          </p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={filteredRows.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-surface-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="download" size={16} />
          Export CSV
        </button>
      </div>

      {/* Date presets */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'all', label: 'All time' },
            { id: 'today', label: 'Today' },
            { id: '7d', label: 'Last 7 days' },
            { id: '30d', label: 'Last 30 days' },
          ] as const
        ).map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
              datePreset === p.id
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface-container-lowest text-on-surface-variant border-surface-variant hover:bg-surface-container-low'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Filter panel */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4 space-y-3">
        {/* Row 1: search + date range + clear */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Search
            </label>
            <div className="relative">
              <Icon
                name="search"
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="User, action, or data…"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="min-w-[140px]">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              From
            </label>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.target.value);
                setDatePreset('all');
                setOffset(0);
              }}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div className="min-w-[140px]">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              To
            </label>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value);
                setDatePreset('all');
                setOffset(0);
              }}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Row 2: action + source + user */}
        <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-surface-variant">
          <div className="flex-1 min-w-[200px]">
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

          <div className="flex-1 min-w-[160px]">
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

          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              User
            </label>
            <select
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setOffset(0);
              }}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">All users</option>
              {userOptions.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.username}
                </option>
              ))}
            </select>
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition flex items-center gap-1.5"
            >
              <Icon name="close" size={14} />
              Clear all
            </button>
          )}

          <div className="ml-auto text-xs text-on-surface-variant whitespace-nowrap">
            Showing{' '}
            <strong className="text-on-surface">{filteredRows.length}</strong> of{' '}
            <strong className="text-on-surface">{total}</strong>
          </div>
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
        rows={filteredRows}
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
            ? `${formatActionLabel(detailRow.action)} · ${formatTimestamp(
                detailRow.timestamp,
              )}`
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
              <p className="text-slate-900">
                {detailRow?.user?.username ?? '—'}
              </p>
              <p className="text-slate-500 text-xs">
                {detailRow?.user?.email ?? ''}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Source
              </p>
              <p className="text-slate-900">
                {detailRow?.sourceSystem ?? '—'}
              </p>
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