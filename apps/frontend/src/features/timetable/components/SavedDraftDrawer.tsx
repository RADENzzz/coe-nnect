import type { DraftSnapshotSummary } from '../../../api/schedule.api';
import Icon from '../../../components/ui/Icon';

export interface SavedDraftDrawerProps {
  open: boolean;
  onClose: () => void;
  termLabel: string;
  snapshots: DraftSnapshotSummary[];
  busySnapshotId: string | null;
  onLoad: (snapshot: DraftSnapshotSummary) => void;
  onPreview?: (snapshot: DraftSnapshotSummary) => void;
  onCompare?: (snapshot: DraftSnapshotSummary) => void;
  onDelete?: (snapshot: DraftSnapshotSummary) => void;
}

function formatSavedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Presentational list of named drafts saved for the current term and department. */
export default function SavedDraftDrawer({
  open,
  onClose,
  termLabel,
  snapshots,
  busySnapshotId,
  onLoad,
  onPreview,
  onCompare,
  onDelete,
}: SavedDraftDrawerProps) {
  if (!open) return null;

  const folder = snapshots[0];
  const folderLabel = folder
    ? [folder.schoolYear, folder.semester, folder.termName]
        .filter((part) => !!part && String(part).trim())
        .join(' · ')
    : termLabel;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close saved timetable drafts"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <aside
        role="dialog"
        aria-label="Saved timetable drafts"
        aria-modal="true"
        className="relative flex h-full w-full max-w-md flex-col border-l border-outline-variant bg-surface shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-outline-variant px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-on-surface">
              Saved timetable drafts
            </h2>
            <p className="mt-1 break-words text-xs text-on-surface-variant">
              {folderLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-on-surface-variant transition hover:bg-surface-container-low hover:text-on-surface"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {snapshots.length === 0 ? (
            <div className="border border-dashed border-outline-variant px-4 py-8 text-center">
              <p className="text-sm font-semibold text-on-surface">
                No saved drafts yet
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                Use Save as draft… to keep a named copy of this grid.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {snapshots.map((snapshot) => {
                const busy = busySnapshotId === snapshot.snapshotId;
                return (
                  <li
                    key={snapshot.snapshotId}
                    className="border border-outline-variant bg-surface-container-low px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-on-surface">
                          {snapshot.name}
                        </p>
                        <p className="mt-1 text-[11px] text-on-surface-variant">
                          {formatSavedAt(snapshot.createdAt)} ·{' '}
                          {snapshot.entryCount}{' '}
                          {snapshot.entryCount === 1 ? 'row' : 'rows'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onLoad(snapshot)}
                        disabled={busy}
                        className="shrink-0 border border-primary px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? 'Checking…' : 'Load'}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-on-surface-variant">
                      {snapshot.schoolYear} · {snapshot.semester ?? '—'} ·{' '}
                      {snapshot.termName}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || !onPreview}
                        onClick={() => onPreview?.(snapshot)}
                        className="border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        View saved rows
                      </button>
                      <button
                        type="button"
                        disabled={busy || !onCompare}
                        onClick={() => onCompare?.(snapshot)}
                        className="border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Compare
                      </button>
                      <button
                        type="button"
                        disabled={busy || !onDelete}
                        onClick={() => onDelete?.(snapshot)}
                        className="border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
