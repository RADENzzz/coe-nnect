import type {
  DraftSnapshotSummary,
  VersionSource,
} from '../../../api/schedule.api';
import Modal from '../../../components/ui/Modal';

interface DraftComparePickerProps {
  open: boolean;
  source: DraftSnapshotSummary | null;
  snapshots: DraftSnapshotSummary[];
  termId: string;
  onClose: () => void;
  onPick: (source: VersionSource) => void;
}

/** Choose the other side of a saved-draft comparison. */
export default function DraftComparePicker({
  open,
  source,
  snapshots,
  termId,
  onClose,
  onPick,
}: DraftComparePickerProps) {
  const canPick = !!termId.trim();
  const candidates = snapshots.filter(
    (snapshot) => snapshot.snapshotId !== source?.snapshotId,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose a draft to compare"
      description={source?.name}
      size="md"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
        >
          Cancel
        </button>
      }
    >
      <p className="mb-3 text-sm text-on-surface-variant">
        Pick what to compare with <strong>{source?.name}</strong>. The saved
        draft stays on the Before side.
      </p>

      {!canPick && (
        <p className="mb-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          An active term is required before comparing saved drafts.
        </p>
      )}

      <div className="space-y-2">
        <button
          type="button"
          disabled={!canPick}
          onClick={() => onPick({ kind: 'live', id: termId })}
          className="flex w-full items-center justify-between border border-primary px-3 py-2 text-left text-sm font-semibold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>Live timetable</span>
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
            After
          </span>
        </button>

        {candidates.map((snapshot) => (
          <button
            key={snapshot.snapshotId}
            type="button"
            disabled={!canPick}
            onClick={() =>
              onPick({ kind: 'draft', id: snapshot.snapshotId })
            }
            className="flex w-full items-center justify-between border border-outline-variant px-3 py-2 text-left text-sm font-semibold text-on-surface transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="truncate">{snapshot.name}</span>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              {snapshot.entryCount}{' '}
              {snapshot.entryCount === 1 ? 'row' : 'rows'}
            </span>
          </button>
        ))}
      </div>

      {candidates.length === 0 && (
        <p className="mt-3 text-xs text-on-surface-variant">
          No other saved drafts in this term.
        </p>
      )}
    </Modal>
  );
}
