import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSubjectRestrictions,
  createSubjectRestriction,
  updateSubjectRestriction,
  deleteSubjectRestriction,
  type SubjectRecord,
} from '../../../api/subjects.api';
import Icon from '../../../components/ui/Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: SubjectRecord[];
}

export default function RestrictionsPanel({ open, onClose, subjects }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    subjectId1: '',
    subjectId2: '',
    warningMessage: '',
  });

  const { data: restrictions = [], isLoading } = useQuery({
    queryKey: ['subject-restrictions'],
    queryFn: () => fetchSubjectRestrictions(),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: createSubjectRestriction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subject-restrictions'] });
      setForm({ subjectId1: '', subjectId2: '', warningMessage: '' });
      setError(null);
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
      input: { warningMessage?: string; isActive?: boolean };
    }) => updateSubjectRestriction(id, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['subject-restrictions'] }),
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSubjectRestriction,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['subject-restrictions'] }),
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Delete failed'),
  });

  if (!open) return null;

  const subjectLabel = (id: string) => {
    const s = subjects.find((x) => String(x.subjectId) === String(id));
    return s ? `${s.subjectCode} — ${s.title}` : `#${id}`;
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.subjectId1 || !form.subjectId2) return;
    if (form.subjectId1 === form.subjectId2) {
      setError('Pick two different subjects.');
      return;
    }
    createMutation.mutate({
      subjectId1: form.subjectId1,
      subjectId2: form.subjectId2,
      warningMessage: form.warningMessage.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-surface-variant bg-surface-container-lowest shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-variant sticky top-0 bg-surface-container-lowest z-10">
          <div>
            <h2 className="text-lg font-bold text-primary">
              Subject Restrictions (S-11)
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Warn when two subjects are scheduled in the same slot for the
              same section.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Add new restriction */}
          <form
            onSubmit={handleAdd}
            className="rounded-lg border border-surface-variant p-4 bg-surface-container-low space-y-3"
          >
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              Add Restriction
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                value={form.subjectId1}
                onChange={(e) =>
                  setForm((p) => ({ ...p, subjectId1: e.target.value }))
                }
                required
                className="bg-surface-container-lowest border border-surface-variant rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Subject A…</option>
                {subjects
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.subjectId} value={s.subjectId}>
                      [{s.subjectCode}] {s.title}
                    </option>
                  ))}
              </select>
              <select
                value={form.subjectId2}
                onChange={(e) =>
                  setForm((p) => ({ ...p, subjectId2: e.target.value }))
                }
                required
                className="bg-surface-container-lowest border border-surface-variant rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Subject B…</option>
                {subjects
                  .filter((s) => s.isActive && s.subjectId !== form.subjectId1)
                  .map((s) => (
                    <option key={s.subjectId} value={s.subjectId}>
                      [{s.subjectCode}] {s.title}
                    </option>
                  ))}
              </select>
            </div>
            <input
              type="text"
              placeholder="Warning message (optional)"
              value={form.warningMessage}
              onChange={(e) =>
                setForm((p) => ({ ...p, warningMessage: e.target.value }))
              }
              maxLength={500}
              className="w-full bg-surface-container-lowest border border-surface-variant rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition flex items-center gap-2"
              >
                <Icon name="add" size={16} />
                {createMutation.isPending ? 'Adding…' : 'Add Restriction'}
              </button>
            </div>
          </form>

          {/* List */}
          <div className="rounded-lg border border-surface-variant overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-container-low border-b border-surface-variant text-xs uppercase tracking-wider text-on-surface-variant">
                  <th className="text-left px-4 py-2.5">Subject A</th>
                  <th className="text-left px-4 py-2.5">Subject B</th>
                  <th className="text-left px-4 py-2.5">Warning</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-right px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-on-surface-variant"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : restrictions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-on-surface-variant"
                    >
                      No restrictions configured.
                    </td>
                  </tr>
                ) : (
                  restrictions.map((r) => (
                    <tr
                      key={r.restrictionId}
                      className="border-b border-white/5 hover:bg-surface-container-low"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-primary">
                        {subjectLabel(r.subjectId1)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-primary">
                        {subjectLabel(r.subjectId2)}
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {r.warningMessage || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            r.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {r.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() =>
                            updateMutation.mutate({
                              id: r.restrictionId,
                              input: { isActive: !r.isActive },
                            })
                          }
                          disabled={updateMutation.isPending}
                          className={`text-xs px-3 py-1 rounded-lg border transition ${
                            r.isActive
                              ? 'border-amber-300 text-amber-700 hover:bg-amber-100'
                              : 'border-green-300 text-green-700 hover:bg-green-100'
                          }`}
                        >
                          {r.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                'Delete this restriction? This cannot be undone.',
                              )
                            ) {
                              deleteMutation.mutate(r.restrictionId);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="text-xs px-3 py-1 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 transition"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}