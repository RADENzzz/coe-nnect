import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import {
  createFacultyRequest,
  type FacultyRequest,
} from '../../../api/faculty-requests.api';
import type { Department } from '../../../api/departments.api';
import type { FacultyRecord } from '../../../api/faculty.api';
import type { SubjectRecord } from '../../../api/subjects.api';
import type { ProgramRecord } from '../../../api/programs.api';
import type { Term } from '../../../api/schedule.api';
import {
  EMPTY_FORM,
  STEP_DEFS,
  StepIndicator,
  type FormState,
  type FieldErrors,
} from './RequestFormFields';
import {
  WhoStep,
  SubjectStep,
  ReasonStep,
  ReviewStep,
  LivePreview,
} from './RequestFormSteps';

const LAST_STEP = STEP_DEFS.length - 1;

export interface ProspectusEntry {
  programId: string;
  subjectId: string;
  yearLevel: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  departments: Department[];
  facultyList: FacultyRecord[];
  subjects: SubjectRecord[];
  programs: ProgramRecord[];
  prospectus: ProspectusEntry[];
  requests: FacultyRequest[];
  activeTerm: Term | null;
  myDeptId: string;
}

export default function RequestFormModal({
  open,
  onClose,
  onSuccess,
  departments,
  facultyList,
  subjects,
  programs,
  prospectus,
  requests,
  activeTerm,
  myDeptId,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [stepIdx, setStepIdx] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  // Reset every time the modal opens
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setStepIdx(0);
    setFieldErrors({});
    setFormError(null);
    setConfirmClose(false);
  }, [open]);

  // Reset ackDuplicate when its defining inputs change
  useEffect(() => {
    setForm((prev) => ({ ...prev, ackDuplicate: false }));
  }, [form.targetDeptId, form.subjectId]);

  const setField = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'targetDeptId' && prev.targetDeptId !== value) {
        next.specificFacultyId = '';
      }
      if (
        (key === 'subjectSource' || key === 'selectedYear') &&
        prev[key] !== value
      ) {
        next.subjectId = '';
      }
      return next;
    });
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // Derived lookups
  const myProgramIds = useMemo(() => {
    if (!myDeptId) return [];
    return programs
      .filter((p) => String(p.deptId) === myDeptId)
      .map((p) => String(p.programId));
  }, [programs, myDeptId]);

  const myProspectus = useMemo(
    () =>
      prospectus.filter((p) => myProgramIds.includes(String(p.programId))),
    [prospectus, myProgramIds],
  );

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const p of myProspectus) {
      if (p.yearLevel >= 1 && p.yearLevel <= 5) years.add(p.yearLevel);
    }
    return Array.from(years).sort((a, b) => a - b);
  }, [myProspectus]);

  const facultyInTargetDept = useMemo(() => {
    if (!form.targetDeptId) return [];
    return facultyList.filter(
      (f) => String(f.deptId) === String(form.targetDeptId),
    );
  }, [facultyList, form.targetDeptId]);

  const availableSubjects = useMemo(() => {
    if (form.subjectSource === 'all') {
      return subjects.filter((s) => s.isActive);
    }
    if (!form.selectedYear) return [];
    const subjectIdsForYear = new Set(
      myProspectus
        .filter((p) => String(p.yearLevel) === form.selectedYear)
        .map((p) => String(p.subjectId)),
    );
    return subjects.filter(
      (s) => s.isActive && subjectIdsForYear.has(String(s.subjectId)),
    );
  }, [form.subjectSource, form.selectedYear, subjects, myProspectus]);

  const facultyOptions = useMemo(
    () =>
      facultyInTargetDept.map((f) => ({
        value: f.facultyId,
        label: `${f.lastName}, ${f.firstName}`,
        meta: f.wmsuId ? `WMSU ID: ${f.wmsuId}` : undefined,
      })),
    [facultyInTargetDept],
  );

  const subjectOptions = useMemo(
    () =>
      availableSubjects.map((s) => ({
        value: s.subjectId,
        label: `[${s.subjectCode}] ${s.title}`,
        meta: `${s.lectureUnits}L + ${s.labUnits}Lab`,
      })),
    [availableSubjects],
  );

  const duplicateRequest = useMemo(() => {
    if (!form.targetDeptId || !form.subjectId || !activeTerm?.termId)
      return null;
    return (
      requests.find(
        (r) =>
          r.status === 'pending' &&
          String(r.termId) === String(activeTerm.termId) &&
          String(r.targetDeptId) === String(form.targetDeptId) &&
          String(r.subjectId) === String(form.subjectId) &&
          String(r.requestingDeptId) === String(myDeptId),
      ) ?? null
    );
  }, [
    requests,
    form.targetDeptId,
    form.subjectId,
    activeTerm?.termId,
    myDeptId,
  ]);

  const requestingDeptLabel = useMemo(() => {
    const d = departments.find((x) => String(x.deptId) === myDeptId);
    return d ? d.deptCode : 'Your Dept';
  }, [departments, myDeptId]);

  // Per-step validation
  const validateStep = (idx: number): boolean => {
    const errs: FieldErrors = {};
    if (idx === 0) {
      if (!form.targetDeptId) errs.targetDeptId = 'Select a target department';
      if (form.facultyMode === 'specific' && !form.specificFacultyId) {
        errs.specificFacultyId = 'Pick a faculty member';
      }
    } else if (idx === 1) {
      if (!form.subjectId) errs.subjectId = 'Select a subject';
    } else if (idx === 2) {
      if (!form.reason.trim()) errs.reason = 'Reason is required';
    }
    setFieldErrors((prev) => ({ ...prev, ...errs }));
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (validateStep(stepIdx)) {
      setStepIdx((i) => Math.min(i + 1, LAST_STEP));
    }
  };
  const goBack = () => setStepIdx((i) => Math.max(i - 1, 0));

  // Mutation
  const createMutation = useMutation({
    mutationFn: createFacultyRequest,
    onSuccess: () => {
      onSuccess('Request submitted for approval.');
    },
    onError: (err: any) => {
      setFormError(
        err?.response?.data?.message ??
          err.message ??
          'Failed to submit request',
      );
    },
  });

  const busy = createMutation.isPending;

  const handleSubmit = () => {
    setFormError(null);

    const allErrs: FieldErrors = {};
    if (!form.targetDeptId) allErrs.targetDeptId = 'Select a target department';
    if (form.facultyMode === 'specific' && !form.specificFacultyId) {
      allErrs.specificFacultyId = 'Pick a faculty member';
    }
    if (!form.subjectId) allErrs.subjectId = 'Select a subject';
    if (!form.reason.trim()) allErrs.reason = 'Reason is required';

    if (Object.keys(allErrs).length > 0) {
      setFieldErrors(allErrs);
      if (allErrs.targetDeptId || allErrs.specificFacultyId) setStepIdx(0);
      else if (allErrs.subjectId) setStepIdx(1);
      else if (allErrs.reason) setStepIdx(2);
      return;
    }

    if (!activeTerm) {
      setFormError('No active term. Cannot create requests.');
      return;
    }

    if (duplicateRequest && !form.ackDuplicate) {
      setFormError(
        'Please confirm you want to submit a duplicate request for this subject.',
      );
      return;
    }

    createMutation.mutate({
      targetDeptId: form.targetDeptId,
      facultyId:
        form.facultyMode === 'specific'
          ? form.specificFacultyId
          : undefined,
      subjectId: form.subjectId,
      termId: activeTerm.termId,
      reason: form.reason.trim(),
    });
  };

  // Dirty check
  const isDirty = (): boolean =>
    !!(
      form.targetDeptId ||
      form.facultyMode !== 'any' ||
      form.specificFacultyId ||
      form.subjectSource !== 'prospectus' ||
      form.selectedYear !== '1' ||
      form.subjectId ||
      form.reason ||
      stepIdx > 0
    );

  const handleAttemptClose = () => {
    if (busy) return;
    if (isDirty()) setConfirmClose(true);
    else onClose();
  };

  const handleDiscard = () => {
    setConfirmClose(false);
    onClose();
  };

  const renderStep = (idx: number) => {
    switch (idx) {
      case 0:
        return (
          <WhoStep
            form={form}
            setField={setField}
            fieldErrors={fieldErrors}
            departments={departments}
            myDeptId={myDeptId}
            facultyInTargetDept={facultyInTargetDept}
            facultyOptions={facultyOptions}
            requestingDeptLabel={requestingDeptLabel}
          />
        );
      case 1:
        return (
          <SubjectStep
            form={form}
            setField={setField}
            fieldErrors={fieldErrors}
            subjectOptions={subjectOptions}
            availableYears={availableYears}
            availableSubjects={availableSubjects}
          />
        );
      case 2:
        return (
          <ReasonStep
            form={form}
            setField={setField}
            fieldErrors={fieldErrors}
          />
        );
      case 3:
        return (
          <ReviewStep
            form={form}
            departments={departments}
            facultyList={facultyList}
            subjects={subjects}
            requestingDeptLabel={requestingDeptLabel}
            duplicateRequest={duplicateRequest}
            onAckChange={(v) => setField('ackDuplicate', v)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={handleAttemptClose}
        title="Create Cross-Department Request"
        description="Ask another department to provide a faculty member for a specific subject."
        size="lg"
      >
        <div className="space-y-4">
          {!activeTerm && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-700 text-sm flex items-start gap-2">
              <Icon name="error" size={16} className="shrink-0 mt-0.5" />
              <span>
                No active term. You can't create requests until an active term
                is set.
              </span>
            </div>
          )}

          <StepIndicator currentIdx={stepIdx} steps={STEP_DEFS} />

          {/* Live preview — hidden on Review step to avoid redundancy */}
          {stepIdx < LAST_STEP && (
            <LivePreview
              form={form}
              departments={departments}
              facultyList={facultyList}
              subjects={subjects}
              requestingDeptLabel={requestingDeptLabel}
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
                aria-label="Dismiss error"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )}

          {renderStep(stepIdx)}

          <div className="flex flex-wrap items-center gap-2 justify-between pt-4 border-t border-surface-variant">
            <div>
              {stepIdx > 0 && (
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
              {stepIdx < LAST_STEP ? (
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
                  disabled={busy || !activeTerm}
                  className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {busy && (
                    <Icon
                      name="progress_activity"
                      size={14}
                      className="animate-spin"
                    />
                  )}
                  {busy ? 'Submitting…' : 'Submit Request'}
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
        title="Discard request?"
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
              onClick={handleDiscard}
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