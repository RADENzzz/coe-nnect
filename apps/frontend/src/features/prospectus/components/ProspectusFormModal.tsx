import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createProspectus,
  updateProspectus,
  type ProspectusRecord,
  type SemesterType,
} from '../../../api/prospectus.api';
import type { ProgramRecord } from '../../../api/programs.api';
import type { SubjectRecord } from '../../../api/subjects.api';
import Modal from '../../../components/ui/Modal';

const SEMESTERS: { value: SemesterType; label: string }[] = [
  { value: '1st', label: '1st Semester' },
  { value: '2nd', label: '2nd Semester' },
  { value: 'summer', label: 'Summer' },
];

const YEAR_LEVELS = [1, 2, 3, 4, 5, 6];

interface Props {
  open: boolean;
  onClose: () => void;
  programs: ProgramRecord[];
  subjects: SubjectRecord[];
  editing: ProspectusRecord | null;
  defaultProgramId?: string;
  defaultYearLevel?: number;
  defaultSemester?: SemesterType;
}

export default function ProspectusFormModal({
  open,
  onClose,
  programs,
  subjects,
  editing,
  defaultProgramId,
  defaultYearLevel,
  defaultSemester,
}: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    programId: '',
    subjectId: '',
    yearLevel: 1,
    semester: '1st' as SemesterType,
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        programId: editing.programId,
        subjectId: editing.subjectId,
        yearLevel: editing.yearLevel,
        semester: editing.semester,
      });
    } else {
      setForm({
        programId: defaultProgramId ?? '',
        subjectId: '',
        yearLevel: defaultYearLevel ?? 1,
        semester: defaultSemester ?? '1st',
      });
    }
    setError(null);
  }, [open, editing, defaultProgramId, defaultYearLevel, defaultSemester]);

  const createMutation = useMutation({
    mutationFn: createProspectus,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospectus'] });
      qc.invalidateQueries({ queryKey: ['prospectus-by-program'] });
      onClose();
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof updateProspectus>[1];
    }) => updateProspectus(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospectus'] });
      qc.invalidateQueries({ queryKey: ['prospectus-by-program'] });
      onClose();
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to update'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.programId || !form.subjectId) {
      setError('Program and Subject are required.');
      return;
    }

    if (editing) {
      updateMutation.mutate({
        id: editing.prospectusId,
        input: {
          programId: form.programId,
          subjectId: form.subjectId,
          yearLevel: form.yearLevel,
          semester: form.semester,
        },
      });
    } else {
      createMutation.mutate({
        programId: form.programId,
        subjectId: form.subjectId,
        yearLevel: form.yearLevel,
        semester: form.semester,
      });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Prospectus Entry' : 'Add Subject to Prospectus'}
      description={
        editing
          ? `Update the placement of ${editing.subject?.subjectCode ?? 'this subject'}.`
          : 'Map a subject to a program, year level, and semester.'
      }
      size="lg"
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
            type="submit"
            form="prospectus-form"
            disabled={isSaving}
            className="px-6 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition disabled:opacity-50"
          >
            {isSaving
              ? 'Saving…'
              : editing
              ? 'Save Changes'
              : 'Add to Prospectus'}
          </button>
        </>
      }
    >
      <form
        id="prospectus-form"
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {error && (
          <div className="p-3 bg-red-100 border border-red-300 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Program */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
            Program *
          </label>
          <select
            required
            value={form.programId}
            onChange={(e) =>
              setForm((p) => ({ ...p, programId: e.target.value }))
            }
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
          >
            <option value="">Select a program…</option>
            {programs.map((p) => (
              <option key={p.programId} value={p.programId}>
                [{p.programCode}] {p.programName}
              </option>
            ))}
          </select>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
            Subject *
          </label>
          <select
            required
            value={form.subjectId}
            onChange={(e) =>
              setForm((p) => ({ ...p, subjectId: e.target.value }))
            }
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
          >
            <option value="">Select a subject…</option>
            {subjects
              .filter((s) => s.isActive)
              .map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  [{s.subjectCode}] {s.title} — {Number(s.lectureUnits)}L+
                  {Number(s.labUnits)}Lab
                </option>
              ))}
          </select>
        </div>

        {/* Year + Semester */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Year Level *
            </label>
            <select
              required
              value={form.yearLevel}
              onChange={(e) =>
                setForm((p) => ({ ...p, yearLevel: Number(e.target.value) }))
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            >
              {YEAR_LEVELS.map((y) => (
                <option key={y} value={y}>
                  {y}
                  {y === 1 ? 'st' : y === 2 ? 'nd' : y === 3 ? 'rd' : 'th'} Year
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              Semester *
            </label>
            <select
              required
              value={form.semester}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  semester: e.target.value as SemesterType,
                }))
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            >
              {SEMESTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>
    </Modal>
  );
}