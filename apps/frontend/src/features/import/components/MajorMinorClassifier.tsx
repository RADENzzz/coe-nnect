import { useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import { yearTermLabel } from '../utils/labels';
import {
  classifierGroupKeyOf,
  getClassifierRowsForGroup,
  getInitialClassifierGroupKey,
  type ClassifierGroup,
  type ClassifierRow,
} from './classifier-logic';

interface MajorMinorClassifierProps {
  rows: ClassifierRow[];
  onSetRowMinor: (key: string, isMinor: boolean) => void;
  onSetGroupMinor: (groupKey: string, isMinor: boolean) => void;
}

const TERM_ORDER: Record<string, number> = { '1st': 1, '2nd': 2, summer: 3 };

/**
 * Modal for separating regular subjects into Major and Minor.
 *
 * State stays inside this component on purpose: the import dialog renders a
 * large editable table, and hoisting the open/tab state to the parent made
 * every open and tab switch re-render that table (visible lag). The trigger
 * button and the modal therefore live together here.
 */
export default function MajorMinorClassifier({
  rows,
  onSetRowMinor,
  onSetGroupMinor,
}: MajorMinorClassifierProps) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState('all');

  const groups = useMemo<ClassifierGroup[]>(() => {
    const map = new Map<
      string,
      ClassifierGroup
    >();
    for (const row of rows) {
      const key = classifierGroupKeyOf(row);
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: yearTermLabel(row.yearLevel, row.semester),
          yearLevel: row.yearLevel,
          semester: row.semester,
        });
      }
    }
    return [...map.values()].sort((a, b) => {
      const yearDelta = (a.yearLevel ?? 99) - (b.yearLevel ?? 99);
      if (yearDelta !== 0) return yearDelta;
      return (TERM_ORDER[a.semester ?? ''] ?? 99) - (TERM_ORDER[b.semester ?? ''] ?? 99);
    });
  }, [rows]);

  const visibleRows = useMemo(
    () => getClassifierRowsForGroup(rows, group),
    [rows, group],
  );

  const majorCount = visibleRows.filter((r) => !r.isMinor).length;
  const minorCount = visibleRows.filter((r) => r.isMinor).length;

  // Start on the first year/term instead of rendering every row at once. The
  // All terms chip is still there for a whole-import pass.
  const openClassifier = () => {
    setGroup(getInitialClassifierGroupKey(groups));
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openClassifier}
        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-primary/40 text-primary hover:bg-primary/5 transition flex items-center gap-1"
      >
        <Icon name="tune" size={13} />
        Open classifier
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Separate major and minor subjects"
        description="Minor subjects are offered by another department. Everything is Major unless you mark it Minor here."
        size="lg"
        blurBackdrop={false}
        footer={
          <>
            <button
              type="button"
              onClick={() => onSetGroupMinor(group, false)}
              className="px-3 py-2 text-xs font-semibold border border-surface-variant rounded-lg text-slate-700 hover:bg-surface-container-high transition"
            >
              All major
            </button>
            <button
              type="button"
              onClick={() => onSetGroupMinor(group, true)}
              className="px-3 py-2 text-xs font-semibold border border-purple-300 rounded-lg text-purple-800 hover:bg-purple-50 transition"
            >
              All minor
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition rounded-lg"
            >
              Done
            </button>
          </>
        }
      >
        {rows.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            This import has no regular subjects to classify. Elective rows are
            classified when they are filled later.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Year/term tabs keep a multi-year import easy to review. */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setGroup('all')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                  group === 'all'
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-surface-container-lowest text-slate-600 border-surface-variant hover:bg-surface-container-high'
                }`}
              >
                All terms ({rows.length})
              </button>
              {groups.map((tab) => {
                const total = getClassifierRowsForGroup(rows, tab.key).length;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setGroup(tab.key)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                      group === tab.key
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container-lowest text-slate-600 border-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {tab.label} ({total})
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
              <span>
                Major: <strong className="text-primary">{majorCount}</strong>
              </span>
              <span>
                Minor:{' '}
                <strong className="text-purple-700">{minorCount}</strong>
              </span>
              <span className="ml-auto">
                Bulk actions apply to the selected tab.
              </span>
            </div>

            <ul className="divide-y divide-surface-variant border border-surface-variant rounded-lg overflow-hidden">
              {visibleRows.map((row) => (
                <li
                  key={row.key}
                  className={`px-3 py-2 flex items-center gap-3 ${
                    row.checked ? '' : 'opacity-60'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {row.typedCode.trim() || row.code || '(no code)'}
                      </span>
                      <span className="text-[10px] text-on-surface-variant">
                        {yearTermLabel(row.yearLevel, row.semester)}
                      </span>
                      {!row.checked && (
                        <span className="text-[10px] text-amber-700 font-semibold">
                          Not selected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface truncate">
                      {row.title}
                    </p>
                  </div>
                  <div className="flex rounded-lg overflow-hidden border border-surface-variant shrink-0">
                    <button
                      type="button"
                      onClick={() => onSetRowMinor(row.key, false)}
                      aria-pressed={!row.isMinor}
                      className={`px-2.5 py-1 text-[10px] font-bold transition ${
                        row.isMinor
                          ? 'bg-white text-slate-600 hover:bg-slate-100'
                          : 'bg-primary text-on-primary'
                      }`}
                    >
                      Major
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetRowMinor(row.key, true)}
                      aria-pressed={row.isMinor}
                      className={`px-2.5 py-1 text-[10px] font-bold transition ${
                        row.isMinor
                          ? 'bg-purple-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Minor
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <p className="text-[11px] text-on-surface-variant">
              Tip: you can also drag a regular row in the review list onto the
              Major or Minor box, or click the badge beside its code.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
