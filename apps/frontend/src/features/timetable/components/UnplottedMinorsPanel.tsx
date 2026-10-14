import Icon from '../../../components/ui/Icon';
import type { UnplottedMinor } from '../../../api/schedule.api';

interface Props {
  open: boolean;
  onClose: () => void;
  minors: UnplottedMinor[];
  onPlot: (subjectId: string) => void;
}

export default function UnplottedMinorsPanel({
  open,
  onClose,
  minors,
  onPlot,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative ml-auto w-full max-w-md h-full bg-surface-container-lowest shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-variant">
          <div>
            <h2 className="text-sm font-bold text-on-surface">
              Unplotted minor subjects
            </h2>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              {minors.length} subject{minors.length === 1 ? '' : 's'} need
              manual plotting
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant"
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {minors.length === 0 && (
            <p className="text-xs text-on-surface-variant text-center py-8">
              No unplotted minor subjects. You're good to go.
            </p>
          )}

          {minors.map((m) => (
            <div
              key={m.subjectId}
              className="rounded-lg border border-surface-variant bg-surface-container-low p-3 flex items-start gap-3"
            >
              <span className="inline-block w-2 h-2 rounded-full bg-purple-500 shrink-0 mt-1.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-mono font-bold text-primary text-sm">
                    {m.subjectCode}
                  </span>
                  {m.yearLevel != null && (
                    <span className="text-[10px] text-on-surface-variant font-mono">
                      Y{m.yearLevel}
                      {m.semester ? ` · ${m.semester}` : ''}
                    </span>
                  )}
                  {m.programCode && (
                    <span className="text-[10px] text-on-surface-variant">
                      · {m.programCode}
                    </span>
                  )}
                </div>
                <p className="text-xs text-on-surface mt-0.5 truncate">
                  {m.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onPlot(m.subjectId)}
                className="px-3 py-1.5 rounded-md bg-primary text-on-primary text-[11px] font-semibold hover:opacity-90 shrink-0"
              >
                Plot
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-surface-variant p-3 text-[11px] text-on-surface-variant flex items-start gap-1.5">
          <Icon name="info" size={12} className="shrink-0 mt-0.5" />
          <span>
            Minor subjects are treated as fixed obstacles. The solver places
            department subjects around them.
          </span>
        </div>
      </div>
    </div>
  );
}