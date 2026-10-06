import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSchedules,
  fetchActiveTerm,
  updateScheduleStatus,
  type RawSchedule,
} from '../../api/schedule.api';
import Icon from '../../components/ui/Icon';
import { useState } from 'react';
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

export default function DeanApprovalsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'review' | 'all'>('review');
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

  const displayed =
    filter === 'review'
      ? schedules.filter((s) => s.status === 'review')
      : schedules;

  const reviewCount = schedules.filter((s) => s.status === 'review').length;

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

      <div className="flex gap-0 border-b border-slate-200">
        {(['review', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
              filter === f
                ? 'border-[#5c1219] text-[#5c1219]'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {f === 'review'
              ? `Pending Review (${reviewCount})`
              : `All Schedules (${schedules.length})`}
          </button>
        ))}
      </div>

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
          rows={displayed}
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
            filter === 'review'
              ? 'No pending approvals — all schedules are up to date.'
              : 'No schedules yet.'
          }
          noMatchMessage="No schedules match this filter."
          getActions={getActions}
        />
      )}
    </div>
  );
}