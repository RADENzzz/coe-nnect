import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteSchedule,
  updateScheduleStatus,
  updateRemarks,
} from '../../../api/schedule.api';
import type { ScheduleEntry } from '../types';
import Icon from '../../../components/ui/Icon';
import clsx from 'clsx';

interface Props {
  entry: ScheduleEntry | null;
  onClose: () => void;
  onEdit?: (entry: ScheduleEntry) => void;
  termId: string;
}

const STATUS_OPTIONS = ['draft', 'review', 'finalized', 'published'] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  review: 'In Review',
  finalized: 'Finalized',
  published: 'Published',
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-surface-container-high text-on-surface-variant',
  review: 'bg-amber-100 text-amber-800',
  finalized: 'bg-blue-100 text-blue-800',
  published: 'bg-green-100 text-green-800',
};

export default function ScheduleDetailDrawer({
  entry,
  onClose,
  onEdit,
  termId,
}: Props) {
  const queryClient = useQueryClient();
  const [remarks, setRemarks] = useState('');
  const [remarksSaved, setRemarksSaved] = useState(false);

  // Sync local remarks when entry changes
  useEffect(() => {
    setRemarks(entry?.remarks ?? '');
    setRemarksSaved(false);
  }, [entry?.id, entry?.remarks]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (entry) {
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [entry, onClose]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteSchedule(entry!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', termId] });
      onClose();
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message ?? err?.message ?? 'Delete failed');
    },
  });

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: (status: 'draft' | 'review' | 'finalized' | 'published') =>
      updateScheduleStatus(entry!.id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', termId] });
    },
    onError: (err: any) => {
      alert(
        err?.response?.data?.message ?? err?.message ?? 'Status update failed',
      );
    },
  });

  // Remarks mutation
  const remarksMutation = useMutation({
    mutationFn: (text: string) => updateRemarks(entry!.id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', termId] });
      setRemarksSaved(true);
      setTimeout(() => setRemarksSaved(false), 1500);
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message ?? err?.message ?? 'Save failed');
    },
  });

  const handleDelete = () => {
    if (!entry) return;
    const confirmed = window.confirm(
      `Delete "${entry.subjectCode}" (${entry.sectionCode || 'no section'})?\n\nThis action cannot be undone.`,
    );
    if (confirmed) deleteMutation.mutate();
  };

  const handleStatusChange = (newStatus: string) => {
    statusMutation.mutate(newStatus as any);
  };

  if (!entry) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-surface-container-lowest shadow-2xl border-l border-surface-variant flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-surface-variant">
          <div>
            <h2 className="text-lg font-bold text-primary">Class Details</h2>
            <p className="text-xs text-on-surface-variant">
              View, edit, or delete this entry
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant"
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Subject title */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                {entry.subjectCode}
              </span>
              <span
                className={clsx(
                  'text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase',
                  STATUS_STYLES[statusMutation.isPending ? 'draft' : 'draft'],
                )}
              >
                {entry.loadType}
              </span>
            </div>
            <h3 className="text-base font-semibold text-on-surface">
              {entry.subjectTitle || '—'}
            </h3>
          </div>

          {/* Info grid */}
          <div className="space-y-3 text-sm">
            <DetailRow
              icon="groups"
              label="Section"
              value={entry.sectionCode || '—'}
            />
            <DetailRow
              icon="person"
              label="Faculty"
              value={entry.facultyName}
            />
            <DetailRow
              icon="meeting_room"
              label="Room"
              value={entry.roomNumber !== '—' ? `Room ${entry.roomNumber}` : '—'}
            />
            <DetailRow
              icon="calendar_today"
              label="Day"
              value={entry.day}
            />
            <DetailRow
              icon="schedule"
              label="Time"
              value={`${entry.startTime} – ${entry.endTime}`}
            />
          </div>

          {/* Status selector */}
          <div className="pt-3 border-t border-surface-variant">
            <label className="block text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wider">
              Status
            </label>
            <select
              value={entry.status ?? 'draft'}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={statusMutation.isPending}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {statusMutation.isPending && (
              <p className="text-xs text-primary mt-1 animate-pulse">
                Updating status…
              </p>
            )}
          </div>

          {/* Remarks */}
          <div className="pt-3 border-t border-surface-variant">
            <label className="block text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wider">
              Remarks
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Room under maintenance; reschedule pending"
              rows={3}
              maxLength={1000}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-on-surface-variant">
                {remarks.length}/1000
              </span>
              <div className="flex items-center gap-2">
                {remarksSaved && (
                  <span className="text-xs text-green-700 flex items-center gap-1">
                    <Icon name="check" size={14} /> Saved
                  </span>
                )}
                <button
                  onClick={() => remarksMutation.mutate(remarks)}
                  disabled={
                    remarksMutation.isPending ||
                    remarks === (entry.remarks ?? '')
                  }
                  className="text-xs font-semibold px-3 py-1.5 bg-primary text-on-primary rounded-md hover:bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {remarksMutation.isPending ? 'Saving…' : 'Save Remarks'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <footer className="border-t border-surface-variant p-4 flex items-center gap-3 bg-surface-container-low">
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition disabled:opacity-50"
          >
            <Icon name="delete" size={16} />
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
          <button
            onClick={() => onEdit?.(entry)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:bg-tertiary transition"
          >
            <Icon name="edit" size={16} />
            Edit Entry
          </button>
        </footer>
      </aside>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon
        name={icon}
        size={18}
        className="text-on-surface-variant mt-0.5 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
          {label}
        </p>
        <p className="text-sm text-on-surface truncate">{value}</p>
      </div>
    </div>
  );
}