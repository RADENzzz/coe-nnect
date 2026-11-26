import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSemesterType,
  deleteSemesterType,
  reorderSemesterTypes,
  updateSemesterType,
  type SemesterTypeRecord,
  type UpdateSemesterTypeInput,
} from '../../../api/semesters.api';
import { type Term } from '../../../api/terms.api';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { useFeedback } from '../../../components/ui/FeedbackToast';
import { extractApiError } from '../../../lib/api-error';
import { useSemesterTypes } from '../../../hooks/use-semester-types';

interface Props {
  isAdmin: boolean;
}

interface TypeForm {
  code: string;
  label: string;
  shortLabel: string;
  sortOrder: string;
}

type FormField = keyof TypeForm;
type FormErrors = Partial<Record<FormField, string>>;

type DialogState =
  | { kind: 'form'; editing: SemesterTypeRecord | null }
  | { kind: 'delete'; type: SemesterTypeRecord }
  | { kind: 'deactivate'; type: SemesterTypeRecord }
  | null;

interface UpdateAction {
  code: string;
  input: UpdateSemesterTypeInput;
  outcome: 'updated' | 'deactivated';
}

const CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,19}$/;

/** Mirrors the backend's create rule so the form can explain the problem. */
function codeFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
}

function validate(values: TypeForm, editing: boolean): FormErrors {
  const errors: FormErrors = {};
  if (!values.label.trim()) errors.label = 'Label is required.';
  if (!values.shortLabel.trim()) errors.shortLabel = 'Short label is required.';
  if (!editing && !CODE_PATTERN.test(values.code.trim())) {
    errors.code =
      'Use 1–20 lowercase letters, digits, hyphens, or underscores, starting with a letter or digit.';
  }
  const order = Number(values.sortOrder);
  if (!values.sortOrder.trim() || !Number.isFinite(order)) {
    errors.sortOrder = 'Order must be a number.';
  }
  return errors;
}

function isUsed(type: SemesterTypeRecord): boolean {
  return (
    type.termCount +
      type.prospectusCount +
      type.pdfTableCount +
      type.electiveCount >
    0
  );
}

function usageString(type: SemesterTypeRecord): string {
  const parts: string[] = [];
  if (type.prospectusCount) {
    parts.push(
      `${type.prospectusCount} prospectus${
        type.prospectusCount === 1 ? ' row' : ''
      }`,
    );
  }
  if (type.termCount) {
    parts.push(`${type.termCount} ${type.termCount === 1 ? 'term' : 'terms'}`);
  }
  if (type.pdfTableCount) {
    parts.push(
      `${type.pdfTableCount} ${type.pdfTableCount === 1 ? 'pdf table' : 'pdf tables'}`,
    );
  }
  if (type.electiveCount) {
    parts.push(
      `${type.electiveCount} ${type.electiveCount === 1 ? 'elective' : 'electives'}`,
    );
  }
  return parts.length > 0 ? parts.join(' · ') : 'Unused';
}

export default function SemesterTypesPanel({ isAdmin }: Props) {
  const qc = useQueryClient();
  const feedback = useFeedback();
  const { types, isLoading } = useSemesterTypes();

  // TermsPanel already owns this query on the same page; observe its cache
  // instead of issuing a second request.
  const { data: terms = [] } = useQuery<Term[]>({ queryKey: ['terms'] });
  const activeTerm = terms.find((term) => term.isActive);
  const locked = Boolean(activeTerm);

  const [dialog, setDialog] = useState<DialogState>(null);
  const [form, setForm] = useState<TypeForm>({
    code: '',
    label: '',
    shortLabel: '',
    sortOrder: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [codeTouched, setCodeTouched] = useState(false);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['semester-types'] });

  // A term can become active in another tab or in TermsPanel while a dialog
  // is open. Close it so no stale action stays available.
  useEffect(() => {
    if (locked) setDialog(null);
  }, [locked]);

  const createMutation = useMutation({
    mutationFn: createSemesterType,
    onSuccess: (created) => {
      setDialog(null);
      feedback.success(`Semester type "${created.label}" was added.`, {
        title: 'Semester type added',
      });
      invalidate();
    },
    onError: (err: any) =>
      feedback.failed(extractApiError(err, 'Failed to add semester type'), {
        title: 'Could not add semester type',
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ code, input }: UpdateAction) =>
      updateSemesterType(code, input),
    onSuccess: (updated, variables) => {
      setDialog(null);
      if (variables.outcome === 'deactivated') {
        feedback.success(
          `Semester type "${updated.label}" was deactivated. Existing records keep the label, but new records cannot select it.`,
          { title: 'Semester type deactivated' },
        );
      } else {
        feedback.success(`Semester type "${updated.label}" was updated.`, {
          title: 'Semester type updated',
        });
      }
      invalidate();
    },
    onError: (err: any) =>
      feedback.failed(extractApiError(err, 'Failed to update semester type'), {
        title: 'Could not update semester type',
      }),
  });

  const reorderMutation = useMutation({
    mutationFn: reorderSemesterTypes,
    onSuccess: () => {
      feedback.success('Semester type order was updated.', {
        title: 'Order updated',
      });
      invalidate();
    },
    onError: (err: any) =>
      feedback.failed(extractApiError(err, 'Failed to change the order'), {
        title: 'Could not change order',
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSemesterType,
    onSuccess: () => {
      setDialog(null);
      feedback.success('The semester type was deleted.', {
        title: 'Semester type deleted',
      });
      invalidate();
    },
    onError: (err: any) =>
      feedback.failed(extractApiError(err, 'Failed to delete semester type'), {
        title: 'Could not delete semester type',
      }),
  });

  const orderedTypes = [...types].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
  const formDialog = dialog?.kind === 'form' ? dialog : null;
  const editingType = formDialog?.editing ?? null;
  const deleteType = dialog?.kind === 'delete' ? dialog.type : null;
  const deactivateType = dialog?.kind === 'deactivate' ? dialog.type : null;
  const deleteBlocked = deleteType ? isUsed(deleteType) : false;
  const busyWrite =
    createMutation.isPending ||
    updateMutation.isPending ||
    reorderMutation.isPending ||
    deleteMutation.isPending;

  const openCreate = () => {
    const nextOrder = Math.max(0, ...types.map((t) => t.sortOrder)) + 10;
    setForm({ code: '', label: '', shortLabel: '', sortOrder: String(nextOrder) });
    setErrors({});
    setCodeTouched(false);
    setDialog({ kind: 'form', editing: null });
  };

  const openEdit = (type: SemesterTypeRecord) => {
    setForm({
      code: type.code,
      label: type.label,
      shortLabel: type.shortLabel,
      sortOrder: String(type.sortOrder),
    });
    setErrors({});
    setCodeTouched(false);
    setDialog({ kind: 'form', editing: type });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDialog) return;
    const found = validate(form, Boolean(formDialog.editing));
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const input = {
      label: form.label.trim(),
      shortLabel: form.shortLabel.trim(),
      sortOrder: Number(form.sortOrder),
    };
    if (formDialog.editing) {
      updateMutation.mutate({
        code: formDialog.editing.code,
        input,
        outcome: 'updated',
      });
    } else {
      createMutation.mutate({ code: form.code.trim(), ...input });
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= orderedTypes.length) return;
    const next = [...orderedTypes];
    [next[index], next[target]] = [next[target], next[index]];
    reorderMutation.mutate(next.map((type) => type.code));
  };

  const toggleActive = (type: SemesterTypeRecord) => {
    if (type.isActive && isUsed(type)) {
      setDialog({ kind: 'deactivate', type });
      return;
    }
    updateMutation.mutate({
      code: type.code,
      input: { isActive: !type.isActive },
      outcome: 'updated',
    });
  };

  const lockTitle = locked ? 'Deactivate the active term first' : undefined;

  return (
    <section
      id="semester-types"
      className="scroll-mt-24 rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden"
    >
      <header className="flex items-start gap-3 px-5 py-4 border-b border-surface-variant bg-surface-container-low">
        <Icon
          name="date_range"
          size={20}
          className="text-primary mt-0.5 shrink-0"
        />
        <div className="flex-1">
          <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">
            Semester types
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            The periods a school year is divided into — semesters, trimesters,
            quarters, or summer. Order here controls every dropdown and the
            import classifier.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            disabled={locked || busyWrite}
            title={lockTitle}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Icon name="add" size={14} />
            Add semester type
          </button>
        )}
      </header>

      <div className="p-5 space-y-4">
        {locked && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <Icon name="lock" size={16} className="shrink-0 mt-0.5" />
            <span>
              Semester types are read-only while{' '}
              <strong>{activeTerm?.termName}</strong> is active.{' '}
              <a
                href="#academic-terms"
                className="font-semibold underline underline-offset-2 hover:text-amber-700"
              >
                Academic Terms
              </a>{' '}
              {isAdmin
                ? 'lets you deactivate it first.'
                : 'shows the term the dean must deactivate first.'}
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-sm text-on-surface-variant">
            Loading semester types…
          </div>
        ) : orderedTypes.length === 0 ? (
          <div className="py-8 text-center">
            <Icon
              name="date_range"
              size={36}
              className="text-on-surface-variant/40 mx-auto mb-2"
            />
            <p className="text-sm font-semibold text-on-surface mb-1">
              No semester types yet
            </p>
            <p className="text-xs text-on-surface-variant">
              {isAdmin
                ? 'Click "Add semester type" to define the periods for a school year.'
                : 'An administrator needs to add the semester periods.'}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-surface-variant overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-surface-container-low">
                <tr className="border-b border-surface-variant text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  <th className="text-left px-3 py-2.5">Order</th>
                  <th className="text-left px-3 py-2.5">Short label</th>
                  <th className="text-left px-3 py-2.5">Label</th>
                  <th className="text-left px-3 py-2.5">Code</th>
                  <th className="text-left px-3 py-2.5">Usage</th>
                  {isAdmin && (
                    <th className="text-center px-3 py-2.5">Active</th>
                  )}
                  {isAdmin && (
                    <th className="text-left px-3 py-2.5">Edit</th>
                  )}
                  {isAdmin && (
                    <th className="text-left px-3 py-2.5">Delete</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {orderedTypes.map((type, index) => (
                  <tr
                    key={type.code}
                    className={`border-b border-surface-variant/70 last:border-b-0 hover:bg-surface-container-low ${
                      type.isActive ? '' : 'opacity-70'
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 text-center text-xs text-on-surface-variant">
                          {index + 1}
                        </span>
                        {isAdmin && (
                          <div className="flex flex-col">
                            <button
                              type="button"
                              onClick={() => move(index, -1)}
                              disabled={
                                locked ||
                                index === 0 ||
                                reorderMutation.isPending
                              }
                              title={lockTitle}
                              aria-label={`Move ${type.label} up`}
                              className="text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Icon name="arrow_upward" size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => move(index, 1)}
                              disabled={
                                locked ||
                                index === orderedTypes.length - 1 ||
                                reorderMutation.isPending
                              }
                              title={lockTitle}
                              aria-label={`Move ${type.label} down`}
                              className="text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Icon name="arrow_downward" size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-on-surface">
                      {type.shortLabel}
                    </td>
                    <td className="px-3 py-2.5 text-on-surface">
                      {type.label}
                      {!type.isActive && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-on-surface-variant">
                      {type.code}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-on-surface-variant">
                      {usageString(type)}
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={type.isActive}
                          disabled={locked || updateMutation.isPending}
                          onChange={() => toggleActive(type)}
                          title={lockTitle}
                          aria-label={`Active status for ${type.label}`}
                          className="accent-primary disabled:cursor-not-allowed"
                        />
                      </td>
                    )}
                    {isAdmin && (
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => openEdit(type)}
                          disabled={locked || busyWrite}
                          title={lockTitle}
                          className="text-xs px-2 py-1 rounded-lg border border-surface-variant text-on-surface hover:bg-surface-container-high transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Edit
                        </button>
                      </td>
                    )}
                    {isAdmin && (
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => setDialog({ kind: 'delete', type })}
                          disabled={locked || busyWrite}
                          title={lockTitle}
                          className="text-xs px-2 py-1 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / edit */}
      <Modal
        open={Boolean(formDialog)}
        onClose={() => setDialog(null)}
        title={editingType ? `Edit ${editingType.label}` : 'Add semester type'}
        description="The code stays fixed so existing records keep pointing to this period."
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDialog(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={busyWrite}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingType
                ? busyWrite
                  ? 'Saving…'
                  : 'Save changes'
                : busyWrite
                ? 'Adding…'
                : 'Add semester type'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="semester-type-code"
              className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider"
            >
              Code *
            </label>
            <input
              id="semester-type-code"
              type="text"
              value={form.code}
              disabled={Boolean(editingType)}
              onChange={(e) => {
                setCodeTouched(true);
                setForm((prev) => ({ ...prev, code: e.target.value }));
              }}
              placeholder="3rd"
              className={`w-full bg-surface-container-low border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary disabled:opacity-60 ${
                errors.code ? 'border-red-500' : 'border-surface-variant'
              }`}
            />
            <p className="text-[10px] text-on-surface-variant mt-1">
              {editingType || codeTouched
                ? 'Code cannot be changed later.'
                : 'Filled from the label until you edit it. Lowercase letters, digits, hyphens, or underscores.'}
            </p>
            {errors.code && (
              <p role="alert" className="text-xs text-red-600 mt-1">
                {errors.code}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="semester-type-label"
              className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider"
            >
              Label *
            </label>
            <input
              id="semester-type-label"
              type="text"
              value={form.label}
              onChange={(e) => {
                const label = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  label,
                  code:
                    editingType || codeTouched
                      ? prev.code
                      : codeFromLabel(label),
                }));
              }}
              placeholder="Third Semester"
              className={`w-full bg-surface-container-low border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary ${
                errors.label ? 'border-red-500' : 'border-surface-variant'
              }`}
            />
            {errors.label && (
              <p role="alert" className="text-xs text-red-600 mt-1">
                {errors.label}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="semester-type-short-label"
                className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider"
              >
                Short label *
              </label>
              <input
                id="semester-type-short-label"
                type="text"
                value={form.shortLabel}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, shortLabel: e.target.value }))
                }
                placeholder="3rd"
                className={`w-full bg-surface-container-low border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary ${
                  errors.shortLabel ? 'border-red-500' : 'border-surface-variant'
                }`}
              />
              {errors.shortLabel && (
                <p role="alert" className="text-xs text-red-600 mt-1">
                  {errors.shortLabel}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="semester-type-order"
                className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider"
              >
                Order *
              </label>
              <input
                id="semester-type-order"
                type="number"
                step="1"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, sortOrder: e.target.value }))
                }
                className={`w-full bg-surface-container-low border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary ${
                  errors.sortOrder ? 'border-red-500' : 'border-surface-variant'
                }`}
              />
              {errors.sortOrder && (
                <p role="alert" className="text-xs text-red-600 mt-1">
                  {errors.sortOrder}
                </p>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete, with deactivation fallback for used types */}
      <ConfirmDialog
        open={Boolean(deleteType)}
        title="Delete semester type?"
        description={
          deleteType ? (
            deleteBlocked ? (
              <>
                <p>
                  Semester type "{deleteType.label}" ({deleteType.code}) is used
                  by {usageString(deleteType)}, so it cannot be deleted.
                </p>
                <p className="mt-2">
                  Deactivate it instead: existing records keep the label, but
                  new records cannot select it.
                </p>
              </>
            ) : (
              <p>
                Delete "{deleteType.label}" ({deleteType.code})? This cannot be
                undone.
              </p>
            )
          ) : null
        }
        confirmLabel={deleteBlocked ? 'Deactivate instead' : 'Delete'}
        tone={deleteBlocked ? 'default' : 'danger'}
        busy={busyWrite || locked}
        onConfirm={() => {
          if (!deleteType) return;
          if (deleteBlocked) {
            updateMutation.mutate({
              code: deleteType.code,
              input: { isActive: false },
              outcome: 'deactivated',
            });
          } else {
            deleteMutation.mutate(deleteType.code);
          }
        }}
        onClose={() => setDialog(null)}
      />

      {/* Warning when deactivating a type that records still reference */}
      <ConfirmDialog
        open={Boolean(deactivateType)}
        title="Deactivate semester type?"
        description={
          deactivateType ? (
            <>
              <p>
                Existing records keep the "{deactivateType.label}" label, but
                new terms, prospectus rows, and electives cannot select it.
              </p>
              <p className="mt-2">You can reactivate it later.</p>
            </>
          ) : null
        }
        confirmLabel="Deactivate"
        busy={busyWrite || locked}
        onConfirm={() => {
          if (!deactivateType) return;
          updateMutation.mutate({
            code: deactivateType.code,
            input: { isActive: false },
            outcome: 'deactivated',
          });
        }}
        onClose={() => setDialog(null)}
      />
    </section>
  );
}
