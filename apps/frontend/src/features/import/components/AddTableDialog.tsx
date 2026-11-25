import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import type {
  ProspectusPdfTable,
  SemesterType,
  TableKind,
} from '../types';
import { maxTables, nextFreeCombination, YEAR_LEVELS } from '../constants';
import { useSemesterTypes } from '@/hooks/use-semester-types';

interface AddTableDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (
    yearLevel: number | null,
    semester: SemesterType | null,
    tableKind: TableKind,
    label: string | null,
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
  const {
    activeTypes,
    shortLabelFor,
    isLoading: catalogLoading,
    isError: catalogError,
  } = useSemesterTypes();
  const [year, setYear] = useState(1);
  const [semester, setSemester] = useState<SemesterType>(
    () => activeTypes[0]?.code ?? '',
  );
  const [tableKind, setTableKind] = useState<TableKind>('regular');
  const [label, setLabel] = useState('');
  const wasOpenRef = useRef(false);

  const regularTables = useMemo(
    () =>
      existingTables.filter(
        (
          t,
        ): t is ProspectusPdfTable & {
          yearLevel: number;
          semester: SemesterType;
        } =>
          (t.tableKind ?? 'regular') === 'regular' &&
          t.yearLevel != null &&
          t.semester != null,
      ),
    [existingTables],
  );

  const free = useMemo(
    () => nextFreeCombination(regularTables, activeTypes),
    [regularTables, activeTypes],
  );
  const catalogReady = !catalogLoading && !catalogError;
  const totalTables = maxTables(activeTypes.length);
  const maxTablesReached =
    catalogReady && existingTables.length >= totalTables;
  const isElective = tableKind === 'elective';
  const missingSemester = !isElective && catalogReady && !semester;
  const catalogUnavailableForRegular = !isElective && !catalogReady;

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const start = nextFreeCombination(regularTables, activeTypes);
      setYear(start?.yearLevel ?? 1);
      setSemester(start?.semester ?? activeTypes[0]?.code ?? '');
      setTableKind('regular');
      setLabel('');
    }
    wasOpenRef.current = open;
  }, [open, regularTables, activeTypes]);

  // The catalog loads asynchronously. Repair an unfilled selection once its
  // active types arrive, without overwriting a type the user already picked.
  useEffect(() => {
    if (activeTypes.length === 0) return;
    if (semester && activeTypes.some((t) => t.code === semester)) return;
    const start = nextFreeCombination(regularTables, activeTypes);
    setSemester(start?.semester ?? activeTypes[0].code);
    if (start) setYear(start.yearLevel);
  }, [activeTypes, semester, regularTables]);

  const taken = (y: number, s: SemesterType) =>
    tableKind === 'regular' &&
    regularTables.some((t) => t.yearLevel === y && t.semester === s);

  const conflict = !isElective && taken(year, semester);
  const blocked =
    conflict || missingSemester || maxTablesReached || catalogUnavailableForRegular;

  const handleConfirm = () => {
    if (blocked) return;
    const trimmedLabel = label.trim().slice(0, 200);
    if (isElective) {
      // Electives are optioned: they are assigned to a year/term later.
      onConfirm(null, null, 'elective', trimmedLabel || null);
      return;
    }
    onConfirm(year, semester, 'regular', null);
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
            disabled={blocked}
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
                  hint: 'Any year/term · multiple allowed',
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

        {isElective ? (
          <>
            <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-xs flex items-start gap-2">
              <Icon name="stars" size={16} className="shrink-0 mt-0.5" />
              <span>
                Elective tables are not tied to a year or term. Imported
                electives go into the subject catalog, then you assign them to a
                year and semester when you build the prospectus.
              </span>
            </div>
            <div>
              <label
                htmlFor="add-table-label"
                className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider"
              >
                Group name <span className="normal-case font-normal">(optional)</span>
              </label>
              <input
                id="add-table-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={200}
                placeholder="e.g. SOFTWARE DEVELOPMENT"
                className="w-full rounded-lg border border-surface-variant bg-white px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-on-surface-variant">
                Shown above the table and in the import list. Leave blank to use
                the all-caps heading found inside the region you draw.
              </p>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Year Level
              </label>
              <div className="grid grid-cols-6 gap-2">
                {YEAR_LEVELS.map((y) => {
                  const allTaken = activeTypes.every((s) => taken(y, s.code));
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => {
                        setYear(y);
                        const firstFree = activeTypes.find(
                          (s) => !taken(y, s.code),
                        );
                        if (firstFree) setSemester(firstFree.code);
                      }}
                      disabled={maxTablesReached || allTaken}
                      title={
                        allTaken ? `Year ${y} is fully mapped` : `Year ${y}`
                      }
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
                {activeTypes.map((s) => {
                  const isTaken = taken(year, s.code);
                  return (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => setSemester(s.code)}
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
                          semester === s.code
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
          </>
        )}

        {conflict && (
          <div className="p-3 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 text-xs">
            A regular table for Year {year} {shortLabelFor(semester)} already
            exists. Pick another combination or switch the table type to
            Elective.
          </div>
        )}

        {catalogUnavailableForRegular && catalogLoading && (
          <div className="p-3 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-xs">
            Loading semester types… Choose a semester before creating a
            regular table.
          </div>
        )}

        {catalogUnavailableForRegular && catalogError && (
          <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-800 text-xs">
            Semester types could not be loaded, so a regular table cannot be
            created right now. Retry after the catalog service recovers.
          </div>
        )}

        {missingSemester && (
          <div className="p-3 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 text-xs">
            No semester types are configured yet. Add one in System Config
            before creating a regular table.
          </div>
        )}

        {maxTablesReached && (
          <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-800 text-xs">
            All {totalTables} table slots are already mapped for this PDF (
            {YEAR_LEVELS.length} years × {activeTypes.length} semesters). Delete
            a table before adding another.
          </div>
        )}

        {!blocked && (
          <p className="text-xs text-on-surface-variant">
            {!isElective && free
              ? `Next free regular combination: Year ${free.yearLevel} ${shortLabelFor(
                  free.semester,
                )}. `
              : ''}
            After clicking next, drag a rectangle on the PDF to mark the{' '}
            {isElective
              ? 'elective table'
              : `Year ${year} ${shortLabelFor(semester)} table`}
            .
          </p>
        )}
      </div>
    </Modal>
  );
}
