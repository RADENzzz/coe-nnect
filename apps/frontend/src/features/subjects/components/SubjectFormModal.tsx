import { useEffect, useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import type { Department } from '../../../api/departments.api';
import {
  createSubject,
  updateSubject,
  type SubjectRecord,
  type CreateSubjectInput,
  type SubjectRoomType,
  type UnitsMode,
} from '../../../api/subjects.api';

const ROOM_TYPES: Array<{
  value: '' | SubjectRoomType;
  label: string;
  icon: string;
}> = [
  { value: '', label: '— none —', icon: 'block' },
  { value: 'any', label: 'Any (mixed lec + lab)', icon: 'swap_horiz' },
  { value: 'lecture_room', label: 'Lecture Room', icon: 'meeting_room' },
  { value: 'laboratory', label: 'Laboratory', icon: 'science' },
  { value: 'computer_lab', label: 'Computer Lab', icon: 'computer' },
  { value: 'drafting_room', label: 'Drafting Room', icon: 'draw' },
  { value: 'other', label: 'Other', icon: 'category' },
];

/**
 * Rooms the user picks explicitly. The unit split must not overwrite these,
 * otherwise a computer-lab or drafting-room subject would silently revert
 * to a basic room whenever its units are edited.
 */
const SPECIALIZED_ROOM_TYPES: SubjectRoomType[] = [
  'computer_lab',
  'drafting_room',
  'other',
];

/**
 * Derive the basic room type from the unit split:
 * pure lecture → Lecture Room, mixed → Any, pure lab → Laboratory.
 */
function inferRoomType(
  lectureUnits: number,
  labUnits: number,
): '' | SubjectRoomType {
  if (lectureUnits > 0 && labUnits > 0) return 'any';
  if (lectureUnits > 0) return 'lecture_room';
  if (labUnits > 0) return 'laboratory';
  return '';
}

interface StepDef {
  label: string;
  icon: string;
  description: string;
}

const STEP_DEFS: StepDef[] = [
  { label: 'Identity', icon: 'badge', description: 'Code, department & title' },
  { label: 'Units', icon: 'calculate', description: 'Lecture & lab or total units' },
  { label: 'Classification', icon: 'tune', description: 'Room type, minor & elective flags' },
  { label: 'Review', icon: 'fact_check', description: 'Confirm & save' },
];

const LAST_STEP = STEP_DEFS.length - 1;

interface FormState {
  subjectCode: string;
  title: string;
  lectureUnits: string;
  labUnits: string;
  totalOnlyUnits: string;
  unitsMode: UnitsMode;
  requiredRoomType: '' | SubjectRoomType;
  deptId: string;
  isMinor: boolean;
  isElective: boolean;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = {
  subjectCode: '',
  title: '',
  lectureUnits: '',
  labUnits: '',
  totalOnlyUnits: '',
  unitsMode: 'lec_lab',
  requiredRoomType: '',
  deptId: '',
  isMinor: false,
  isElective: false,
};

function extractErrorMessage(err: any, fallback: string): string {
  const raw = err?.response?.data?.message;
  if (Array.isArray(raw)) return raw[0] ?? fallback;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return err?.message ?? fallback;
}

interface Props {
  open: boolean;
  mode: 'create' | 'edit' | null;
  subject: SubjectRecord | null;
  subjects: SubjectRecord[];
  departments: Department[];
  isDH: boolean;
  myDeptId: string | null;
  /** Pre-select the elective flag when creating from the Elective tab. */
  defaultElective?: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export default function SubjectFormModal({
  open,
  mode,
  subject,
  subjects,
  departments,
  isDH,
  myDeptId,
  defaultElective = false,
  onClose,
  onSuccess,
}: Props) {
  const qc = useQueryClient();
  const isWizard = mode === 'create';

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [stepIdx, setStepIdx] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Reset state when the modal opens.
  useEffect(() => {
    if (!open) return;
    if (mode === 'create') {
      setForm({
        ...EMPTY_FORM,
        deptId: isDH && myDeptId ? myDeptId : '',
        isElective: defaultElective,
      });
    } else if (mode === 'edit' && subject) {
      setForm({
        subjectCode: subject.subjectCode,
        title: subject.title,
        lectureUnits: String(subject.lectureUnits ?? 0),
        labUnits: String(subject.labUnits ?? 0),
        totalOnlyUnits:
          subject.unitsMode === 'total_only' ? String(subject.totalUnits ?? 0) : '',
        unitsMode: subject.unitsMode ?? 'lec_lab',
        requiredRoomType: (subject.requiredRoomType ?? '') as
          | ''
          | SubjectRoomType,
        deptId: subject.deptId ?? '',
        isMinor: subject.isMinor ?? false,
        isElective: subject.isElective ?? false,
      });
    }
    setStepIdx(0);
    setFieldErrors({});
    setFormError(null);
    setConfirmClose(false);
    setTimeout(() => firstFieldRef.current?.focus(), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, subject?.subjectId]);

  const setField = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  /**
   * Keep the room type in sync while the user edits units.
   * - mixed lec+lab always becomes "Any"
   * - pure lecture / pure lab becomes Lecture Room / Laboratory
   * - specialised rooms chosen by the user are preserved
   */
  const handleUnitsChange = (
    key: 'lectureUnits' | 'labUnits',
    value: string,
  ) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      const lecture = Number(next.lectureUnits || 0);
      const lab = Number(next.labUnits || 0);
      const inferred = inferRoomType(lecture, lab);
      const current = prev.requiredRoomType;
      const keepSpecialized = (
        SPECIALIZED_ROOM_TYPES as string[]
      ).includes(current);

      return {
        ...next,
        requiredRoomType: keepSpecialized ? current : inferred,
      };
    });
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const lectureUnitsNum = Number(form.lectureUnits || 0);
  const labUnitsNum = Number(form.labUnits || 0);
  const totalOnlyUnitsNum = Number(form.totalOnlyUnits || 0);
  const isTotalOnly = form.unitsMode === 'total_only';
  const totalUnits = isTotalOnly
    ? totalOnlyUnitsNum
    : lectureUnitsNum + labUnitsNum;
  const isMixed = lectureUnitsNum > 0 && labUnitsNum > 0;
  const isLectureOnly = lectureUnitsNum > 0 && labUnitsNum === 0;
  const isLabOnly = labUnitsNum > 0 && lectureUnitsNum === 0;

  // ── Per-step validation ──

  const validateIdentity = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!form.subjectCode.trim()) errs.subjectCode = 'Subject code is required';
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!form.deptId) errs.deptId = 'Department is required';
    const code = form.subjectCode.trim().toLowerCase();
    const dup = subjects.find(
      (s) =>
        s.subjectId !== subject?.subjectId &&
        String(s.deptId) === form.deptId &&
        (s.subjectCode ?? '').trim().toLowerCase() === code,
    );
    if (dup)
      errs.subjectCode = `"${form.subjectCode}" already exists in this department`;
    return errs;
  };

  const validateUnits = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (isTotalOnly) {
      if (!form.totalOnlyUnits || totalOnlyUnitsNum <= 0) {
        errs.totalOnlyUnits = 'Enter the total units';
      } else if (totalOnlyUnitsNum > 24) {
        errs.totalOnlyUnits = 'Total units cannot exceed 24';
      }
      return errs;
    }
    if (!form.lectureUnits && !form.labUnits) {
      errs.lectureUnits = 'Enter at least one unit';
    }
    if (lectureUnitsNum < 0 || labUnitsNum < 0) {
      errs.labUnits = 'Units cannot be negative';
    }
    if (lectureUnitsNum > 12 || labUnitsNum > 12) {
      errs.labUnits = 'Units cannot exceed 12 per component';
    }
    return errs;
  };

  const validateStep = (idx: number): boolean => {
    const errs =
      idx === 0 ? validateIdentity() : idx === 1 ? validateUnits() : {};
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (validateStep(stepIdx)) setStepIdx((i) => Math.min(i + 1, LAST_STEP));
  };
  const goBack = () => setStepIdx((i) => Math.max(i - 1, 0));

  // ── Mutations ──

  const invalidateAfterSubjectChange = () => {
    qc.invalidateQueries({ queryKey: ['subjects'] });
    qc.invalidateQueries({ queryKey: ['coverage'] });
    qc.invalidateQueries({ queryKey: ['unplotted-minors'] });
  };

  const createMutation = useMutation({
    mutationFn: createSubject,
    onSuccess: (s) => {
      invalidateAfterSubjectChange();
      onSuccess(`Subject "${s.subjectCode}" created.`);
      onClose();
    },
    onError: (err: any) =>
      setFormError(extractErrorMessage(err, 'Failed to create')),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<CreateSubjectInput>;
    }) => updateSubject(id, input),
    onSuccess: (s) => {
      invalidateAfterSubjectChange();
      onSuccess(`Subject "${s.subjectCode}" updated.`);
      onClose();
    },
    onError: (err: any) =>
      setFormError(extractErrorMessage(err, 'Failed to update')),
  });

  const busy = createMutation.isPending || updateMutation.isPending;

  // ── Submit ──

  const handleSubmit = () => {
    setFormError(null);

    const idErrs = validateIdentity();
    const unitErrs = validateUnits();
    const allErrs = { ...idErrs, ...unitErrs };

    if (Object.keys(allErrs).length > 0) {
      setFieldErrors(allErrs);
      if (Object.keys(idErrs).length > 0) setStepIdx(0);
      else setStepIdx(1);
      return;
    }

    const lecture = isTotalOnly ? 0 : lectureUnitsNum;
    const lab = isTotalOnly ? 0 : labUnitsNum;
    const total = isTotalOnly ? totalOnlyUnitsNum : lecture + lab;

    const inferredRoomType = inferRoomType(lecture, lab);
    const hasSpecializedRoom = (
      SPECIALIZED_ROOM_TYPES as string[]
    ).includes(form.requiredRoomType);
    let requiredRoomType: SubjectRoomType | null;
    if (hasSpecializedRoom) {
      requiredRoomType = form.requiredRoomType as SubjectRoomType;
    } else if (lecture > 0 && lab > 0) {
      requiredRoomType = 'any';
    } else {
      requiredRoomType =
        form.requiredRoomType === ''
          ? inferredRoomType === ''
            ? null
            : inferredRoomType
          : form.requiredRoomType;
    }

    const payload: CreateSubjectInput = {
      subjectCode: form.subjectCode.trim(),
      title: form.title.trim(),
      totalUnits: total,
      lectureUnits: lecture,
      labUnits: lab,
      requiredRoomType,
      isMinor: form.isMinor,
      isElective: form.isElective,
      unitsMode: form.unitsMode,
      deptId: form.deptId,
    };

    if (mode === 'create') createMutation.mutate(payload);
    else if (mode === 'edit' && subject)
      updateMutation.mutate({ id: subject.subjectId, input: payload });
  };

  // ── Dirty check ──

  const isDirty = (): boolean => {
    if (mode === 'create') {
      const initialDept = isDH && myDeptId ? myDeptId : '';
      return (
        !!form.subjectCode.trim() ||
        !!form.title.trim() ||
        !!form.lectureUnits ||
        !!form.labUnits ||
        !!form.totalOnlyUnits ||
        form.unitsMode !== 'lec_lab' ||
        form.isMinor ||
        form.isElective !== defaultElective ||
        form.requiredRoomType !== '' ||
        form.deptId !== initialDept ||
        stepIdx > 0
      );
    }
    if (mode === 'edit' && subject) {
      return (
        form.subjectCode !== subject.subjectCode ||
        form.title !== subject.title ||
        form.lectureUnits !== String(subject.lectureUnits ?? 0) ||
        form.labUnits !== String(subject.labUnits ?? 0) ||
        form.totalOnlyUnits !==
          (subject.unitsMode === 'total_only'
            ? String(subject.totalUnits ?? 0)
            : '') ||
        form.unitsMode !== (subject.unitsMode ?? 'lec_lab') ||
        form.requiredRoomType !==
          ((subject.requiredRoomType ?? '') as '' | SubjectRoomType) ||
        form.deptId !== (subject.deptId ?? '') ||
        form.isMinor !== (subject.isMinor ?? false) ||
        form.isElective !== (subject.isElective ?? false)
      );
    }
    return false;
  };

  const handleAttemptClose = () => {
    if (isDirty()) setConfirmClose(true);
    else onClose();
  };

  // ── Step renderers ──

  const renderIdentity = () => (
    <FormSection title="Identification" icon="badge">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          label="Subject Code"
          required
          error={fieldErrors.subjectCode}
        >
          <input
            ref={firstFieldRef}
            type="text"
            value={form.subjectCode}
            onChange={(e) => setField('subjectCode', e.target.value)}
            placeholder="e.g. CPE 101"
            className={inputClass(!!fieldErrors.subjectCode)}
          />
        </FormField>
        <FormField
          label="Department"
          required
          error={fieldErrors.deptId}
          hint={isDH ? 'Locked to your department.' : undefined}
        >
          <select
            value={form.deptId}
            onChange={(e) => setField('deptId', e.target.value)}
            disabled={isDH}
            className={`${inputClass(!!fieldErrors.deptId)} disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            <option value="">Select a department…</option>
            {departments
              .filter((d) => d.isActive)
              .filter((d) => !isDH || String(d.deptId) === myDeptId)
              .map((d) => (
                <option key={d.deptId} value={d.deptId}>
                  [{d.deptCode}] {d.deptName}
                </option>
              ))}
          </select>
        </FormField>
        <div className="md:col-span-2">
          <FormField label="Title" required error={fieldErrors.title}>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder="e.g. Programming Logic & Design"
              className={inputClass(!!fieldErrors.title)}
            />
          </FormField>
        </div>
      </div>
    </FormSection>
  );

  const renderUnits = () => (
    <FormSection title="Units" icon="calculate">
      {/* Unit mode — total-only is an elective-only convenience. */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(
          [
            {
              key: 'lec_lab' as const,
              label: 'Lecture + Lab',
              icon: 'calculate',
              hint: 'Total is the sum of the lecture and lab units.',
            },
            {
              key: 'total_only' as const,
              label: 'Total units only',
              icon: 'functions',
              hint: 'The source lists only a total; lecture and lab stay at zero.',
            },
          ]
        ).map((m) => {
          const active = form.unitsMode === m.key;
          const disabled = m.key === 'total_only' && !form.isElective;
          return (
            <button
              key={m.key}
              type="button"
              disabled={disabled}
              onClick={() => {
                setField('unitsMode', m.key);
                setFieldErrors((prev) => ({
                  ...prev,
                  lectureUnits: undefined,
                  labUnits: undefined,
                  totalOnlyUnits: undefined,
                }));
              }}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                active
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-surface-variant text-on-surface-variant hover:bg-surface-container'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={disabled ? 'Enable Elective on the next step first.' : m.hint}
            >
              <Icon name={m.icon} size={16} className="mt-0.5 shrink-0" />
              <span>
                <span className="block text-xs font-semibold">{m.label}</span>
                <span className="block text-[10px] opacity-80">{m.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {isTotalOnly ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Total Units"
            required
            error={fieldErrors.totalOnlyUnits}
            hint="Used when the prospectus lists only a total for this elective."
          >
            <input
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={form.totalOnlyUnits}
              onChange={(e) => setField('totalOnlyUnits', e.target.value)}
              placeholder="0"
              className={inputClass(!!fieldErrors.totalOnlyUnits)}
            />
          </FormField>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Lecture Units"
            required
            error={fieldErrors.lectureUnits}
          >
            <input
              type="number"
              step="0.5"
              min="0"
              max="12"
              value={form.lectureUnits}
              onChange={(e) => handleUnitsChange('lectureUnits', e.target.value)}
              placeholder="0"
              className={inputClass(!!fieldErrors.lectureUnits)}
            />
          </FormField>
          <FormField
            label="Lab Units"
            required
            error={fieldErrors.labUnits}
          >
            <input
              type="number"
              step="0.5"
              min="0"
              max="12"
              value={form.labUnits}
              onChange={(e) => handleUnitsChange('labUnits', e.target.value)}
              placeholder="0"
              className={inputClass(!!fieldErrors.labUnits)}
            />
          </FormField>
        </div>
      )}

      {totalUnits > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
          <span className="font-semibold text-slate-600">Breakdown:</span>
          {isTotalOnly ? (
            <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-mono font-semibold">
              {totalUnits} Total (no lec/lab split)
            </span>
          ) : (
            <>
              {lectureUnitsNum > 0 && (
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono font-semibold">
                  {lectureUnitsNum} Lecture
                </span>
              )}
              {labUnitsNum > 0 && (
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-mono font-semibold">
                  {labUnitsNum} Lab
                </span>
              )}
              <span className="text-slate-400">=</span>
              <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-mono font-bold">
                {totalUnits} Total
              </span>
            </>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-slate-500">
            <Icon name="meeting_room" size={12} />
            Room:
            <strong className="text-slate-700">
              {ROOM_TYPES.find((r) => r.value === form.requiredRoomType)
                ?.label ?? '—'}
            </strong>
          </span>
        </div>
      )}

      {!form.isElective && form.unitsMode === 'lec_lab' && (
        <div className="rounded-lg p-3 text-xs flex items-start gap-2 bg-slate-50 text-slate-600 border border-slate-200 mt-3">
          <Icon name="info" size={14} className="shrink-0 mt-0.5" />
          <span>
            Total-only units are available for <strong>elective subjects</strong>.
            Turn on the elective flag on the next step to use them.
          </span>
        </div>
      )}

      {isMixed && (
        <div className="rounded-lg p-3 text-xs flex items-start gap-2 bg-blue-50 text-blue-900 border border-blue-200 mt-3">
          <Icon name="info" size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Mixed subject detected</p>
            <p className="mt-0.5">
              Room type is set to <strong>Any</strong> automatically — lecture
              blocks go in lecture rooms, lab blocks go in labs. Choose a
              specialised room on the next step if this subject needs one.
            </p>
          </div>
        </div>
      )}
    </FormSection>
  );

  const renderClassification = () => {
    // For mixed subjects only "Any" (or a specialised room) makes sense —
    // a plain lecture room or lab would break one of the block kinds.
    const roomTypeOptions = isMixed
      ? ROOM_TYPES.filter(
          (rt) =>
            rt.value === '' ||
            rt.value === 'any' ||
            (SPECIALIZED_ROOM_TYPES as string[]).includes(rt.value),
        )
      : ROOM_TYPES;

    return (
      <FormSection title="Room & Classification" icon="tune">
        <FormField
          label="Required Room Type"
          hint={
            isMixed
              ? 'Auto-set to "Any" because this subject has both lecture and lab units. You can still choose a specialised room if needed.'
              : isLectureOnly
              ? 'Auto-set to Lecture Room because there are no lab units.'
              : isLabOnly
              ? 'Auto-set to Laboratory because there are no lecture units.'
              : 'Leave as "— none —" if the subject can be scheduled anywhere.'
          }
        >
          <select
            value={form.requiredRoomType}
            onChange={(e) =>
              setField(
                'requiredRoomType',
                e.target.value as '' | SubjectRoomType,
              )
            }
            className={inputClass(false)}
          >
            {roomTypeOptions.map((rt) => (
              <option key={rt.value} value={rt.value}>
                {rt.label}
              </option>
            ))}
          </select>
        </FormField>

      <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-surface-variant bg-surface-container-low p-3 hover:bg-surface-container transition mt-4">
        <input
          type="checkbox"
          checked={form.isMinor}
          onChange={(e) => setField('isMinor', e.target.checked)}
          className="accent-primary w-4 h-4 mt-0.5"
        />
        <div className="flex-1">
          <span className="text-sm font-semibold text-on-surface flex items-center gap-1.5">
            <Icon name="school" size={14} className="text-purple-600" />
            Minor subject
          </span>
          <p className="text-[11px] text-on-surface-variant mt-0.5">
            Taught by another department or college. Minor subjects are
            plotted manually <strong>before</strong> running auto-generate.
            Examples: Math, GenEd, PE, EPIC, NSTP.
          </p>
        </div>
      </label>

      {form.isMinor && (
        <div className="rounded-lg p-3 text-xs flex items-start gap-2 bg-purple-50 text-purple-900 border border-purple-200 mt-3">
          <Icon name="info" size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Minor subject</p>
            <p className="mt-0.5">
              Will show a purple "Minor" badge in the table and appear in the
              "unplotted minors" indicator on the Timetable page.
            </p>
          </div>
        </div>
      )}

      <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-surface-variant bg-surface-container-low p-3 hover:bg-surface-container transition mt-4">
        <input
          type="checkbox"
          checked={form.isElective}
          onChange={(e) => {
            const checked = e.target.checked;
            setForm((prev) => ({
              ...prev,
              isElective: checked,
              // Total-only mode is elective-only; fall back when it is off.
              unitsMode: checked ? prev.unitsMode : 'lec_lab',
            }));
          }}
          className="accent-primary w-4 h-4 mt-0.5"
        />
        <div className="flex-1">
          <span className="text-sm font-semibold text-on-surface flex items-center gap-1.5">
            <Icon name="stars" size={14} className="text-teal-600" />
            Elective subject
          </span>
          <p className="text-[11px] text-on-surface-variant mt-0.5">
            One of a set of options a student may choose. Electives are plotted
            <strong> first</strong>, may use total-only units, and multiple
            electives can appear in one semester.
          </p>
        </div>
      </label>

      {form.isElective && (
        <div className="rounded-lg p-3 text-xs flex items-start gap-2 bg-teal-50 text-teal-900 border border-teal-200 mt-3">
          <Icon name="info" size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Elective subject</p>
            <p className="mt-0.5">
              Will show a teal "Elective" badge and appear in the Elective tab.
              Imported electives without a code get a temporary flagged code
              that must be resolved before plotting.
            </p>
          </div>
        </div>
      )}
      </FormSection>
    );
  };

  const renderReview = () => {
    const dept = departments.find((d) => String(d.deptId) === form.deptId);
    const roomTypeMeta = form.requiredRoomType
      ? ROOM_TYPES.find((r) => r.value === form.requiredRoomType)
      : null;

    return (
      <div className="space-y-3">
        <p className="text-xs text-on-surface-variant">
          Review the details below, then save.
        </p>

        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-14 h-14 rounded-lg bg-primary/10 text-primary font-mono text-[10px] font-bold flex items-center justify-center shrink-0 text-center leading-tight px-1 break-all">
              {form.subjectCode || 'CODE'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-on-surface truncate">
                {form.title || 'Untitled subject'}
              </p>
              <p className="text-xs text-on-surface-variant truncate">
                {dept ? `[${dept.deptCode}] ${dept.deptName}` : '—'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <p className="text-on-surface-variant">Total units</p>
              <p className="font-semibold text-on-surface font-mono">
                {totalUnits}
              </p>
            </div>
            <div>
              <p className="text-on-surface-variant">Classification</p>
              <p className="font-semibold text-on-surface">
                {form.isElective
                  ? 'Elective'
                  : form.isMinor
                  ? 'Minor (cross-dept)'
                  : 'Regular'}
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-surface-variant space-y-1 text-xs">
            {isTotalOnly ? (
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-purple-500/15 text-purple-600">
                  Total only
                </span>
                <span className="text-on-surface">
                  {totalUnits} unit{totalUnits === 1 ? '' : 's'} (no lec/lab
                  split)
                </span>
              </div>
            ) : (
              <>
                {lectureUnitsNum > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/15 text-blue-600">
                      Lecture
                    </span>
                    <span className="text-on-surface">
                      {lectureUnitsNum} unit
                      {lectureUnitsNum === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
                {labUnitsNum > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-600">
                      Lab
                    </span>
                    <span className="text-on-surface">
                      {labUnitsNum} unit{labUnitsNum === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-surface-container-high text-on-surface-variant">
                Room
              </span>
              <span className="text-on-surface">
                {roomTypeMeta ? roomTypeMeta.label : 'Not specified'}
                {isMixed && (
                  <span className="ml-1 text-[10px] text-slate-500 italic">
                    (auto)
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStep = (idx: number) => {
    switch (idx) {
      case 0:
        return renderIdentity();
      case 1:
        return renderUnits();
      case 2:
        return renderClassification();
      case 3:
        return renderReview();
      default:
        return null;
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={handleAttemptClose}
        title={
          mode === 'create'
            ? 'Create Subject'
            : `Edit Subject — ${subject?.subjectCode ?? ''}`
        }
        description={
          mode === 'create'
            ? 'Follow the steps to add a new subject.'
            : "Update this subject's details."
        }
        size="lg"
      >
        <div className="space-y-4">
          {isWizard && (
            <StepIndicator currentIdx={stepIdx} steps={STEP_DEFS} />
          )}

          {(!isWizard || stepIdx < LAST_STEP) &&
            (form.subjectCode || form.title) && (
              <LivePreview
                form={form}
                departments={departments}
                totalUnits={totalUnits}
                isMixed={isMixed}
              />
            )}

          {formError && (
            <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm flex items-start gap-2">
              <Icon name="error" size={16} className="shrink-0 mt-0.5" />
              <span className="flex-1">{formError}</span>
              <button
                type="button"
                onClick={() => setFormError(null)}
                className="text-red-600 hover:text-red-800"
                aria-label="Dismiss"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )}

          {isWizard ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (stepIdx === LAST_STEP) handleSubmit();
              }}
            >
              {renderStep(stepIdx)}
            </form>
          ) : (
            <div className="space-y-5">
              {renderIdentity()}
              {renderUnits()}
              {renderClassification()}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 justify-between pt-4 border-t border-surface-variant">
            <div>
              {isWizard && stepIdx > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  disabled={busy}
                  className="px-3 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Icon name="arrow_back" size={14} />
                  Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAttemptClose}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition disabled:opacity-50"
              >
                Cancel
              </button>
              {isWizard ? (
                stepIdx < LAST_STEP ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="px-5 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition flex items-center gap-1.5"
                  >
                    Next
                    <Icon name="arrow_forward" size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={busy}
                    className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {busy && (
                      <Icon
                        name="progress_activity"
                        size={14}
                        className="animate-spin"
                      />
                    )}
                    {busy ? 'Creating…' : 'Create Subject'}
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={busy}
                  className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {busy && (
                    <Icon
                      name="progress_activity"
                      size={14}
                      className="animate-spin"
                    />
                  )}
                  {busy ? 'Saving…' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Discard confirmation */}
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

function LivePreview({
  form,
  departments,
  totalUnits,
  isMixed,
}: {
  form: FormState;
  departments: Department[];
  totalUnits: number;
  isMixed: boolean;
}) {
  const dept = departments.find((d) => String(d.deptId) === form.deptId);
  const roomMeta = form.requiredRoomType
    ? ROOM_TYPES.find((r) => r.value === form.requiredRoomType)
    : null;

  return (
    <div className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.04] via-primary/[0.02] to-transparent p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon name="preview" size={14} className="text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Live preview
          </span>
        </div>
        {form.subjectCode && form.title && (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-500/30">
            <Icon name="check_circle" size={9} />
            Ready
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="w-12 h-12 rounded-lg bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 border border-primary/25 font-mono text-center leading-tight px-1 break-all">
          {form.subjectCode || 'CODE'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-on-surface truncate leading-tight">
            {form.title || (
              <span className="italic font-normal text-on-surface-variant/50">
                New subject
              </span>
            )}
          </p>
          <p className="text-xs text-on-surface-variant truncate mt-0.5">
            {dept ? `[${dept.deptCode}] ${dept.deptName}` : '—'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-primary/10">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold text-on-surface border border-surface-variant">
          <Icon name="functions" size={10} className="opacity-70" />
          {totalUnits} unit{totalUnits === 1 ? '' : 's'}
        </span>
        {isMixed && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-[10px] font-semibold text-blue-700 border border-blue-500/20">
            <Icon name="merge_type" size={10} />
            Mixed
          </span>
        )}
        {form.isMinor && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-[10px] font-semibold text-purple-700 border border-purple-500/20">
            <Icon name="school" size={10} />
            Minor
          </span>
        )}
        {form.isElective && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/10 text-[10px] font-semibold text-teal-700 border border-teal-500/20">
            <Icon name="stars" size={10} />
            Elective
          </span>
        )}
        {form.unitsMode === 'total_only' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-500/10 text-[10px] font-semibold text-slate-700 border border-slate-500/20">
            <Icon name="functions" size={10} />
            Total only
          </span>
        )}
        {roomMeta && roomMeta.value && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold text-on-surface border border-surface-variant">
            <Icon name={roomMeta.icon} size={10} className="opacity-70" />
            {roomMeta.label}
          </span>
        )}
      </div>
    </div>
  );
}

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

function StepIndicator({
  currentIdx,
  steps,
}: {
  currentIdx: number;
  steps: StepDef[];
}) {
  const current = steps[currentIdx];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
          Step {currentIdx + 1} of {steps.length} · {current.label}
        </span>
        <span className="text-[10px] text-slate-400 truncate">
          {current.description}
        </span>
      </div>
      <div className="flex gap-1">
        {steps.map((s, i) => (
          <div
            key={s.label}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i <= currentIdx ? 'bg-primary' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return `w-full bg-surface-container-low border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10'
      : 'border-surface-variant focus:border-primary focus:ring-primary/10'
  }`;
}