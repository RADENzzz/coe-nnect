import { useState, useEffect, useMemo, useRef } from 'react';
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

function ordinalSuffix(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'th';
  if (rem10 === 1) return 'st';
  if (rem10 === 2) return 'nd';
  if (rem10 === 3) return 'rd';
  return 'th';
}

interface Props {
  open: boolean;
  onClose: () => void;
  programs: ProgramRecord[];
  subjects: SubjectRecord[];
  editing: ProspectusRecord | null;
  defaultProgramId?: string;
  defaultYearLevel?: number;
  defaultSemester?: SemesterType;
  /** All existing entries — used for duplicate detection */
  existingEntries?: ProspectusRecord[];
}

interface FormState {
  programId: string;
  subjectId: string;
  yearLevel: number;
  semester: SemesterType;
  lectureSessionsPerWeek: number;
  lectureMinutesPerSession: number;
  labSessionsPerWeek: number;
  labMinutesPerSession: number;
}

const EMPTY_FORM: FormState = {
  programId: '',
  subjectId: '',
  yearLevel: 1,
  semester: '1st',
  lectureSessionsPerWeek: 1,
  lectureMinutesPerSession: 90,
  labSessionsPerWeek: 1,
  labMinutesPerSession: 180,
};

type PresetKey = 'mwf' | 'tth' | 'once' | 'daily';

interface Preset {
  key: PresetKey;
  label: string;
  hint: string;
  sessions: number;
  minutes: number;
}

const LECTURE_PRESETS: Preset[] = [
  { key: 'mwf', label: 'MWF', hint: '3×60 min', sessions: 3, minutes: 60 },
  { key: 'tth', label: 'TTh', hint: '2×90 min', sessions: 2, minutes: 90 },
  { key: 'once', label: 'Once/wk', hint: '1×180 min', sessions: 1, minutes: 180 },
];

const LAB_PRESETS: Preset[] = [
  { key: 'once', label: 'Once/wk', hint: '1×180 min', sessions: 1, minutes: 180 },
  { key: 'tth', label: 'Twice/wk', hint: '2×120 min', sessions: 2, minutes: 120 },
];

export default function ProspectusFormModal({
  open,
  onClose,
  programs,
  subjects,
  editing,
  defaultProgramId,
  defaultYearLevel,
  defaultSemester,
  existingEntries = [],
}: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const subjectDropdownRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  // ── Derived: selected subject ──
  const selectedSubject = useMemo(
    () => subjects.find((s) => String(s.subjectId) === String(form.subjectId)),
    [subjects, form.subjectId],
  );
  const hasLecture = (selectedSubject?.lectureUnits ?? 0) > 0;
  const hasLab = (selectedSubject?.labUnits ?? 0) > 0;
  const isMinor = selectedSubject?.isMinor ?? false;

  // ── Derived: total weekly hours per component ──
  const lectureHours =
    (form.lectureSessionsPerWeek * form.lectureMinutesPerSession) / 60;
  const labHours = (form.labSessionsPerWeek * form.labMinutesPerSession) / 60;
  const totalHours = lectureHours + labHours;

  // ── Auto-suggest meeting pattern based on units (create mode only) ──
  useEffect(() => {
    if (editing) return;
    if (!selectedSubject) return;
    const lec = Number(selectedSubject.lectureUnits ?? 0);
    const lab = Number(selectedSubject.labUnits ?? 0);

    setForm((p) => {
      const next = { ...p };
      // Standard heuristic: 3 lec units → 2×90; else 1×90
      if (lec > 0 && !p.lectureMinutesPerSession) {
        next.lectureSessionsPerWeek = lec >= 3 ? 2 : 1;
        next.lectureMinutesPerSession = 90;
      }
      // Lab: 1 unit → 3hr session; 2 units → 2×90
      if (lab > 0 && !p.labMinutesPerSession) {
        next.labSessionsPerWeek = lab >= 2 ? 2 : 1;
        next.labMinutesPerSession = lab >= 2 ? 90 : 180;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject?.subjectId]);

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
      setSubjectSearch(
        (() => {
          const s = subjects.find(
            (x) => String(x.subjectId) === String(editing.subjectId),
          );
          return s ? `[${s.subjectCode}] ${s.title}` : '';
        })(),
      );
    } else {
      setForm({
        ...EMPTY_FORM,
        programId: defaultProgramId ?? '',
        yearLevel: defaultYearLevel ?? 1,
        semester: defaultSemester ?? '1st',
      });
      setSubjectSearch('');
    }
    setError(null);
    setFieldErrors({});
    setSubjectDropdownOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.prospectusId, defaultProgramId, defaultYearLevel, defaultSemester]);

  // ── Close dropdown on outside click ──
  useEffect(() => {
    if (!subjectDropdownOpen) return;
    const onDown = (e: MouseEvent) => {
      if (
        subjectDropdownRef.current &&
        !subjectDropdownRef.current.contains(e.target as Node)
      ) {
        setSubjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [subjectDropdownOpen]);

  // ── Filter subjects by search + exclude already-used ones ──
  const subjectsInCurrentProgram = useMemo(() => {
    if (!form.programId) return new Set<string>();
    const set = new Set<string>();
    for (const e of existingEntries) {
      if (
        String(e.programId) === String(form.programId) &&
        e.yearLevel === form.yearLevel &&
        e.semester === form.semester &&
        e.prospectusId !== editing?.prospectusId
      ) {
        set.add(String(e.subjectId));
      }
    }
    return set;
  }, [
    existingEntries,
    form.programId,
    form.yearLevel,
    form.semester,
    editing?.prospectusId,
  ]);

  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    return subjects
      .filter((s) => s.isActive)
      .filter((s) => {
        // When editing, always include the current subject
        if (editing && String(s.subjectId) === String(editing.subjectId)) {
          return true;
        }
        // Exclude subjects already in this program + year + semester
        if (subjectsInCurrentProgram.has(String(s.subjectId))) return false;
        return true;
      })
      .filter((s) => {
        if (!q) return true;
        return (
          s.subjectCode.toLowerCase().includes(q) ||
          s.title.toLowerCase().includes(q)
        );
      });
  }, [subjects, subjectSearch, subjectsInCurrentProgram, editing]);

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

  // ── Validation ──
  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.programId) errs.programId = 'Program is required';
    if (!form.subjectId) errs.subjectId = 'Subject is required';
    if (!form.yearLevel) errs.yearLevel = 'Year level is required';
    if (!form.semester) errs.semester = 'Semester is required';

    if (hasLecture) {
      if (form.lectureSessionsPerWeek < 1 || form.lectureSessionsPerWeek > 5) {
        errs.lectureSessionsPerWeek = 'Between 1 and 5';
      }
      if (
        form.lectureMinutesPerSession < 30 ||
        form.lectureMinutesPerSession > 240
      ) {
        errs.lectureMinutesPerSession = 'Between 30 and 240';
      }
    }
    if (hasLab) {
      if (form.labSessionsPerWeek < 1 || form.labSessionsPerWeek > 3) {
        errs.labSessionsPerWeek = 'Between 1 and 3';
      }
      if (
        form.labMinutesPerSession < 60 ||
        form.labMinutesPerSession > 300
      ) {
        errs.labMinutesPerSession = 'Between 60 and 300';
      }
    }

    // Duplicate detection
    if (!editing && form.programId && form.subjectId) {
      const dup = existingEntries.find(
        (e) =>
          String(e.programId) === String(form.programId) &&
          String(e.subjectId) === String(form.subjectId) &&
          e.yearLevel === form.yearLevel &&
          e.semester === form.semester,
      );
      if (dup) {
        errs.subjectId = 'This subject is already mapped to this slot';
      }
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    const payload = {
      programId: form.programId,
      subjectId: form.subjectId,
      yearLevel: form.yearLevel,
      semester: form.semester,
      lectureSessionsPerWeek: hasLecture ? form.lectureSessionsPerWeek : 1,
      lectureMinutesPerSession: hasLecture
        ? form.lectureMinutesPerSession
        : 90,
      labSessionsPerWeek: hasLab ? form.labSessionsPerWeek : 1,
      labMinutesPerSession: hasLab ? form.labMinutesPerSession : 180,
    };

    if (editing) {
      updateMutation.mutate({ id: editing.prospectusId, input: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleRequestClose = () => {
    if (isSaving) return;
    const dirty =
      !editing &&
      (form.programId !== (defaultProgramId ?? '') ||
        form.subjectId ||
        form.yearLevel !== (defaultYearLevel ?? 1) ||
        form.semester !== (defaultSemester ?? '1st'));
    if (dirty) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  };

  // ── Live preview ──
  const preview = useMemo(() => {
    const parts: string[] = [];
    const program = programs.find(
      (p) => String(p.programId) === String(form.programId),
    );
    if (program) parts.push(`[${program.programCode}]`);
    if (form.yearLevel)
      parts.push(`${form.yearLevel}${ordinalSuffix(form.yearLevel)} Year`);
    const sem = SEMESTERS.find((s) => s.value === form.semester);
    if (sem) parts.push(sem.label);
    if (selectedSubject) {
      parts.push(`${selectedSubject.subjectCode} · ${selectedSubject.title}`);
    }
    return parts.join(' · ');
  }, [programs, form.programId, form.yearLevel, form.semester, selectedSubject]);

  // ── Apply preset ──
  const applyLecturePreset = (preset: Preset) => {
    setForm((p) => ({
      ...p,
      lectureSessionsPerWeek: preset.sessions,
      lectureMinutesPerSession: preset.minutes,
    }));
    setFieldErrors((fe) => ({
      ...fe,
      lectureSessionsPerWeek: undefined,
      lectureMinutesPerSession: undefined,
    }));
  };

  const applyLabPreset = (preset: Preset) => {
    setForm((p) => ({
      ...p,
      labSessionsPerWeek: preset.sessions,
      labMinutesPerSession: preset.minutes,
    }));
    setFieldErrors((fe) => ({
      ...fe,
      labSessionsPerWeek: undefined,
      labMinutesPerSession: undefined,
    }));
  };

  return (
    <>
      <Modal
        open={open}
        onClose={handleRequestClose}
        title={editing ? 'Edit Prospectus Entry' : 'Add Subject to Prospectus'}
        description={
          editing
            ? `Update the placement of ${editing.subject?.subjectCode ?? 'this subject'}.`
            : 'Map a subject to a program, year level, and semester.'
        }
        size="lg"
        busy={isSaving}
        footer={
          <>
            <button
              type="button"
              onClick={handleRequestClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="prospectus-form"
              disabled={isSaving}
              className="px-6 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2 rounded-lg"
            >
              {isSaving && (
                <Icon
                  name="progress_activity"
                  size={14}
                  className="animate-spin"
                />
              )}
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
          className="space-y-5"
        >
          {error && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-700 text-sm flex items-start gap-2 rounded-lg">
              <Icon name="error" size={16} className="shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-800"
                aria-label="Dismiss"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )}

          {/* Live preview */}
          {preview && (
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs">
              <Icon name="preview" size={14} className="text-primary" />
              <span className="font-mono text-primary">{preview}</span>
            </div>
          )}

          {/* ══════════════════════════════════════════ */}
          {/* Placement                                  */}
          {/* ══════════════════════════════════════════ */}
          <FormSection title="Placement" icon="place">
            <div className="space-y-4">
              <FormField
                label="Program"
                required
                error={fieldErrors.programId}
              >
                <select
                  ref={firstFieldRef}
                  value={form.programId}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, programId: e.target.value }));
                    setFieldErrors((fe) => ({ ...fe, programId: undefined }));
                  }}
                  className={inputClass(!!fieldErrors.programId)}
                >
                  <option value="">Select a program…</option>
                  {programs.map((p) => (
                    <option key={p.programId} value={p.programId}>
                      [{p.programCode}] {p.programName}
                    </option>
                  ))}
                </select>
              </FormField>

              {/* Searchable subject picker */}
              <FormField
                label="Subject"
                required
                error={fieldErrors.subjectId}
                hint={
                  subjectsInCurrentProgram.size > 0
                    ? `${subjectsInCurrentProgram.size} subject${
                        subjectsInCurrentProgram.size === 1 ? '' : 's'
                      } already in this slot are hidden.`
                    : undefined
                }
              >
                <div className="relative" ref={subjectDropdownRef}>
                  <div className="relative">
                    <Icon
                      name="search"
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      type="text"
                      value={subjectSearch}
                      onChange={(e) => {
                        setSubjectSearch(e.target.value);
                        setSubjectDropdownOpen(true);
                        if (e.target.value === '') {
                          setForm((p) => ({ ...p, subjectId: '' }));
                        }
                      }}
                      onFocus={() => setSubjectDropdownOpen(true)}
                      placeholder="Search by code or title…"
                      className={`${inputClass(!!fieldErrors.subjectId)} pl-9 pr-9`}
                    />
                    {subjectSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setSubjectSearch('');
                          setForm((p) => ({ ...p, subjectId: '' }));
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                        aria-label="Clear"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </div>

                  {subjectDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {filteredSubjects.length === 0 ? (
                        <div className="px-3 py-4 text-xs text-slate-500 text-center">
                          {subjects.length === 0
                            ? 'No subjects available.'
                            : 'No subjects match your search.'}
                        </div>
                      ) : (
                        filteredSubjects.slice(0, 60).map((s) => {
                          const lec = Number(s.lectureUnits ?? 0);
                          const lab = Number(s.labUnits ?? 0);
                          return (
                            <button
                              key={s.subjectId}
                              type="button"
                              onClick={() => {
                                setForm((p) => ({
                                  ...p,
                                  subjectId: String(s.subjectId),
                                }));
                                setSubjectSearch(
                                  `[${s.subjectCode}] ${s.title}`,
                                );
                                setSubjectDropdownOpen(false);
                                setFieldErrors((fe) => ({
                                  ...fe,
                                  subjectId: undefined,
                                }));
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-primary/5 transition border-b border-slate-100 last:border-0"
                            >
                              <div className="flex items-center gap-2">
                                {s.isMinor && (
                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 shrink-0">
                                    <Icon name="school" size={8} />
                                    Minor
                                  </span>
                                )}
                                <span className="font-mono text-xs font-bold text-primary shrink-0">
                                  {s.subjectCode}
                                </span>
                                <span className="text-sm text-slate-800 truncate">
                                  {s.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 mt-1">
                                {lec > 0 && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-100 text-blue-800">
                                    {lec}L
                                  </span>
                                )}
                                {lab > 0 && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-100 text-amber-800">
                                    {lab}Lab
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 ml-auto">
                                  {Number(s.totalUnits)} units
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </FormField>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Year Level" required error={fieldErrors.yearLevel}>
                  <select
                    value={form.yearLevel}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        yearLevel: Number(e.target.value),
                      }))
                    }
                    className={inputClass(!!fieldErrors.yearLevel)}
                  >
                    {YEAR_LEVELS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                        {ordinalSuffix(y)} Year
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Semester" required error={fieldErrors.semester}>
                  <select
                    value={form.semester}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        semester: e.target.value as SemesterType,
                      }))
                    }
                    className={inputClass(!!fieldErrors.semester)}
                  >
                    {SEMESTERS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              {isMinor && (
                <div className="rounded-lg p-3 text-xs flex items-start gap-2 bg-purple-50 text-purple-900 border border-purple-200">
                  <Icon name="info" size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Minor subject</p>
                    <p className="mt-0.5">
                      This subject is taught by another department. It will be
                      plotted manually before running auto-generate.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </FormSection>

          {/* ══════════════════════════════════════════ */}
          {/* Meeting Pattern                            */}
          {/* ══════════════════════════════════════════ */}
          {selectedSubject && (hasLecture || hasLab) && (
            <FormSection title="Meeting Pattern" icon="schedule">
              <p className="text-xs text-slate-500 -mt-1 mb-3">
                How many times per week does this subject meet, and for how
                long?
              </p>

              {/* Lecture */}
              {hasLecture && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5">
                      <Icon
                        name="meeting_room"
                        size={14}
                        className="text-blue-700"
                      />
                      <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                        Lecture
                      </span>
                      <span className="text-[10px] text-blue-700 bg-white px-1.5 py-0.5 rounded border border-blue-200 font-mono">
                        {Number(selectedSubject.lectureUnits)} units
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {LECTURE_PRESETS.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => applyLecturePreset(preset)}
                          title={preset.hint}
                          className="px-2 py-1 text-[10px] font-semibold text-blue-700 bg-white border border-blue-200 rounded hover:border-blue-400 hover:bg-blue-100 transition"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <FormField
                      label="Sessions / week"
                      error={fieldErrors.lectureSessionsPerWeek}
                      hint="1 to 5 (typically 2 or 3)"
                    >
                      <input
                        type="number"
                        min={1}
                        max={5}
                        step={1}
                        value={form.lectureSessionsPerWeek}
                        onChange={(e) => {
                          setForm((p) => ({
                            ...p,
                            lectureSessionsPerWeek:
                              Number(e.target.value) || 1,
                          }));
                          setFieldErrors((fe) => ({
                            ...fe,
                            lectureSessionsPerWeek: undefined,
                          }));
                        }}
                        className={inputClass(
                          !!fieldErrors.lectureSessionsPerWeek,
                        )}
                      />
                    </FormField>
                    <FormField
                      label="Minutes / session"
                      error={fieldErrors.lectureMinutesPerSession}
                      hint="30 to 240 (typically 90)"
                    >
                      <input
                        type="number"
                        min={30}
                        max={240}
                        step={15}
                        value={form.lectureMinutesPerSession}
                        onChange={(e) => {
                          setForm((p) => ({
                            ...p,
                            lectureMinutesPerSession:
                              Number(e.target.value) || 90,
                          }));
                          setFieldErrors((fe) => ({
                            ...fe,
                            lectureMinutesPerSession: undefined,
                          }));
                        }}
                        className={inputClass(
                          !!fieldErrors.lectureMinutesPerSession,
                        )}
                      />
                    </FormField>
                  </div>
                  <div className="flex items-center gap-1 mt-2 text-[11px] text-blue-800">
                    <Icon name="info" size={11} />
                    <span>
                      <strong className="font-mono">
                        {lectureHours.toFixed(1)} hours/week
                      </strong>{' '}
                      total lecture time
                    </span>
                  </div>
                </div>
              )}

              {/* Lab */}
              {hasLab && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 mt-3">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5">
                      <Icon name="science" size={14} className="text-amber-700" />
                      <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                        Laboratory
                      </span>
                      <span className="text-[10px] text-amber-700 bg-white px-1.5 py-0.5 rounded border border-amber-200 font-mono">
                        {Number(selectedSubject.labUnits)} units
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {LAB_PRESETS.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() => applyLabPreset(preset)}
                          title={preset.hint}
                          className="px-2 py-1 text-[10px] font-semibold text-amber-700 bg-white border border-amber-200 rounded hover:border-amber-400 hover:bg-amber-100 transition"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <FormField
                      label="Sessions / week"
                      error={fieldErrors.labSessionsPerWeek}
                      hint="1 to 3 (typically 1)"
                    >
                      <input
                        type="number"
                        min={1}
                        max={3}
                        step={1}
                        value={form.labSessionsPerWeek}
                        onChange={(e) => {
                          setForm((p) => ({
                            ...p,
                            labSessionsPerWeek: Number(e.target.value) || 1,
                          }));
                          setFieldErrors((fe) => ({
                            ...fe,
                            labSessionsPerWeek: undefined,
                          }));
                        }}
                        className={inputClass(
                          !!fieldErrors.labSessionsPerWeek,
                        )}
                      />
                    </FormField>
                    <FormField
                      label="Minutes / session"
                      error={fieldErrors.labMinutesPerSession}
                      hint="60 to 300 (typically 180)"
                    >
                      <input
                        type="number"
                        min={60}
                        max={300}
                        step={30}
                        value={form.labMinutesPerSession}
                        onChange={(e) => {
                          setForm((p) => ({
                            ...p,
                            labMinutesPerSession:
                              Number(e.target.value) || 180,
                          }));
                          setFieldErrors((fe) => ({
                            ...fe,
                            labMinutesPerSession: undefined,
                          }));
                        }}
                        className={inputClass(
                          !!fieldErrors.labMinutesPerSession,
                        )}
                      />
                    </FormField>
                  </div>
                  <div className="flex items-center gap-1 mt-2 text-[11px] text-amber-800">
                    <Icon name="info" size={11} />
                    <span>
                      <strong className="font-mono">
                        {labHours.toFixed(1)} hours/week
                      </strong>{' '}
                      total lab time
                    </span>
                  </div>
                </div>
              )}

              {/* Total footprint */}
              {hasLecture && hasLab && (
                <div className="flex items-center gap-2 mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                  <Icon name="summarize" size={14} className="text-primary" />
                  <span>
                    Total weekly contact:{' '}
                    <strong className="font-mono">
                      {totalHours.toFixed(1)} hours
                    </strong>
                  </span>
                  {totalHours > 6 && (
                    <span className="ml-auto inline-flex items-center gap-1 text-amber-700">
                      <Icon name="warning" size={11} />
                      Unusually high load
                    </span>
                  )}
                </div>
              )}
            </FormSection>
          )}

          {/* No units warning */}
          {selectedSubject && !hasLecture && !hasLab && (
            <div className="rounded-lg p-3 text-xs flex items-start gap-2 bg-amber-50 text-amber-900 border border-amber-200">
              <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">No units defined</p>
                <p className="mt-0.5">
                  This subject has 0 lecture and 0 lab units. Add units on the{' '}
                  <strong>Subjects</strong> page before mapping it here.
                </p>
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* Unsaved changes */}
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Discard changes?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmClose(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmClose(false);
                onClose();
              }}
              className="px-4 py-2 text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition rounded-lg"
            >
              Discard
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          You have unsaved changes. If you close now, they'll be lost.
        </p>
      </Modal>
    </>
  );
}

// ────────────────────────────────────────────
// Presentational helpers
// ────────────────────────────────────────────

function FormSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon name={icon} size={16} className="text-primary" />
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          {title}
        </h3>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      {children}
    </div>
  );
}

function FormField({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[10px] text-rose-600 mt-1 flex items-center gap-1">
          <Icon name="error" size={10} />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[10px] text-slate-400 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return `w-full bg-slate-50 border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10'
      : 'border-slate-200 focus:border-primary focus:ring-primary/10'
  }`;
}