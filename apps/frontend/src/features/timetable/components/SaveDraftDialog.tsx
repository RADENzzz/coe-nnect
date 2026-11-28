import Modal from '../../../components/ui/Modal';

export interface SaveDraftDialogProps {
  open: boolean;
  onClose: () => void;
  termLabel: string;
  entryCount: number;
  name: string;
  busy: boolean;
  onNameChange: (value: string) => void;
  onSave: () => void;
}

/** Presentational dialog for naming a snapshot of the current editable grid. */
export default function SaveDraftDialog({
  open,
  onClose,
  termLabel,
  entryCount,
  name,
  busy,
  onNameChange,
  onSave,
}: SaveDraftDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save timetable draft"
      description="Save the current draft and review rows for this term and department."
      size="md"
      busy={busy}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !name.trim() || entryCount === 0}
            className="bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface">
          <p className="font-semibold">{termLabel || 'No active term'}</p>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            {entryCount} draft or review {entryCount === 1 ? 'row' : 'rows'} will
            be saved. Finalized and published rows are excluded.
          </p>
        </div>
        <div>
          <label
            htmlFor="term-draft-name"
            className="mb-1 block text-xs font-bold uppercase tracking-wider text-on-surface-variant"
          >
            Draft name
          </label>
          <input
            id="term-draft-name"
            type="text"
            value={name}
            maxLength={120}
            disabled={busy}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Working A"
            className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>
    </Modal>
  );
}
