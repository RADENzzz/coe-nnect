import Modal from '../../../components/ui/Modal';
import Icon from '../../../components/ui/Icon';
import type {
  DraftLoadConflict,
  DraftLoadResult,
} from '../../../api/schedule.api';

export interface DraftLoadSummaryModalProps {
  open: boolean;
  onClose: () => void;
  snapshotName: string;
  termLabel: string;
  result: DraftLoadResult | null;
  busy: boolean;
  onConfirm: () => void;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-outline-variant bg-surface-container-low px-3 py-2">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-black tabular-nums text-on-surface">
        {value}
      </dd>
    </div>
  );
}

function conflictLabel(conflict: DraftLoadConflict): string {
  const entry = conflict.entry;
  return `${entry?.subject_code ?? 'Unknown subject'} · ${
    entry?.section_code ?? '—'
  } · ${entry?.load_type ?? 'lecture'} · session ${
    (entry?.session_index ?? 0) + 1
  }`;
}

/** Read-only preflight report shown before a saved draft replaces the grid. */
export default function DraftLoadSummaryModal({
  open,
  onClose,
  snapshotName,
  termLabel,
  result,
  busy,
  onConfirm,
}: DraftLoadSummaryModalProps) {
  const blocked = !result || result.failed || result.conflicts.length > 0;

  return (
    <Modal
      open={open && !!result}
      onClose={onClose}
      title={`Load ${snapshotName}`}
      description={`Review the preflight summary for ${termLabel} before replacing saved draft and review rows.`}
      size="lg"
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
            onClick={onConfirm}
            disabled={busy || !result || result.failed || result.conflicts.length > 0}
            className="bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Loading…' : 'Load this draft'}
          </button>
        </div>
      }
    >
      {result && (
        <div className="space-y-4">
          <div
            className={`flex items-start gap-2 border px-3 py-2 text-sm ${
              blocked
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : 'border-primary/20 bg-primary/5 text-on-surface'
            }`}
            role="status"
            aria-live="polite"
          >
            <Icon
              name={blocked ? 'error' : 'info'}
              size={16}
              className="mt-0.5 shrink-0"
            />
            <span>{result.summary}</span>
          </div>

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Matched" value={result.matched} />
            <Stat label="Ready" value={result.ready} />
            <Stat label="Create" value={result.create} />
            <Stat label="Update" value={result.update} />
            <Stat label="Remove" value={result.remove} />
            <Stat label="Kept as is" value={result.keptAsIs} />
            <Stat label="Warnings" value={result.warnings} />
            <Stat label="Conflicts" value={result.conflicts.length} />
          </dl>

          {result.conflicts.length > 0 && (
            <section aria-labelledby="draft-load-conflicts">
              <h3
                id="draft-load-conflicts"
                className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant"
              >
                Conflicts blocking this load
              </h3>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {result.conflicts.map((conflict, index) => (
                  <li
                    key={`${conflict.targetScheduleId ?? 'new'}-${index}`}
                    className="border border-rose-200 bg-rose-50/60 px-2 py-1.5 text-xs text-rose-900"
                  >
                    <span className="font-semibold">{conflictLabel(conflict)}</span>
                    <span className="ml-1">{conflict.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-on-surface-variant">
                No rows were changed. Resolve the conflicts before loading this
                draft again.
              </p>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
