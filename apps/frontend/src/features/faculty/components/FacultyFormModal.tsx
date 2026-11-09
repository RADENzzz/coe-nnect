import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import type { Department } from '../../../api/departments.api';
import {
  createFaculty,
  updateFaculty,
  type FacultyRecord,
  type CreateFacultyInput,
} from '../../../api/faculty.api';
import {
  EMPTY_FORM, STEP_DEFS, StepIndicator, computeRequiredHours,
  type FormState, type FieldErrors,
} from './FacultyFormFields';
import {
  IdentityStep, EmploymentStep, AssignmentStep, ReviewStep,
  LivePreview, type DesignationItem,
} from './FacultyFormSteps';

interface Props {
  mode: 'create' | 'edit' | null;
  faculty: FacultyRecord | null;
  facultyList: FacultyRecord[];
  departments: Department[];
  designations: DesignationItem[];
  isDH: boolean;
  myDeptId: string | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const LAST_STEP = STEP_DEFS.length - 1;
const FACULTY_LIST_KEY = ['faculty', { includeInactive: true }] as const;

function extractMessage(err: unknown): string {
  const e = err as any;
  return e?.response?.data?.message ?? e?.message ?? 'Something went wrong';
}

export default function FacultyFormModal({
  mode, faculty, facultyList, departments, designations,
  isDH, myDeptId, onClose, onSuccess, onError,
}: Props) {
  const qc = useQueryClient();
  const open = mode !== null;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [stepIdx, setStepIdx] = useState(0);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === 'create') {
      setForm({ ...EMPTY_FORM, deptId: isDH && myDeptId ? myDeptId : '' });
    } else if (mode === 'edit' && faculty) {
      const d = faculty.designationId
        ? designations.find(
            (x) => String(x.designationId) === String(faculty.designationId),
          )
        : null;

      setForm({
        firstName: faculty.firstName,
        lastName: faculty.lastName,
        email: faculty.email ?? '',
        contact: faculty.contact ?? '',
        wmsuId: faculty.wmsuId ?? '',
        employeeId: faculty.employeeId ?? '',
        deptId: faculty.deptId ?? '',
        designationId: faculty.designationId ?? '',
        classification: faculty.classification,
        requiredHours: d
          ? String(computeRequiredHours(d.releaseHours))
          : faculty.requiredHours != null
            ? String(faculty.requiredHours)
            : '',
      });
    }
    setStepIdx(0);
    setFieldErrors({});
    setConfirmClose(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, faculty?.facultyId]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // client-side duplicate detection (still runs before submit)
  const liveDuplicate = useMemo(() => {
    const others = facultyList.filter(
      (f) => f.facultyId !== (mode === 'edit' ? faculty?.facultyId : undefined),
    );
    const out: FieldErrors = {};
    const email = form.email.trim().toLowerCase();
    if (email && others.some((f) => f.email?.toLowerCase() === email))
      out.email = 'This email is already in use.';
    const wmsu = form.wmsuId.trim().toLowerCase();
    if (wmsu && others.some((f) => f.wmsuId?.toLowerCase() === wmsu))
      out.wmsuId = 'This WMSU ID is already in use.';
    const emp = form.employeeId.trim().toLowerCase();
    if (emp && others.some((f) => f.employeeId?.toLowerCase() === emp))
      out.employeeId = 'This Employee ID is already in use.';
    return out;
  }, [form.email, form.wmsuId, form.employeeId, facultyList, mode, faculty?.facultyId]);

  const validateStep = (idx: number): boolean => {
    const errs: FieldErrors = {};
    if (idx === 0) {
      if (!form.firstName.trim()) errs.firstName = 'First name is required';
      if (!form.lastName.trim()) errs.lastName = 'Last name is required';
      if (form.email.trim()) {
        const email = form.email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          errs.email = 'Enter a valid email address';
        else if (liveDuplicate.email) errs.email = liveDuplicate.email;
      }
    } else if (idx === 1) {
      if (form.requiredHours) {
        const n = Number(form.requiredHours);
        if (isNaN(n) || n < 0 || n > 60)
          errs.requiredHours = 'Hours must be between 0 and 60';
      }
      if (liveDuplicate.wmsuId) errs.wmsuId = liveDuplicate.wmsuId;
      if (liveDuplicate.employeeId) errs.employeeId = liveDuplicate.employeeId;
    }
    setFieldErrors((prev) => ({ ...prev, ...errs }));
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (validateStep(stepIdx)) setStepIdx((i) => Math.min(i + 1, LAST_STEP));
  };
  const goBack = () => setStepIdx((i) => Math.max(i - 1, 0));

  // ── Optimistic CREATE ──
  const createMutation = useMutation({
    mutationFn: createFaculty,
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: FACULTY_LIST_KEY });
      const previous = qc.getQueryData<FacultyRecord[]>(FACULTY_LIST_KEY);
      const tempId = `temp-${Date.now()}`;
      const optimistic = {
        facultyId: tempId,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email ?? null,
        contact: payload.contact ?? null,
        wmsuId: payload.wmsuId ?? null,
        employeeId: payload.employeeId ?? null,
        deptId: payload.deptId ?? null,
        designationId: payload.designationId ?? null,
        classification: payload.classification ?? 'regular',
        requiredHours: payload.requiredHours ?? null,
        isActive: true,
      } as unknown as FacultyRecord;
      qc.setQueryData<FacultyRecord[]>(FACULTY_LIST_KEY, (old) => [...(old ?? []), optimistic]);
      return { previous, tempId };
    },
    onSuccess: (f, _v, ctx) => {
      qc.setQueryData<FacultyRecord[]>(FACULTY_LIST_KEY, (old) =>
        (old ?? []).map((x) => (x.facultyId === ctx?.tempId ? f : x)),
      );
      qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
    },
    onError: (err, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(FACULTY_LIST_KEY, ctx.previous);
      onError(extractMessage(err));
    },
  });

  // ── Optimistic UPDATE ──
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateFacultyInput> }) =>
      updateFaculty(id, input),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: FACULTY_LIST_KEY });
      const previous = qc.getQueryData<FacultyRecord[]>(FACULTY_LIST_KEY);
      qc.setQueryData<FacultyRecord[]>(FACULTY_LIST_KEY, (old) =>
        (old ?? []).map((f) => (f.facultyId === id ? { ...f, ...input } : f)),
      );
      return { previous };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
    },
    onError: (err, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(FACULTY_LIST_KEY, ctx.previous);
      onError(extractMessage(err));
    },
  });

  const handleSubmit = () => {
    const errs: FieldErrors = {};
    if (!form.firstName.trim()) errs.firstName = 'First name is required';
    if (!form.lastName.trim()) errs.lastName = 'Last name is required';
    if (form.email.trim()) {
      const email = form.email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        errs.email = 'Enter a valid email address';
      else if (liveDuplicate.email) errs.email = liveDuplicate.email;
    }
    if (form.requiredHours) {
      const n = Number(form.requiredHours);
      if (isNaN(n) || n < 0 || n > 60)
        errs.requiredHours = 'Hours must be between 0 and 60';
    }
    if (liveDuplicate.wmsuId) errs.wmsuId = liveDuplicate.wmsuId;
    if (liveDuplicate.employeeId) errs.employeeId = liveDuplicate.employeeId;

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setStepIdx(errs.firstName || errs.lastName || errs.email ? 0 : 1);
      return;
    }

    const payload: CreateFacultyInput = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim() || undefined,
      contact: form.contact.trim() || undefined,
      wmsuId: form.wmsuId.trim() || undefined,
      employeeId: form.employeeId.trim() || undefined,
      deptId: form.deptId || undefined,
      designationId: form.designationId || undefined,
      classification: form.classification,
      requiredHours: form.requiredHours ? Number(form.requiredHours) : undefined,
    };

    // ✨ Fire-and-close: no spinner, no waiting.
    if (mode === 'create') {
      createMutation.mutate(payload);
      onSuccess(`Faculty "${payload.lastName}, ${payload.firstName}" created.`);
    } else if (mode === 'edit' && faculty) {
      updateMutation.mutate({ id: faculty.facultyId, input: payload });
      onSuccess(`Faculty "${payload.lastName}, ${payload.firstName}" updated.`);
    }
  };

  // Derived baseline so an auto-computed value doesn't register as dirty.
  const baselineRequiredHours = (() => {
    if (mode !== 'edit' || !faculty) return '';
    const d = faculty.designationId
      ? designations.find(
          (x) => String(x.designationId) === String(faculty.designationId),
        )
      : null;
    if (d) return String(computeRequiredHours(d.releaseHours));
    return faculty.requiredHours != null ? String(faculty.requiredHours) : '';
  })();

  const isDirty = (): boolean => {
    if (mode === 'create') {
      return !!(
        form.firstName || form.lastName || form.email || form.contact ||
        form.wmsuId || form.employeeId || form.requiredHours ||
        form.classification !== 'regular' || stepIdx > 0
      );
    }
    if (mode === 'edit' && faculty) {
      return (
        form.firstName !== faculty.firstName ||
        form.lastName !== faculty.lastName ||
        form.email !== (faculty.email ?? '') ||
        form.contact !== (faculty.contact ?? '') ||
        form.wmsuId !== (faculty.wmsuId ?? '') ||
        form.employeeId !== (faculty.employeeId ?? '') ||
        form.deptId !== (faculty.deptId ?? '') ||
        form.designationId !== (faculty.designationId ?? '') ||
        form.classification !== faculty.classification ||
        form.requiredHours !== baselineRequiredHours
      );
    }
    return false;
  };

  const handleAttemptClose = () => (isDirty() ? setConfirmClose(true) : onClose());
  const handleDiscard = () => { setConfirmClose(false); onClose(); };

  const renderStep = (idx: number) => {
    switch (idx) {
      case 0: return <IdentityStep form={form} setField={setField} fieldErrors={fieldErrors} uniqueErrors={liveDuplicate} />;
      case 1: return <EmploymentStep form={form} setField={setField} fieldErrors={fieldErrors} uniqueErrors={liveDuplicate} />;
      case 2: return <AssignmentStep form={form} setField={setField} fieldErrors={fieldErrors} uniqueErrors={{}} departments={departments} designations={designations} isDH={isDH} />;
      case 3: return <ReviewStep form={form} departments={departments} designations={designations} />;
      default: return null;
    }
  };

  const isCreateWizard = mode === 'create';

  return (
    <>
      <Modal
        open={open}
        onClose={handleAttemptClose}
        title={isCreateWizard ? 'Create Faculty' : `Edit — ${faculty?.lastName ?? ''}, ${faculty?.firstName ?? ''}`}
        description={isCreateWizard ? 'Follow the steps to add a new faculty member.' : "Update this faculty member's details."}
        size="lg"
      >
        <div className="space-y-4">
          {isCreateWizard && <StepIndicator currentIdx={stepIdx} steps={STEP_DEFS} />}
          {(!isCreateWizard || stepIdx < LAST_STEP) && (
            <LivePreview form={form} departments={departments} designations={designations} />
          )}
          {isCreateWizard ? renderStep(stepIdx) : (
            <div className="space-y-5">{renderStep(0)}{renderStep(1)}{renderStep(2)}</div>
          )}
          <div className="flex flex-wrap items-center gap-2 justify-between pt-4 border-t border-surface-variant">
            <div>
              {isCreateWizard && stepIdx > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="px-3 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition active:scale-[0.98] flex items-center gap-1.5"
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
                className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition active:scale-[0.98]"
              >
                Cancel
              </button>
              {isCreateWizard ? (
                stepIdx < LAST_STEP ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="px-5 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition active:scale-[0.98] flex items-center gap-1.5"
                  >
                    Next
                    <Icon name="arrow_forward" size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition active:scale-[0.98]"
                  >
                    Create Faculty
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition active:scale-[0.98]"
                >
                  Save Changes
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Discard changes?"
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setConfirmClose(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg">Keep editing</button>
            <button type="button" onClick={handleDiscard} className="px-4 py-2 text-sm font-semibold bg-rose-600 text-white hover:bg-rose-700 transition rounded-lg">Discard</button>
          </>
        }
      >
        <p className="text-sm text-slate-600">You have unsaved changes. If you close now, they'll be lost.</p>
      </Modal>
    </>
  );
}