import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import type { Department } from '../../../api/departments.api';
import {
  createRoom,
  updateRoom,
  type RoomRecord,
  type CreateRoomInput,
} from '../../../api/rooms.api';
import {
  EMPTY_FORM,
  STEP_DEFS,
  StepIndicator,
  type FormState,
  type FieldErrors,
} from './RoomFormFields';
import {
  BasicsStep,
  DetailsStep,
  OwnershipStep,
  ReviewStep,
  LivePreview,
} from './RoomFormSteps';

interface Props {
  mode: 'create' | 'edit' | null;
  room: RoomRecord | null;
  rooms: RoomRecord[];
  departments: Department[];
  isDH: boolean;
  myDeptId: string | null;
  isAdminOrDean: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const LAST_STEP = STEP_DEFS.length - 1;
const ROOMS_KEY = ['rooms', { includeInactive: true }] as const;

export default function RoomFormModal({
  mode,
  room,
  rooms,
  departments,
  isDH,
  myDeptId,
  isAdminOrDean,
  onClose,
  onSuccess,
  onError,
}: Props) {
  const qc = useQueryClient();
  const open = mode !== null;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [stepIdx, setStepIdx] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === 'create') {
      setForm({ ...EMPTY_FORM, deptId: isDH && myDeptId ? myDeptId : '' });
    } else if (mode === 'edit' && room) {
      setForm({
        roomNumber: room.roomNumber,
        building: room.building,
        roomType: room.roomType,
        capacity: room.capacity != null ? String(room.capacity) : '',
        deptId: room.deptId ?? '',
        isShared: room.deptId == null,
      });
    }
    setStepIdx(0);
    setFieldErrors({});
    setFormError(null);
    setConfirmClose(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, room?.roomId]);

  const setField = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const setShared = (isShared: boolean) => {
    setForm((prev) => ({
      ...prev,
      isShared,
      deptId: isShared
        ? ''
        : prev.deptId || (isDH && myDeptId ? myDeptId : ''),
    }));
  };

  const duplicateRoom = useMemo(() => {
    const building = form.building.trim().toLowerCase();
    const number = form.roomNumber.trim().toLowerCase();
    if (!building || !number) return null;
    return (
      rooms.find(
        (r) =>
          r.roomId !== (mode === 'edit' ? room?.roomId : undefined) &&
          r.building.trim().toLowerCase() === building &&
          r.roomNumber.trim().toLowerCase() === number,
      ) ?? null
    );
  }, [form.building, form.roomNumber, rooms, mode, room?.roomId]);

  const validateStep = (idx: number): boolean => {
    const errs: FieldErrors = {};
    if (idx === 0) {
      if (!form.roomNumber.trim()) errs.roomNumber = 'Room number is required';
      if (!form.building.trim()) errs.building = 'Building is required';
      if (duplicateRoom) {
        errs.roomNumber = `Room ${form.roomNumber} already exists in ${form.building}`;
      }
    } else if (idx === 1) {
      if (form.capacity) {
        const n = Number(form.capacity);
        if (isNaN(n) || n < 0 || n > 1000) {
          errs.capacity = 'Capacity must be between 0 and 1000';
        }
      }
    } else if (idx === 2) {
      if (!form.isShared && !form.deptId) {
        errs.deptId = 'Select a department or mark this room as shared';
      }
    }
    setFieldErrors((prev) => ({ ...prev, ...errs }));
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (validateStep(stepIdx)) setStepIdx((i) => Math.min(i + 1, LAST_STEP));
  };

  const goBack = () => setStepIdx((i) => Math.max(i - 1, 0));

  // ── Create (optimistic) ────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: createRoom,
    onMutate: async (payload: CreateRoomInput) => {
      await qc.cancelQueries({ queryKey: ROOMS_KEY });
      const prev = qc.getQueryData<RoomRecord[]>(ROOMS_KEY);
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const temp: RoomRecord = {
        roomId: tempId,
        roomNumber: payload.roomNumber,
        building: payload.building,
        roomType: payload.roomType,
        capacity: payload.capacity ?? null,
        deptId: payload.deptId ?? null,
        isActive: true,
      } as unknown as RoomRecord;
      qc.setQueryData<RoomRecord[]>(ROOMS_KEY, (old = []) => [...old, temp]);
      return { prev, tempId };
    },
    onSuccess: (created, _vars, ctx) => {
      qc.setQueryData<RoomRecord[]>(ROOMS_KEY, (old = []) =>
        old.map((x) => (x.roomId === ctx?.tempId ? created : x)),
      );
      onSuccess(`Room ${created.roomNumber} created.`);
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(ROOMS_KEY, ctx.prev);
      onError(
        err?.response?.data?.message ?? err?.message ?? 'Failed to create',
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  });

  // ── Update (optimistic) ────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<CreateRoomInput>;
    }) => updateRoom(id, input),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: ROOMS_KEY });
      const prev = qc.getQueryData<RoomRecord[]>(ROOMS_KEY);
      qc.setQueryData<RoomRecord[]>(ROOMS_KEY, (old = []) =>
        old.map((r) => (r.roomId === id ? { ...r, ...input } : r)),
      );
      return { prev };
    },
    onSuccess: (updated) => {
      qc.setQueryData<RoomRecord[]>(ROOMS_KEY, (old = []) =>
        old.map((x) => (x.roomId === updated.roomId ? updated : x)),
      );
      onSuccess(`Room ${updated.roomNumber} updated.`);
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(ROOMS_KEY, ctx.prev);
      onError(
        err?.response?.data?.message ?? err?.message ?? 'Failed to update',
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  });

  const handleSubmit = () => {
    setFormError(null);

    const allErrs: FieldErrors = {};
    if (!form.roomNumber.trim()) allErrs.roomNumber = 'Room number is required';
    if (!form.building.trim()) allErrs.building = 'Building is required';
    if (duplicateRoom) {
      allErrs.roomNumber = `Room ${form.roomNumber} already exists in ${form.building}`;
    }
    if (form.capacity) {
      const n = Number(form.capacity);
      if (isNaN(n) || n < 0 || n > 1000) {
        allErrs.capacity = 'Capacity must be between 0 and 1000';
      }
    }
    if (!form.isShared && !form.deptId) {
      allErrs.deptId = 'Select a department or mark this room as shared';
    }

    if (Object.keys(allErrs).length > 0) {
      setFieldErrors(allErrs);
      if (allErrs.roomNumber || allErrs.building) setStepIdx(0);
      else if (allErrs.capacity) setStepIdx(1);
      else if (allErrs.deptId) setStepIdx(2);
      return;
    }

    const payload: CreateRoomInput = {
      roomNumber: form.roomNumber.trim(),
      building: form.building.trim(),
      roomType: form.roomType,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      deptId: form.isShared ? null : form.deptId || undefined,
    };

    // ── Close the modal the instant the user commits. ──
    // Optimistic cache updates + onSuccess message make it feel seamless.
    onClose();

    if (mode === 'create') createMutation.mutate(payload);
    else if (mode === 'edit' && room)
      updateMutation.mutate({ id: room.roomId, input: payload });
  };

  const isDirty = (): boolean => {
    if (mode === 'create') {
      return !!(
        form.roomNumber ||
        form.building ||
        form.capacity ||
        form.isShared ||
        form.roomType !== 'lecture_room' ||
        stepIdx > 0
      );
    }
    if (mode === 'edit' && room) {
      return (
        form.roomNumber !== room.roomNumber ||
        form.building !== room.building ||
        form.roomType !== room.roomType ||
        form.capacity !== (room.capacity != null ? String(room.capacity) : '') ||
        form.deptId !== (room.deptId ?? '') ||
        form.isShared !== (room.deptId == null)
      );
    }
    return false;
  };

  const handleAttemptClose = () => {
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
          <BasicsStep
            form={form}
            setField={setField}
            fieldErrors={fieldErrors}
            duplicateRoom={duplicateRoom}
          />
        );
      case 1:
        return (
          <DetailsStep
            form={form}
            setField={setField}
            fieldErrors={fieldErrors}
          />
        );
      case 2:
        return (
          <OwnershipStep
            form={form}
            setField={setField}
            fieldErrors={fieldErrors}
            setShared={setShared}
            isDH={isDH}
            myDeptId={myDeptId}
            departments={departments}
          />
        );
      case 3:
        return <ReviewStep form={form} departments={departments} />;
      default:
        return null;
    }
  };

  const isCreateWizard = mode === 'create';
  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Modal
        open={open}
        onClose={handleAttemptClose}
        title={
          isCreateWizard
            ? 'Create Room'
            : `Edit Room — ${room?.roomNumber ?? ''}`
        }
        description={
          isCreateWizard
            ? 'Follow the steps to register a new room.'
            : "Update this room's details."
        }
        size="lg"
      >
        <div className="space-y-4">
          {isCreateWizard && (
            <StepIndicator currentIdx={stepIdx} steps={STEP_DEFS} />
          )}

          <LivePreview form={form} departments={departments} />

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

          {isCreateWizard ? (
            renderStep(stepIdx)
          ) : (
            <div className="space-y-5">
              {renderStep(0)}
              {renderStep(1)}
              {renderStep(2)}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 justify-between pt-4 border-t border-surface-variant">
            <div>
              {isCreateWizard && stepIdx > 0 && (
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
              {isCreateWizard ? (
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
                    className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition flex items-center gap-2"
                  >
                    <Icon name="check" size={14} />
                    Create Room
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition flex items-center gap-2"
                >
                  <Icon name="save" size={14} />
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