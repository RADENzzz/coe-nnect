import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';

export type BulkConfirmAction =
  | 'delete'
  | 'request-publish'
  | 'request-change'
  | 'request-unfinalize'
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
  'request-change': {
    title: 'Request change',
    confirmLabel: 'Send request',
    icon: 'send',
    tone: 'text-amber-700',
  },
  'request-unfinalize': {
    title: 'Request unfinalize',
    confirmLabel: 'Send request',
    icon: 'undo',
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
  const isChange = action === 'request-change';
  const isUnfinalize = action === 'request-unfinalize';
  const needsReason = isChange || isUnfinalize;
  const noteTooShort = needsReason && note.trim().length < 5;
  const noteTooLong = note.length > 500;
  const rowLabel = `row${count === 1 ? '' : 's'}`;
  const description =
    action === 'clear-auto-drafts'
      ? `This will clear ${count} auto-generated draft${count === 1 ? '' : 's'}.`
      : `This affects ${count} selected ${rowLabel}.`;

  return (
    <Modal
      open={true}
      onClose={onClose}
      busy={busy}
      size="sm"
      title={copy.title}
      description={description}
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
            disabled={busy || noteTooShort || noteTooLong}
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
            {isChange &&
              `Send ${count} selected ${rowLabel} to the Dean with a shared change reason.`}
            {isUnfinalize &&
              `Only the Dean can unfinalize published rows. Send ${count} selected ${rowLabel} with a shared reason; the Dean will approve or reject the request.`}
            {action === 'clear-auto-drafts' &&
              `${count} draft${count === 1 ? '' : 's'} will be removed.`}
          </p>
        </div>

        {(action === 'request-publish' || needsReason) && (
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-on-surface-variant">
              {isChange
                ? 'Reason for the change'
                : isUnfinalize
                  ? 'Reason for the unfinalize request'
                  : 'Note for the Dean (optional)'}
            </span>
            <textarea
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              rows={4}
              maxLength={500}
              disabled={busy}
              placeholder={
                isChange
                  ? 'e.g. Faculty reassignment approved by the department'
                  : isUnfinalize
                    ? 'e.g. Room reassignment approved after publication'
                    : 'Add context for the approval request'
              }
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none disabled:opacity-50"
            />
            <span className={`block text-xs ${noteTooLong ? 'text-rose-600' : 'text-slate-500'}`}>
              {needsReason && noteTooShort ? 'Enter at least 5 characters. ' : ''}
              {note.length}/500
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}
