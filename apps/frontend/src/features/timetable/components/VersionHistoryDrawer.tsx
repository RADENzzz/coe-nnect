import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import {
  fetchVersions,
  type ScheduleVersionSummary,
} from '../../../api/schedule.api';

interface VersionHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  termId: string | undefined;
  /** Currently-viewed version id, if the user is in read-only version mode. */
  activeVersionId: string | null;
  /** Click a version → switch the timetable to read-only view of it. */
  onViewVersion: (version: ScheduleVersionSummary) => void;
  /** Click "Back to live" → exit read-only version view. */
  onExitVersionView: () => void;
  /** Click "Compare" with two selected versions. */
  onCompare: (
    a: ScheduleVersionSummary,
    b: ScheduleVersionSummary,
  ) => void;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function VersionHistoryDrawer({
  open,
  onClose,
  termId,
  activeVersionId,
  onViewVersion,
  onExitVersionView,
  onCompare,
}: VersionHistoryDrawerProps) {
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  // Reset compare state when the drawer closes.
  useEffect(() => {
    if (!open) {
      setCompareMode(false);
      setSelected([]);
    }
  }, [open]);

  const { data: versions = [], isLoading, error } = useQuery({
    queryKey: ['schedule-versions', termId],
    queryFn: () => fetchVersions(termId!),
    enabled: open && !!termId,
    staleTime: 15 * 1000,
  });

  const canCompare = useMemo(() => selected.length === 2, [selected]);

  const handleToggleSelect = (versionId: string) => {
    setSelected((prev) => {
      if (prev.includes(versionId)) {
        return prev.filter((id) => id !== versionId);
      }
      if (prev.length >= 2) {
        // Replace the oldest selection with the new one.
        return [prev[1], versionId];
      }
      return [...prev, versionId];
    });
  };

  const handleCompare = () => {
    if (!canCompare) return;
    const [idA, idB] = selected;
    const a = versions.find((v) => v.versionId === idA);
    const b = versions.find((v) => v.versionId === idB);
    if (!a || !b) return;
    // Order by version_number so A is always the older one.
    if (a.versionNumber <= b.versionNumber) {
      onCompare(a, b);
    } else {
      onCompare(b, a);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Schedule version history"
        aria-modal="true"
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] bg-white shadow-2xl flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-variant">
          <div className="flex items-center gap-2">
            <Icon name="history" size={20} className="text-primary" />
            <h2 className="text-base font-semibold text-on-surface">
              Version History
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-surface-container-low transition"
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-surface-variant flex items-center justify-between gap-2 bg-surface-container-lowest">
          {!compareMode ? (
            <>
              <p className="text-xs text-on-surface-variant">
                {versions.length}{' '}
                {versions.length === 1 ? 'version' : 'versions'} for this term
              </p>
              <button
                type="button"
                onClick={() => setCompareMode(true)}
                disabled={versions.length < 2}
                className="text-xs font-semibold px-3 py-1.5 border border-surface-variant rounded hover:bg-surface-container-low transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Compare
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-on-surface-variant">
                {selected.length}/2 selected
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCompareMode(false);
                    setSelected([]);
                  }}
                  className="text-xs font-semibold px-3 py-1.5 border border-surface-variant rounded hover:bg-surface-container-low transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCompare}
                  disabled={!canCompare}
                  className="text-xs font-semibold px-3 py-1.5 bg-primary text-on-primary rounded hover:bg-tertiary transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Compare
                </button>
              </div>
            </>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-6 text-center text-sm text-on-surface-variant">
              Loading versions…
            </div>
          )}

          {error && (
            <div className="p-4 m-4 rounded bg-red-50 border border-red-200 text-xs text-red-800">
              Failed to load versions: {(error as Error).message}
            </div>
          )}

          {!isLoading && !error && versions.length === 0 && (
            <div className="p-6 text-center">
              <Icon
                name="history_toggle_off"
                size={40}
                className="text-on-surface-variant mx-auto mb-3"
              />
              <p className="text-sm font-semibold text-on-surface">
                No versions yet
              </p>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                A version is created automatically when a schedule entry is
                finalized. Finalize an entry to create v1.
              </p>
            </div>
          )}

          {!isLoading && !error && versions.length > 0 && (
            <ul className="divide-y divide-surface-variant">
              {versions.map((v) => {
                const isActive = v.versionId === activeVersionId;
                const isSelected = selected.includes(v.versionId);

                return (
                  <li
                    key={v.versionId}
                    className={`px-5 py-4 transition ${
                      isActive ? 'bg-primary/5' : 'hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {compareMode && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(v.versionId)}
                            className="mt-1 accent-[#5c1219]"
                            aria-label={`Select version ${v.versionNumber}`}
                          />
                        )}

                        <button
                          type="button"
                          onClick={() => !compareMode && onViewVersion(v)}
                          disabled={compareMode}
                          className={`flex-1 text-left min-w-0 ${
                            compareMode
                              ? 'cursor-default'
                              : 'cursor-pointer hover:opacity-80'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded ${
                                isActive
                                  ? 'bg-primary text-on-primary'
                                  : 'bg-primary/10 text-primary'
                              }`}
                            >
                              <Icon name="history" size={11} />
                              v{v.versionNumber}
                            </span>
                            {isActive && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                                Viewing
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
                            {v.entryCount}{' '}
                            {v.entryCount === 1 ? 'entry' : 'entries'} ·{' '}
                            {formatDateTime(v.lastModifiedAt)}
                          </p>

                          <p className="text-xs text-on-surface-variant mt-0.5">
                            Finalized by{' '}
                            <span className="font-medium text-on-surface">
                              {v.finalizedByName ?? 'unknown'}
                            </span>
                          </p>
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        {activeVersionId && !compareMode && (
          <div className="px-5 py-3 border-t border-surface-variant bg-amber-50">
            <button
              type="button"
              onClick={() => {
                onExitVersionView();
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-amber-300 text-amber-900 text-sm font-semibold rounded hover:bg-amber-100 transition"
            >
              <Icon name="arrow_back" size={16} />
              Back to live schedule
            </button>
          </div>
        )}
      </aside>
    </>
  );
}