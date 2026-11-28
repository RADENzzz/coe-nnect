import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';

export type BulkConfirmAction =
  | 'delete'
  | 'request-publish'
  | 'clear-auto-drafts'
  | null;

interface BulkActionConfirmModalProps {
  action: BulkConfirmAction;
  count: number;
  note: string;
  busy: boolean;
  onNoteChange: (note: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

const ACTION_COPY = {
  delete: {
    title: 'Delete selected rows',
    confirmLabel: 'Delete',
    icon: 'delete',
    tone: 'text-rose-700',
  },
  'request-publish': {
    title: 'Request publish',
    confirmLabel: 'Send request',
    icon: 'send',
    tone: 'text-amber-700',
  },
  'clear-auto-drafts': {
    title: 'Clear auto-drafts',
    confirmLabel: 'Clear auto-drafts',
    icon: 'auto_delete',
    tone: 'text-amber-700',
  },
} as const;

/** Confirmation step for bulk timetable actions before any API fan-out. */
export default function BulkActionConfirmModal({
  action,
  count,
  note,
  busy,
  onNoteChange,
  onConfirm,
  onClose,
}: BulkActionConfirmModalProps) {
  if (!action) return null;

  const copy = ACTION_COPY[action];
  const rowLabel = `row${count === 1 ? '' : 's'}`;

  return (
    <Modal
      open={true}
      onClose={onClose}
      busy={busy}
      size="sm"
      title={copy.title}
      description={`This affects ${count} selected ${rowLabel}.`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold bg-primary text-white hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Working…' : copy.confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <Icon
            name={copy.icon}
            size={18}
            className={`${copy.tone} mt-0.5 shrink-0`}
          />
          <p className="text-sm text-slate-700">
            {action === 'delete' &&
              `Delete ${count} selected ${rowLabel}. This cannot be undone.`}
            {action === 'request-publish' &&
              `Send ${count} selected ${rowLabel} to the Dean for publication approval.`}
            {action === 'clear-auto-drafts' &&
              `Remove auto-generated drafts for the current term and department. ${count} ${rowLabel} currently selected.`}
          </p>
        </div>

        {action === 'request-publish' && (
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-on-surface-variant">
              Note for the Dean (optional)
            </span>
            <textarea
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              rows={4}
              maxLength={500}
              disabled={busy}
              placeholder="Add context for the approval request"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none disabled:opacity-50"
            />
          </label>
        )}
      </div>
    </Modal>
  );
}
