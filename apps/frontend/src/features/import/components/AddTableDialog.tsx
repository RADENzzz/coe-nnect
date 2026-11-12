import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import type { ProspectusPdfTable, SemesterType, TableKind } from '../types';
import {
  MAX_TABLES,
  nextFreeCombination,
  SEMESTERS,
  YEAR_LEVELS,
} from '../constants';

interface AddTableDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (
    yearLevel: number,
    semester: SemesterType,
    tableKind: TableKind,
  ) => void;
  /** Tables already present for this PDF — disables taken regular (year, sem) pairs. */
  existingTables: ProspectusPdfTable[];
}

export default function AddTableDialog({
  open,
  onClose,
  onConfirm,
  existingTables,
}: AddTableDialogProps) {
  const [year, setYear] = useState(1);
  const [semester, setSemester] = useState<SemesterType>('1st');
  const [tableKind, setTableKind] = useState<TableKind>('regular');

  const regularTables = useMemo(
    () => existingTables.filter((t) => (t.tableKind ?? 'regular') === 'regular'),
    [existingTables],
  );

  const free = useMemo(
    () => nextFreeCombination(regularTables),
    [regularTables],
  );
  const maxTablesReached = existingTables.length >= MAX_TABLES;

  useEffect(() => {
    if (!open) return;
    const start = nextFreeCombination(regularTables);
    setYear(start?.yearLevel ?? 1);
    setSemester(start?.semester ?? '1st');
    setTableKind('regular');
  }, [open, regularTables]);

  const taken = (y: number, s: SemesterType) =>
    tableKind === 'regular' &&
    regularTables.some((t) => t.yearLevel === y && t.semester === s);

  const conflict = taken(year, semester);

  const handleConfirm = () => {
    if (conflict || maxTablesReached) return;
    onConfirm(year, semester, tableKind);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add table"
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={conflict || maxTablesReached}
            className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition disabled:opacity-50"
          >
            Next: Draw region
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Table Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  key: 'regular' as const,
                  label: 'Regular curriculum',
                  icon: 'table_chart',
                  hint: 'One per year/semester',
                },
                {
                  key: 'elective' as const,
                  label: 'Elective',
                  icon: 'stars',
                  hint: 'Multiple allowed',
                },
              ]
            ).map((k) => {
              const active = tableKind === k.key;
              return (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setTableKind(k.key)}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                    active
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-surface-variant text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  <Icon name={k.icon} size={16} className="mt-0.5 shrink-0" />
                  <span>
                    <span className="block text-xs font-semibold">
                      {k.label}
                    </span>
                    <span className="block text-[10px] opacity-80">
                      {k.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Year Level
          </label>
          <div className="grid grid-cols-6 gap-2">
            {YEAR_LEVELS.map((y) => {
              const allTaken = SEMESTERS.every((s) => taken(y, s.value));
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setYear(y);
                    const firstFree = SEMESTERS.find(
                      (s) => !taken(y, s.value),
                    );
                    if (firstFree) setSemester(firstFree.value);
                  }}
                  disabled={maxTablesReached || allTaken}
                  title={allTaken ? `Year ${y} is fully mapped` : `Year ${y}`}
                  className={`
                    relative py-2 rounded-lg text-sm font-semibold transition
                    disabled:opacity-40 disabled:cursor-not-allowed
                    ${
                      year === y
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
                    }
                  `}
                >
                  {y}
                  {allTaken && (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Semester
          </label>
          <div className="grid grid-cols-3 gap-2">
            {SEMESTERS.map((s) => {
              const isTaken = taken(year, s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSemester(s.value)}
                  disabled={maxTablesReached || isTaken}
                  title={
                    isTaken
                      ? `Year ${year} ${s.label} is already mapped`
                      : s.label
                  }
                  className={`
                    py-2 rounded-lg text-sm font-semibold transition
                    disabled:opacity-40 disabled:cursor-not-allowed
                    ${
                      semester === s.value
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
                    }
                  `}
                >
                  {s.label}
                  {isTaken && (
                    <span className="ml-1 text-[10px] font-normal opacity-70">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {conflict && (
          <div className="p-3 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 text-xs">
            A regular table for Year {year} {semester} already exists. Pick
            another combination or switch the table type to Elective.
          </div>
        )}

        {maxTablesReached && (
          <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-800 text-xs">
            All {MAX_TABLES} table slots are already mapped for this PDF (
            {YEAR_LEVELS.length} years × {SEMESTERS.length} semesters). Delete a
            table before adding another.
          </div>
        )}

        {!conflict && !maxTablesReached && (
          <p className="text-xs text-on-surface-variant">
            {tableKind === 'regular' && free
              ? `Next free regular combination: Year ${free.yearLevel} ${free.semester}. `
              : ''}
            After clicking next, drag a rectangle on the PDF to mark the{' '}
            {tableKind === 'elective'
              ? `elective table for Year ${year} ${semester}`
              : `Year ${year} ${semester} table`}
            .
          </p>
        )}
      </div>
    </Modal>
  );
}
