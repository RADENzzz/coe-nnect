import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import Icon from '../../../components/ui/Icon';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import type { AutoGenerateCandidate } from '../../../api/schedule.api';
import TimetableGrid from '../components/TimetableGrid';
import type { ScheduleEntry } from '../types';

export interface AutoScheduleCandidateChooserProps {
  candidates: AutoGenerateCandidate[];
  currentEntries: ScheduleEntry[];
  currentAutoDraftCount: number;
  scopeLabel?: string;
  onUseCandidate: (candidate: AutoGenerateCandidate) => void | Promise<void>;
  onClose: () => void;
}

function readOnlyIds(entries: ScheduleEntry[]): Set<string> {
  return new Set(entries.map((e) => e.id));
}

function formatSolveTime(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}s`;
}

function CandidateThumbnail({
  entries,
  label,
}: {
  entries: ScheduleEntry[];
  label: string;
}) {
  const ids = useMemo(() => readOnlyIds(entries), [entries]);
  return (
    <div className="pointer-events-none rounded-lg border border-surface-variant bg-surface-container-lowest overflow-hidden">
      <div className="h-36 overflow-hidden">
        <TimetableGrid
          entries={entries}
          density="fit"
          fitToContainer
          readOnlyEntryIds={ids}
          busy
        />
      </div>
      <div className="sr-only">{label}</div>
    </div>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] font-medium text-on-surface-variant">
      {children}
    </span>
  );
}

export default function AutoScheduleCandidateChooser({
  candidates,
  currentEntries,
  currentAutoDraftCount,
  scopeLabel,
  onUseCandidate,
  onClose,
}: AutoScheduleCandidateChooserProps) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(
    candidates[0]?.candidateId ?? 'current',
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [usingCandidate, setUsingCandidate] = useState(false);

  useEffect(() => {
    const release = lockBodyScroll();
    return release;
  }, []);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.candidateId === selectedCandidateId) ?? null,
    [candidates, selectedCandidateId],
  );

  const previewEntries = selectedCandidate
    ? selectedCandidate.schedule
    : currentEntries;
  const previewReadOnlyIds = useMemo(
    () => readOnlyIds(previewEntries),
    [previewEntries],
  );

  const handleUseSelected = useCallback(() => {
    if (!selectedCandidate) return;
    if (currentAutoDraftCount > 0) {
      setConfirmOpen(true);
      return;
    }
    void onUseCandidate(selectedCandidate);
  }, [currentAutoDraftCount, onUseCandidate, selectedCandidate]);

  const handleConfirmUse = useCallback(async () => {
    if (!selectedCandidate) return;
    setUsingCandidate(true);
    try {
      await onUseCandidate(selectedCandidate);
      setConfirmOpen(false);
    } finally {
      setUsingCandidate(false);
    }
  }, [onUseCandidate, selectedCandidate]);

  const selectedLabel = selectedCandidate
    ? `Option ${candidates.findIndex((c) => c.candidateId === selectedCandidate.candidateId) + 1}`
    : 'Current live schedule';

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col min-h-0 bg-surface-container-lowest">
      <div className="px-4 md:px-6 py-4 border-b border-surface-variant bg-surface-container-low">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-primary flex items-center gap-2">
              <Icon name="auto_awesome" filled size={20} />
              Generated schedule options
            </h2>
            {scopeLabel && (
              <p className="text-xs text-on-surface-variant mt-0.5">{scopeLabel}</p>
            )}
            <p className="text-xs text-on-surface-variant mt-1">
              Review options before applying. The live schedule does not change until you use a selected option.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition"
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 md:px-6 py-4">
        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)] min-h-0">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setSelectedCandidateId('current')}
              className={`w-full text-left rounded-xl border p-3 transition ${
                selectedCandidateId === 'current'
                  ? 'border-primary bg-primary/5'
                  : 'border-surface-variant bg-surface-container-lowest hover:bg-surface-container-low'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-on-surface">Current live schedule</span>
                <Chip>No changes</Chip>
              </div>
              <CandidateThumbnail entries={currentEntries} label="Current live schedule thumbnail" />
            </button>

            {candidates.map((candidate, index) => {
              const selected = candidate.candidateId === selectedCandidateId;
              const optionLabel = `Option ${index + 1}`;
              return (
                <button
                  key={candidate.candidateId}
                  type="button"
                  onClick={() => setSelectedCandidateId(candidate.candidateId)}
                  className={`w-full text-left rounded-xl border p-3 transition ${
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-surface-variant bg-surface-container-lowest hover:bg-surface-container-low'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-on-surface">{optionLabel}</span>
                    {selected && <Chip>Selected</Chip>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <Chip>{`Placed ${candidate.placedCount}`}</Chip>
                    <Chip>{`Unscheduled ${candidate.unscheduledCount}`}</Chip>
                    <Chip>{`Warnings ${candidate.warnings.length}`}</Chip>
                    <Chip>{`Solve ${formatSolveTime(candidate.solveTimeSeconds)}`}</Chip>
                  </div>
                  <CandidateThumbnail
                    entries={candidate.schedule}
                    label={`${optionLabel} thumbnail`}
                  />
                </button>
              );
            })}
          </div>

          <div className="min-h-[420px] rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-surface-variant bg-surface-container-low flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-on-surface">{selectedLabel}</p>
                <p className="text-xs text-on-surface-variant">Read-only preview</p>
              </div>
              {selectedCandidate && (
                <div className="flex flex-wrap gap-1.5 justify-end">
                  <Chip>{`Placed ${selectedCandidate.placedCount}`}</Chip>
                  <Chip>{`Unscheduled ${selectedCandidate.unscheduledCount}`}</Chip>
                  <Chip>{`Warnings ${selectedCandidate.warnings.length}`}</Chip>
                  <Chip>{`Solve ${formatSolveTime(selectedCandidate.solveTimeSeconds)}`}</Chip>
                </div>
              )}
            </div>
            <div className="flex-1 min-h-0 pointer-events-none">
              <TimetableGrid
                entries={previewEntries}
                density="fit"
                fitToContainer
                readOnlyEntryIds={previewReadOnlyIds}
                busy
              />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4 border-t border-surface-variant bg-surface-container-lowest flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-on-surface-variant">
          {selectedCandidate
            ? `Using ${selectedLabel} will replace existing auto-generated drafts for this scope when confirmed.`
            : 'Select an option to use it, or keep the current live schedule.'}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-low rounded-lg transition"
          >
            Keep current
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-low rounded-lg transition"
          >
            Discard options
          </button>
          <button
            type="button"
            onClick={handleUseSelected}
            disabled={!selectedCandidate || usingCandidate}
            className="px-6 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:bg-tertiary transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {usingCandidate ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Using…
              </>
            ) : (
              'Use selected'
            )}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          if (!usingCandidate) setConfirmOpen(false);
        }}
        onConfirm={() => {
          void handleConfirmUse();
        }}
        title="Replace existing auto-generated drafts?"
        description={`This will replace ${currentAutoDraftCount} existing auto-generated draft${currentAutoDraftCount === 1 ? '' : 's'} in this scope with the selected option.`}
        confirmLabel="Replace drafts"
        busy={usingCandidate}
      />
    </div>,
    document.body,
  );
}
