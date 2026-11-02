import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import { fetchSubjects } from '@/api/subjects.api';

interface FillSlotModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (subjectId: string) => void;
  slotLabel: string;
  programId: string;
  isPending: boolean;
}

export default function FillSlotModal({
  open,
  onClose,
  onConfirm,
  slotLabel,
  programId,
  isPending,
}: FillSlotModalProps) {
  const [selectedId, setSelectedId] = useState('');

  // Reset selection when the modal closes
  useEffect(() => {
    if (!open) setSelectedId('');
  }, [open]);

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ['subjects', { forProgram: programId, active: true }],
    queryFn: () => fetchSubjects(),
    enabled: open,
  });

  // Only show real subjects — placeholders are hidden
  const candidates = subjects.filter(
    (s) => s.isActive && !s.isPlaceholder,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fill Elective Slot"
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selectedId)}
            disabled={!selectedId || isPending}
            className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition rounded-lg flex items-center gap-2 disabled:opacity-50"
          >
            {isPending && (
              <Icon name="progress_activity" size={14} className="animate-spin" />
            )}
            {isPending ? 'Saving…' : 'Assign Subject'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
          You are filling the slot: <strong>{slotLabel}</strong>
        </div>

        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Select a Real Subject
          </label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            disabled={isLoading}
          >
            <option value="">— Select a subject —</option>
            {candidates.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>
                [{s.subjectCode}] {s.title} ({s.lectureUnits}L / {s.labUnits}B)
              </option>
            ))}
          </select>
          <p className="text-[11px] text-on-surface-variant mt-2 flex items-center gap-1.5">
            <Icon name="info" size={11} />
            Placeholder subjects are hidden from this list.
          </p>
        </div>
      </div>
    </Modal>
  );
}