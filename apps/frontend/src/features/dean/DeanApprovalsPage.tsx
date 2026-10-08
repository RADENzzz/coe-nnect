import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSchedules,
  fetchActiveTerm,
  updateScheduleStatus,
  type RawSchedule,
} from '../../api/schedule.api';
import { fetchSections } from '../../api/sections.api';
import { fetchFaculty } from '../../api/faculty.api';
import Icon from '../../components/ui/Icon';
import { useState, useMemo } from 'react';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import type { RowAction } from '../../components/ui/RowActionMenu';
import StatusBadge from '../../components/ui/StatusBadge';

const STATUS_LABELS: Record<
  string,
  { label: string; tone: 'neutral' | 'warning' | 'success' | 'info' }
> = {
  draft: { label: 'Draft', tone: 'neutral' },
  review: { label: 'In Review', tone: 'warning' },
  finalized: { label: 'Finalized', tone: 'success' },
  published: { label: 'Published', tone: 'info' },
};

type TabFilter = 'review' | 'finalized' | 'all';
type StatusFilter = 'all' | 'draft' | 'review' | 'finalized' | 'published';

export default function DeanApprovalsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabFilter>('review');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sectionFilter, setSectionFilter] = useState('');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: activeTerm } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
  });

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['schedules', activeTerm?.termId],
    queryFn: () => fetchSchedules(activeTerm?.termId),
    enabled: !!activeTerm?.termId,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: fetchSections,
    enabled: !!activeTerm?.termId,
  });

  const { data: faculty = [] } = useQuery({
    queryKey: ['faculty'],
    queryFn: () => fetchFaculty(false),
    enabled: !!activeTerm?.termId,
  });

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: 'draft' | 'review' | 'finalized' | 'published';
    }) => updateScheduleStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
      setActionError(null);
    },
    onError: (err: any) => {
      setActionError(
        err?.response?.data?.message ?? 'Action failed. Please try again.',
      );
    },
  });

  // ── Tab filtering ──
  const tabFiltered = useMemo(() => {
    if (tab === 'review') return schedules.filter((s) => s.status === 'review');
    if (tab === 'finalized')
      return schedules.filter(
        (s) => s.status === 'finalized' || s.status === 'published',
      );
    return schedules;
  }, [schedules, tab]);

  // ── Secondary filters ──
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tabFiltered.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (sectionFilter && (s.section ?? '') !== sectionFilter) return false;
      if (facultyFilter && String(s.facultyId ?? '') !== facultyFilter) {
        return false;
      }
      if (q) {
        const subjCode = (s.subject?.subjectCode ?? '').toLowerCase();
        const subjTitle = (s.subject?.title ?? '').toLowerCase();
        if (!subjCode.includes(q) && !subjTitle.includes(q)) return false;
      }
      return true;
    });
  }, [tabFiltered, statusFilter, sectionFilter, facultyFilter, searchQuery]);

  const reviewCount = schedules.filter((s) => s.status === 'review').length;
  const finalizedCount = schedules.filter(
    (s) => s.status === 'finalized' || s.status === 'published',
  ).length;

  const hasAnyFilter =
    !!searchQuery ||
    statusFilter !== 'all' ||
    !!sectionFilter ||
    !!facultyFilter;

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setSectionFilter('');
    setFacultyFilter('');
  };

  // ── Columns ──
  const columns: Column<RawSchedule>[] = [
    {
      key: 'subject',
      header: 'Subject',
      cardVariant: 'title',
      cellClassName: 'font-semibold text-slate-900',
      render: (s) => s.subject?.subjectCode ?? 'Unknown',
    },
    {
      key: 'title',
      header: 'Title',
      cardVariant: 'subtitle',
      hideOnMobile: true,
      cellClassName: 'text-xs text-slate-400 truncate max-w-[160px]',
      render: (s) => s.subject?.title ?? '—',
    },
    {
      key: 'section',
      header: 'Section',
      cardVariant: 'meta',
      cellClassName: 'text-xs text-slate-600 font-mono',
      render: (s) => s.section ?? '—',
    },
    {
      key: 'faculty',
      header: 'Faculty',
      cardVariant: 'meta',
      cellClassName: 'text-slate-700 text-xs',
      render: (s) =>
        s.faculty
          ? `${s.faculty.firstName} ${s.faculty.lastName}`
          : 'Unassigned',
    },
    {
      key: 'schedule',
      header: 'Schedule',
      cardVariant: 'mono',
      cellClassName: 'text-xs text-slate-600',
      render: (s) => {
        const day = s.timeSlot?.dayOfWeek ?? s.dayOfWeek ?? '—';
        const start = s.timeSlot?.startTime ?? s.startTime ?? '';
        const end = s.timeSlot?.endTime ?? s.endTime ?? '';
        return `${day} ${start}${end ? ` – ${end}` : ''}`;
      },
    },
    {
      key: 'room',
      header: 'Room',
      cardVariant: 'meta',
      cellClassName: 'text-xs text-slate-600',
      render: (s) =>
        s.room ? `${s.room.building} ${s.room.roomNumber}` : 'No room',
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (s) => {
        const st = STATUS_LABELS[s.status] ?? STATUS_LABELS.draft;
        return <StatusBadge tone={st.tone}>{st.label}</StatusBadge>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (s: RawSchedule): RowAction[] => {
    const isPending = statusMutation.isPending;
    if (s.status === 'review') {
      return [
        {
          label: 'Finalize',
          icon: 'check_circle',
          onClick: () =>
            statusMutation.mutate({ id: s.scheduleId, status: 'finalized' }),
          disabled: isPending,
        },
        {
          label: 'Return to Draft',
          icon: 'undo',
          onClick: () =>
            statusMutation.mutate({ id: s.scheduleId, status: 'draft' }),
          disabled: isPending,
        },
      ];
    }
    if (s.status === 'finalized') {
      return [
        {
          label: 'Publish',
          icon: 'publish',
          onClick: () =>
            statusMutation.mutate({ id: s.scheduleId, status: 'published' }),
          disabled: isPending,
        },
      ];
    }
    return [];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Schedule Approvals
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review and finalize department schedules.
            {activeTerm && ` · ${activeTerm.termName} ${activeTerm.schoolYear}`}
          </p>
        </div>
        {reviewCount > 0 && (
          <span className="text-sm font-bold px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200">
            {reviewCount} pending
          </span>
        )}
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm">
          {actionError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-200">
        {(
          [
            { id: 'review', label: `Pending Review (${reviewCount})` },
            { id: 'finalized', label: `Finalized (${finalizedCount})` },
            { id: 'all', label: `All (${schedules.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
              tab === t.id
                ? 'border-[#5c1219] text-[#5c1219]'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter panel */}
      {activeTerm && (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4 space-y-3">
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
                  placeholder="Subject code or title…"
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="min-w-[140px]">
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="review">In Review</option>
                <option value="finalized">Finalized</option>
                <option value="published">Published</option>
              </select>
            </div>

            <div className="min-w-[150px]">
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Section
              </label>
              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">All sections</option>
                {sections
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.sectionId} value={s.sectionCode}>
                      {s.sectionCode}
                    </option>
                  ))}
              </select>
            </div>

            <div className="min-w-[180px]">
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Faculty
              </label>
              <select
                value={facultyFilter}
                onChange={(e) => setFacultyFilter(e.target.value)}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">All faculty</option>
                {faculty
                  .filter((f) => f.isActive)
                  .map((f) => (
                    <option key={f.facultyId} value={f.facultyId}>
                      {f.lastName}, {f.firstName}
                    </option>
                  ))}
              </select>
            </div>

            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition flex items-center gap-1.5"
              >
                <Icon name="close" size={14} />
                Clear all
              </button>
            )}

            <div className="ml-auto text-xs text-on-surface-variant whitespace-nowrap">
              Showing{' '}
              <strong className="text-on-surface">{filtered.length}</strong> of{' '}
              {tabFiltered.length}
            </div>
          </div>
        </div>
      )}

      {!activeTerm ? (
        <div className="bg-white border border-slate-200 p-10 text-center">
          <Icon name="event_busy" className="text-slate-300 text-4xl mb-3" />
          <p className="text-sm font-semibold text-slate-600">No active term</p>
          <p className="text-xs text-slate-400 mt-1">
            Schedules can only be reviewed during an active term.
          </p>
        </div>
      ) : (
        <ResponsiveTable
          columns={columns}
          rows={filtered}
          rowKey={(s) => s.scheduleId}
          rowTitle={(s) => s.subject?.subjectCode ?? 'Schedule'}
          rowSubtitle={(s) =>
            s.faculty
              ? `${s.faculty.firstName} ${s.faculty.lastName}`
              : 'Unassigned'
          }
          isLoading={isLoading}
          hasSourceRows={schedules.length > 0}
          emptyMessage={
            tab === 'review'
              ? 'No pending approvals — all schedules are up to date.'
              : 'No schedules yet.'
          }
          noMatchMessage="No schedules match your filters."
          getActions={getActions}
        />
      )}
    </div>
  );
}