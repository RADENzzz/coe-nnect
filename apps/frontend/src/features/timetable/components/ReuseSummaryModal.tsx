import Modal from '../../../components/ui/Modal';
import Icon from '../../../components/ui/Icon';
import type { ReuseConflict, ReusePreflightResult } from '../../../api/schedule.api';

interface Props {
  open: boolean;
  onClose: () => void;
  termLabel: string;
  result: ReusePreflightResult | null;
  busy: boolean;
  onConfirm: () => void;
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : tone === 'bad'
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-outline-variant bg-surface-container-low text-on-surface';
  return (
    <div className={`border px-3 py-2 ${toneClass}`}>
      <dt className="text-[10px] font-bold uppercase tracking-wider opacity-80">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-black tabular-nums">{value}</dd>
    </div>
  );
}

function conflictLabel(conflict: ReuseConflict): string {
  const { subject_code, section_code, load_type, session_index } =
    conflict.entry;
  return `${subject_code ?? 'Unknown subject'} · ${section_code ?? '—'} · ${
    load_type ?? 'lecture'
  } · session ${(session_index ?? 0) + 1}`;
}

/**
 * Read-only preflight report shown before a published version is reused.
 * Nothing is written from this modal: the confirm button delegates to the
 * page's apply handler.
 */
export default function ReuseSummaryModal({
  open,
  onClose,
  termLabel,
  result,
  busy,
  onConfirm,
}: Props) {
  const hasWork =
    !!result && !result.failed && (result.ready > 0 || result.conflicts.length > 0);

  return (
    <Modal
      open={open && !!result}
      onClose={onClose}
      title={`Reuse into ${termLabel}`}
      description="Review the preflight summary before applying. Applied rows are drafts."
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
            {result?.failed ? 'Close' : 'Cancel'}
          </button>
          {hasWork && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Applying…' : 'Use matched subjects'}
            </button>
          )}
        </div>
      }
    >
      {result && (
        <div className="space-y-4">
          <div
            className={`flex items-start gap-2 border px-3 py-2 text-sm ${
              result.failed
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : 'border-primary/20 bg-primary/5 text-on-surface'
            }`}
            role="status"
            aria-live="polite"
          >
            <Icon
              name={result.failed ? 'error' : 'info'}
              size={16}
              className="mt-0.5 shrink-0"
            />
            <span>{result.summary}</span>
          </div>

          {result.failed && (
            <p className="text-xs text-on-surface-variant">
              No published subjects matched this term's prospectus. Nothing was
              plotted and no rows were changed.
            </p>
          )}

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Matched" value={result.matched} tone="good" />
            <Stat label="Ready" value={result.ready} tone="good" />
            <Stat label="Skipped" value={result.skipped} tone="warn" />
            <Stat label="Kept as is" value={result.keptAsIs} tone="neutral" />
            <Stat label="Warnings" value={result.warnings} tone="warn" />
            <Stat
              label="Conflicts"
              value={result.conflicts.length}
              tone="bad"
            />
          </dl>

          {result.conflicts.length > 0 && (
            <section aria-labelledby="reuse-summary-conflicts">
              <h3
                id="reuse-summary-conflicts"
                className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant"
              >
                Conflicts left unresolved
              </h3>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {result.conflicts.map((conflict, index) => (
                  <li
                    key={`${conflictLabel(conflict)}-${index}`}
                    className="border border-rose-200 bg-rose-50/60 px-2 py-1.5 text-xs text-rose-900"
                  >
                    <span className="font-semibold">
                      {conflictLabel(conflict)}
                    </span>
                    <span className="ml-1">{conflict.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-on-surface-variant">
                Ready rows are drafted now. Unresolved conflicts open the
                drag-and-drop workspace for individual review.
              </p>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
