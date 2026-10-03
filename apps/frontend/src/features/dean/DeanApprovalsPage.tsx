import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSchedules, fetchActiveTerm, updateScheduleStatus, type RawSchedule } from '../../api/schedule.api';
import Icon from '../../components/ui/Icon';
import { useState } from 'react';

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600 border-slate-300' },
  review: { label: 'In Review', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  finalized: { label: 'Finalized', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  published: { label: 'Published', className: 'bg-blue-50 text-blue-700 border-blue-200' },
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
    mutationFn: ({ id, status }: { id: string; status: 'draft' | 'review' | 'finalized' | 'published' }) =>
      updateScheduleStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
      setActionError(null);
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.message ?? 'Action failed. Please try again.');
    },
  });

  const displayed =
    filter === 'review'
      ? schedules.filter((s) => s.status === 'review')
      : schedules;

  const reviewCount = schedules.filter((s) => s.status === 'review').length;

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Schedule Approvals</h1>
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

      {/* Filter tabs */}
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
            {f === 'review' ? `Pending Review (${reviewCount})` : `All Schedules (${schedules.length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      {!activeTerm ? (
        <div className="bg-white border border-slate-200 p-10 text-center">
          <Icon name="event_busy" className="text-slate-300 text-4xl mb-3" />
          <p className="text-sm font-semibold text-slate-600">No active term</p>
          <p className="text-xs text-slate-400 mt-1">Schedules can only be reviewed during an active term.</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-[#5c1219] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-white border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-3">
            <Icon name="check_circle" filled className="text-emerald-600 text-2xl" />
          </div>
          <p className="text-sm font-semibold text-slate-700">
            {filter === 'review' ? 'No pending approvals' : 'No schedules yet'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {filter === 'review'
              ? 'All schedules are up to date.'
              : 'Schedules will appear here once created by department heads.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                <th className="text-left px-5 py-3">Subject</th>
                <th className="text-left px-5 py-3">Faculty</th>
                <th className="text-left px-5 py-3">Schedule</th>
                <th className="text-left px-5 py-3">Room</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-right px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((s: RawSchedule) => {
                const st = STATUS_LABELS[s.status] ?? STATUS_LABELS.draft;
                const isPending = statusMutation.isPending;
                return (
                  <tr key={s.scheduleId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-900">
                        {s.subject?.subjectCode ?? 'Unknown'}
                      </p>
                      <p className="text-xs text-slate-400 truncate max-w-[160px]">
                        {s.subject?.title ?? '—'}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 text-xs">
                      {s.faculty
                        ? `${s.faculty.firstName} ${s.faculty.lastName}`
                        : <span className="italic text-slate-400">Unassigned</span>}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      <p>{s.timeSlot?.dayOfWeek ?? s.dayOfWeek ?? '—'}</p>
                      <p className="text-slate-400">
                        {s.timeSlot?.startTime ?? s.startTime ?? ''}{' '}
                        {s.timeSlot?.endTime ?? s.endTime ? `– ${s.timeSlot?.endTime ?? s.endTime}` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      {s.room
                        ? `${s.room.building} ${s.room.roomNumber}`
                        : <span className="italic text-slate-400">No room</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 border ${st.className}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {s.status === 'review' && (
                          <>
                            <button
                              onClick={() =>
                                statusMutation.mutate({ id: s.scheduleId, status: 'finalized' })
                              }
                              disabled={isPending}
                              className="text-xs px-3 py-1 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition font-semibold disabled:opacity-50"
                            >
                              Finalize
                            </button>
                            <button
                              onClick={() =>
                                statusMutation.mutate({ id: s.scheduleId, status: 'draft' })
                              }
                              disabled={isPending}
                              className="text-xs px-3 py-1 border border-slate-300 text-slate-600 hover:bg-slate-100 transition font-semibold disabled:opacity-50"
                            >
                              Return
                            </button>
                          </>
                        )}
                        {s.status === 'finalized' && (
                          <button
                            onClick={() =>
                              statusMutation.mutate({ id: s.scheduleId, status: 'published' })
                            }
                            disabled={isPending}
                            className="text-xs px-3 py-1 border border-blue-300 text-blue-700 hover:bg-blue-50 transition font-semibold disabled:opacity-50"
                          >
                            Publish
                          </button>
                        )}
                        {(s.status === 'draft' || s.status === 'published') && (
                          <span className="text-xs text-slate-400 italic">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
