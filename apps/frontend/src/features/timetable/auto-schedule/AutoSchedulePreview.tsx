import { useState, useEffect, useMemo, useCallback } from 'react';
import TimetableGrid from '../components/TimetableGrid';
import Icon from '../../../components/ui/Icon';
import type { ScheduleEntry } from '../types';

interface Props {
  solvedSchedule: ScheduleEntry[];
  unscheduledBlocks?: Array<{
    sectionId: string;
    sectionCode: string;
    subjectId: string;
    subjectCode: string;
    kind: 'lecture' | 'lab';
    sessionIndex: number;
  }>;
  scopeLabel?: string;
  onAccept: () => void | Promise<void>;
  onCancel: () => void;
  revealIntervalMs?: number;
}

type PreviewState = 'idle' | 'playing' | 'paused' | 'finished';

export default function AutoSchedulePreview({
  solvedSchedule,
  unscheduledBlocks = [],
  scopeLabel,
  onAccept,
  onCancel,
  revealIntervalMs = 80,
}: Props) {
  const [revealedBlocks, setRevealedBlocks] = useState<ScheduleEntry[]>([]);
  const [state, setState] = useState<PreviewState>('idle');
  const [accepting, setAccepting] = useState(false);

  const total = solvedSchedule.length;

  // Reveal the next block on a timer while playing
  useEffect(() => {
    if (state !== 'playing') return;
    if (revealedBlocks.length >= total) {
      setState('finished');
      return;
    }
    const timer = setTimeout(() => {
      setRevealedBlocks((prev) => [...prev, solvedSchedule[prev.length]]);
    }, revealIntervalMs);
    return () => clearTimeout(timer);
  }, [state, revealedBlocks.length, total, solvedSchedule, revealIntervalMs]);

  const startReveal = useCallback(() => {
    setRevealedBlocks([]);
    setState('playing');
  }, []);

  const skipToEnd = useCallback(() => {
    setRevealedBlocks(solvedSchedule);
    setState('finished');
  }, [solvedSchedule]);

  const togglePause = useCallback(() => {
    setState((s) => (s === 'playing' ? 'paused' : 'playing'));
  }, []);

  const handleAccept = useCallback(async () => {
    setAccepting(true);
    try {
      await onAccept();
    } finally {
      setAccepting(false);
    }
  }, [onAccept]);

  const progress = total > 0 ? Math.round((revealedBlocks.length / total) * 100) : 0;

  const statusLabel = useMemo(() => {
    switch (state) {
      case 'idle':
        return `Ready to preview ${total} block${total === 1 ? '' : 's'}`;
      case 'playing':
        return `Placing block ${revealedBlocks.length} of ${total}…`;
      case 'paused':
        return `Paused at ${revealedBlocks.length} of ${total}`;
      case 'finished':
        return `All ${total} blocks placed`;
    }
  }, [state, revealedBlocks.length, total]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface-container-lowest">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-surface-variant bg-surface-container-low">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-bold text-primary flex items-center gap-2">
              <Icon name="auto_awesome" filled size={20} />
              Auto-Generated Schedule
            </h2>
            {scopeLabel && (
              <p className="text-xs text-on-surface-variant mt-0.5">
                {scopeLabel}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span>{progress}%</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-100 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-on-surface-variant mt-2">{statusLabel}</p>

        {unscheduledBlocks.length > 0 && (
          <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <p className="text-xs text-on-surface-variant mt-2">{statusLabel}</p>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0">
        <TimetableGrid entries={revealedBlocks} density="fit" />
      </div>

      {/* Unscheduled banner — only after reveal finishes */}
      {state === 'finished' && unscheduledBlocks.length > 0 && (
        <div className="px-4 md:px-6 py-3 border-t border-amber-200 bg-amber-50 flex items-start gap-3">
          <Icon name="warning" size={18} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              {unscheduledBlocks.length} block
              {unscheduledBlocks.length === 1 ? '' : 's'} couldn't be placed
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              The solver scheduled everything else. Review these and plot them
              manually after accepting.
            </p>
            <details className="mt-1.5">
              <summary className="text-xs text-amber-800 cursor-pointer hover:underline select-none">
                Show {unscheduledBlocks.length} subject
                {unscheduledBlocks.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-2 space-y-0.5 list-disc list-inside max-h-32 overflow-y-auto text-xs text-amber-800">
                {unscheduledBlocks.map((b, i) => (
                  <li key={i}>
                    <span className="font-mono font-semibold">
                      {b.subjectCode}
                    </span>
                    {' · '}
                    {b.sectionCode}
                    {' · '}
                    <span className="uppercase">{b.kind}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="px-4 md:px-6 py-4 border-t border-surface-variant bg-surface-container-lowest flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {state === 'idle' && (
            <button
              type="button"
              onClick={startReveal}
              className="px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:bg-tertiary transition flex items-center gap-2"
            >
              <Icon name="play_arrow" size={16} />
              Start Reveal
            </button>
          )}

          {state === 'playing' && (
            <>
              <button
                type="button"
                onClick={togglePause}
                className="px-4 py-2 border border-surface-variant text-on-surface-variant text-sm font-semibold rounded-lg hover:bg-surface-container-low transition flex items-center gap-2"
              >
                <Icon name="pause" size={16} />
                Pause
              </button>
              <button
                type="button"
                onClick={skipToEnd}
                className="px-4 py-2 border border-surface-variant text-on-surface-variant text-sm font-semibold rounded-lg hover:bg-surface-container-low transition flex items-center gap-2"
              >
                <Icon name="fast_forward" size={16} />
                Skip to End
              </button>
            </>
          )}

          {state === 'paused' && (
            <>
              <button
                type="button"
                onClick={togglePause}
                className="px-4 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:bg-tertiary transition flex items-center gap-2"
              >
                <Icon name="play_arrow" size={16} />
                Resume
              </button>
              <button
                type="button"
                onClick={skipToEnd}
                className="px-4 py-2 border border-surface-variant text-on-surface-variant text-sm font-semibold rounded-lg hover:bg-surface-container-low transition flex items-center gap-2"
              >
                <Icon name="fast_forward" size={16} />
                Skip to End
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={accepting}
            className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-low rounded-lg transition disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={state !== 'finished' || accepting}
            className="px-6 py-2 bg-primary text-on-primary text-sm font-semibold rounded-lg hover:bg-tertiary transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {accepting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Icon name="check" size={16} />
                Accept Schedule
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}