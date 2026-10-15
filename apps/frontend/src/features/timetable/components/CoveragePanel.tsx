import { useEffect, useMemo, useState } from 'react';
import Icon from '../../../components/ui/Icon';
import type {
  CoverageReport,
  CoverageMissingItem,
} from '../../../api/schedule.api';

interface Props {
  open: boolean;
  onClose: () => void;
  coverage: CoverageReport | null;
  isLoading: boolean;
  onPlot: (subjectId: string) => void;
}

type Tab = 'all' | 'major' | 'minor';
type SortMode = 'section' | 'code';

export default function CoveragePanel({
  open,
  onClose,
  coverage,
  isLoading,
  onPlot,
}: Props) {
  const [tab, setTab] = useState<Tab>('all');
  const [sortMode, setSortMode] = useState<SortMode>('section');

  // Escape closes; body scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const totals = coverage?.totals ?? {
    expected: 0,
    plotted: 0,
    missing: 0,
    percent: 100,
  };

  const missing = coverage?.missing ?? [];
  const missingMajor = missing.filter((m) => !m.isMinor);
  const missingMinor = missing.filter((m) => m.isMinor);

  const visible = useMemo(
    () =>
      tab === 'major' ? missingMajor : tab === 'minor' ? missingMinor : missing,
    [tab, missingMajor, missingMinor, missing],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, CoverageMissingItem[]>();
    for (const m of visible) {
      const key = sortMode === 'section' ? m.sectionCode : m.subjectCode[0] ?? '?';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    // Sort items inside each group
    for (const list of map.values()) {
      if (sortMode === 'section') {
        list.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
      } else {
        list.sort((a, b) =>
          `${a.sectionCode}-${a.subjectCode}`.localeCompare(
            `${b.sectionCode}-${b.subjectCode}`,
          ),
        );
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible, sortMode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="absolute inset-0 bg-black/30 animate-backdrop-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Prospectus coverage"
        className="relative ml-auto w-full max-w-md h-full bg-surface-container-lowest shadow-2xl flex flex-col animate-slide-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-variant">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-on-surface">
              Prospectus coverage
            </h2>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              {isLoading
                ? 'Loading…'
                : coverage?.termSemester
                ? `${totals.plotted} of ${totals.expected} plotted · ${totals.percent}%`
                : 'No semester set on the active term'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant shrink-0"
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Totals strip */}
        {!isLoading && coverage?.termSemester && (
          <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-surface-variant bg-surface-container-low">
            <Stat label="Expected" value={totals.expected} tone="neutral" />
            <Stat label="Plotted" value={totals.plotted} tone="success" />
            <Stat label="Missing" value={totals.missing} tone="danger" />
          </div>
        )}

        {/* Tabs + sort */}
        {!isLoading && missing.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-4 pt-3 border-b border-surface-variant">
            <div className="flex gap-1">
              {(
                [
                  ['all', 'All', missing.length],
                  ['major', 'Major', missingMajor.length],
                  ['minor', 'Minor', missingMinor.length],
                ] as Array<[Tab, string, number]>
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition ${
                    tab === key
                      ? 'border-primary text-primary'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {label}
                  <span className="ml-1.5 text-[10px] opacity-70">
                    ({count})
                  </span>
                </button>
              ))}
            </div>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="text-[10px] bg-surface-container-low border border-surface-variant rounded px-1.5 py-1 text-on-surface-variant focus:outline-none focus:border-primary"
              title="Sort mode"
            >
              <option value="section">By section</option>
              <option value="code">By code</option>
            </select>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading && (
            <p className="text-xs text-on-surface-variant text-center py-8">
              Loading coverage…
            </p>
          )}

          {!isLoading && !coverage?.termSemester && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
              <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
              <span>
                The active term has no semester set. Coverage cannot be
                computed. Set it in System Settings → Terms.
              </span>
            </div>
          )}

          {!isLoading && coverage?.termSemester && visible.length === 0 && (
            <div className="text-center py-10 border border-dashed border-surface-variant rounded-lg">
              <Icon
                name="check_circle"
                size={32}
                className="text-green-600 mx-auto mb-2"
              />
              <p className="text-sm font-semibold text-on-surface">
                {tab === 'all'
                  ? 'Full coverage'
                  : tab === 'major'
                  ? 'All majors plotted'
                  : 'All minors plotted'}
              </p>
              <p className="text-xs text-on-surface-variant mt-1">
                {totals.plotted} of {totals.expected} expected (subject ×
                section) pairs are already plotted.
              </p>
            </div>
          )}

          {!isLoading &&
            grouped.map(([groupKey, items]) => (
              <div key={groupKey}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
                    {sortMode === 'section'
                      ? groupKey
                      : `Codes starting with ${groupKey}`}
                  </span>
                  <span className="text-[10px] text-on-surface-variant">
                    {items.length} missing
                  </span>
                </div>
                <ul className="space-y-2">
                  {items.map((m) => (
                    <li
                      key={`${m.subjectId}::${m.sectionId}`}
                      className="rounded-lg border border-surface-variant bg-surface-container-low p-3 flex items-start gap-3"
                    >
                      <span
                        className={`inline-block w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                          m.isMinor ? 'bg-purple-500' : 'bg-rose-500'
                        }`}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-mono font-bold text-primary text-sm">
                            {m.subjectCode}
                          </span>
                          {m.isMinor && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded bg-purple-100 text-purple-800">
                              Minor
                            </span>
                          )}
                          {m.sourceDept && (
                            <span
                              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded bg-amber-100 text-amber-800"
                              title={`Taught by ${m.sourceDept}`}
                            >
                              {m.sourceDept}
                            </span>
                          )}
                          {m.loadTypes.length > 0 && (
                            <span className="text-[10px] text-on-surface-variant font-mono">
                              {m.loadTypes
                                .map((lt) =>
                                  lt === 'lecture' ? 'LEC' : 'LAB',
                                )
                                .join(' + ')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-on-surface mt-0.5 truncate">
                          {m.title}
                        </p>
                        <p className="text-[10px] text-on-surface-variant mt-0.5">
                          Y{m.yearLevel}
                          {m.programCode ? ` · ${m.programCode}` : ''}
                          {sortMode === 'code' ? ` · ${m.sectionCode}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onPlot(m.subjectId)}
                        className="px-3 py-1.5 rounded-md bg-primary text-on-primary text-[11px] font-semibold hover:opacity-90 shrink-0"
                      >
                        Plot
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="border-t border-surface-variant p-3 text-[11px] text-on-surface-variant flex items-start gap-1.5">
          <Icon name="info" size={12} className="shrink-0 mt-0.5" />
          <span>
            Expected count is computed per (subject, section) pair — one entry
            per section that must take the subject. External subjects from
            other colleges are excluded.
          </span>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'success' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-green-700'
      : tone === 'danger'
      ? 'text-rose-700'
      : 'text-on-surface';
  return (
    <div className="text-center">
      <p className={`text-lg font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">
        {label}
      </p>
    </div>
  );
}