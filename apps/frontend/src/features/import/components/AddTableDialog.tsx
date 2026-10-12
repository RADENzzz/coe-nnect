import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import type { ProspectusPdfTable, SemesterType } from '../types';

interface AddTableDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (yearLevel: number, semester: SemesterType) => void;
  /** Tables already present for this PDF — disables taken (year, sem) pairs. */
  existingTables: ProspectusPdfTable[];
}

const YEAR_LEVELS = [1, 2, 3, 4, 5, 6];
const SEMESTERS: { value: SemesterType; label: string }[] = [
  { value: '1st', label: '1st Semester' },
  { value: '2nd', label: '2nd Semester' },
  { value: 'summer', label: 'Summer' },
];

export default function AddTableDialog({
  open,
  onClose,
  onConfirm,
  existingTables,
}: AddTableDialogProps) {
  const [year, setYear] = useState(1);
  const [semester, setSemester] = useState<SemesterType>('1st');

  useEffect(() => {
    if (open) {
      setYear(1);
      setSemester('1st');
    }
  }, [open]);

  const taken = (y: number, s: SemesterType) =>
    existingTables.some((t) => t.yearLevel === y && t.semester === s);

  const conflict = taken(year, semester);
  const maxTablesReached = existingTables.length >= 12;

  const handleConfirm = () => {
    if (conflict || maxTablesReached) return;
    onConfirm(year, semester);
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
            Year Level
          </label>
          <div className="grid grid-cols-6 gap-2">
            {YEAR_LEVELS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYear(y)}
                className={`
                  py-2 rounded-lg text-sm font-semibold transition
                  ${
                    year === y
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
                  }
                `}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Semester
          </label>
          <div className="grid grid-cols-3 gap-2">
            {SEMESTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSemester(s.value)}
                className={`
                  py-2 rounded-lg text-sm font-semibold transition
                  ${
                    semester === s.value
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
                  }
                `}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {conflict && (
          <div className="p-3 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 text-xs">
            A table for Year {year} {semester} already exists. Pick another
            combination.
          </div>
        )}

        {maxTablesReached && (
          <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-800 text-xs">
            Maximum 12 tables reached for this PDF (4 years × 3 semesters).
          </div>
        )}

        {!conflict && !maxTablesReached && (
          <p className="text-xs text-on-surface-variant">
            After clicking next, drag a rectangle on the PDF to mark the Year{' '}
            {year} {semester} table.
          </p>
        )}
      </div>
    </Modal>
  );
}