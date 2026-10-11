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
import Icon from '../../../components/ui/Icon';

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

const EMPTY_FORM = {
  programId: '',
  subjectId: '',
  yearLevel: 1,
  semester: '1st' as SemesterType,
  lectureSessionsPerWeek: 1,
  lectureMinutesPerSession: 90,
  labSessionsPerWeek: 1,
  labMinutesPerSession: 180,
};

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

  const [form, setForm] = useState(EMPTY_FORM);

  // ── Derive the selected subject to toggle the pattern fields ──
  const selectedSubject = subjects.find(
    (s) => String(s.subjectId) === String(form.subjectId),
  );
  const hasLecture = (selectedSubject?.lectureUnits ?? 0) > 0;
  const hasLab = (selectedSubject?.labUnits ?? 0) > 0;

  // ── Prefill / reset when the modal opens ──
  useEffect(() => {
    if (!open) return;

    if (editing) {
      setForm({
        programId: editing.programId,
        subjectId: editing.subjectId,
        yearLevel: editing.yearLevel,
        semester: editing.semester,
        lectureSessionsPerWeek: editing.lectureSessionsPerWeek ?? 1,
        lectureMinutesPerSession: editing.lectureMinutesPerSession ?? 90,
        labSessionsPerWeek: editing.labSessionsPerWeek ?? 1,
        labMinutesPerSession: editing.labMinutesPerSession ?? 180,
      });
    } else {
      setForm({
        ...EMPTY_FORM,
        programId: defaultProgramId ?? '',
        yearLevel: defaultYearLevel ?? 1,
        semester: defaultSemester ?? '1st',
      });
    }
    setError(null);
  }, [open, editing, defaultProgramId, defaultYearLevel, defaultSemester]);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: createProspectus,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prospectus'] });
      qc.invalidateQueries({ queryKey: ['prospectus-by-program'] });
      onClose();
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to create',
      ),
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
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to update',
      ),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.programId || !form.subjectId) {
      setError('Program and Subject are required.');
      return;
    }

    // ── Client-side validation matching SQL constraints ──
    if (
      form.lectureSessionsPerWeek < 1 ||
      form.lectureSessionsPerWeek > 5
    ) {
      setError('Lecture sessions per week must be between 1 and 5.');
      return;
    }
    if (
      form.lectureMinutesPerSession < 30 ||
      form.lectureMinutesPerSession > 240
    ) {
      setError('Lecture minutes per session must be between 30 and 240.');
      return;
    }
    if (form.labSessionsPerWeek < 1 || form.labSessionsPerWeek > 3) {
      setError('Lab sessions per week must be between 1 and 3.');
      return;
    }
    if (
      form.labMinutesPerSession < 60 ||
      form.labMinutesPerSession > 300
    ) {
      setError('Lab minutes per session must be between 60 and 300.');
      return;
    }

    const payload = {
      programId: form.programId,
      subjectId: form.subjectId,
      yearLevel: form.yearLevel,
      semester: form.semester,
      // Only send meaningful values for the components the subject has.
      lectureSessionsPerWeek: hasLecture ? form.lectureSessionsPerWeek : 1,
      lectureMinutesPerSession: hasLecture
        ? form.lectureMinutesPerSession
        : 90,
      labSessionsPerWeek: hasLab ? form.labSessionsPerWeek : 1,
      labMinutesPerSession: hasLab ? form.labMinutesPerSession : 180,
    };

    if (editing) {
      updateMutation.mutate({
        id: editing.prospectusId,
        input: payload,
      });
    } else {
      createMutation.mutate(payload);
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
                setForm((p) => ({
                  ...p,
                  yearLevel: Number(e.target.value),
                }))
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            >
              {YEAR_LEVELS.map((y) => (
                <option key={y} value={y}>
                  {y}
                  {y === 1 ? 'st' : y === 2 ? 'nd' : y === 3 ? 'rd' : 'th'}{' '}
                  Year
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

        {/* ═══════════════════════════════════════════════ */}
        {/* Meeting Pattern (Phase 2)                       */}
        {/* ═══════════════════════════════════════════════ */}
        {selectedSubject && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-4">
            <div className="flex items-start gap-2">
              <Icon
                name="schedule"
                size={18}
                className="text-primary mt-0.5 shrink-0"
              />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Meeting Pattern
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  How many times per week does this subject meet, and for how
                  long? The scheduler uses this pattern.
                </p>
              </div>
            </div>

            {/* Lecture pattern */}
            {hasLecture && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Lecture sessions / week
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    step={1}
                    value={form.lectureSessionsPerWeek}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        lectureSessionsPerWeek: Number(e.target.value) || 1,
                      }))
                    }
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    1 to 5 (typically 2 for M/Th or T/F, 3 for MWF)
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Lecture minutes / session
                  </label>
                  <input
                    type="number"
                    min={30}
                    max={240}
                    step={15}
                    value={form.lectureMinutesPerSession}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        lectureMinutesPerSession:
                          Number(e.target.value) || 90,
                      }))
                    }
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    30 to 240 (typically 90)
                  </p>
                </div>
              </div>
            )}

            {/* Lab pattern */}
            {hasLab && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Lab sessions / week
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={3}
                    step={1}
                    value={form.labSessionsPerWeek}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        labSessionsPerWeek: Number(e.target.value) || 1,
                      }))
                    }
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    1 to 3 (typically 1)
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Lab minutes / session
                  </label>
                  <input
                    type="number"
                    min={60}
                    max={300}
                    step={30}
                    value={form.labMinutesPerSession}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        labMinutesPerSession: Number(e.target.value) || 180,
                      }))
                    }
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    60 to 300 (typically 180 = 3 hours)
                  </p>
                </div>
              </div>
            )}

            {/* Info when the subject has neither lecture nor lab units */}
            {!hasLecture && !hasLab && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                This subject has 0 lecture and 0 lab units. Add units on the
                Subjects page before mapping it here.
              </p>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}