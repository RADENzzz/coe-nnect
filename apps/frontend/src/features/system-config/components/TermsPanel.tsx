import { useCallback, useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchTerms,
  createTerm,
  activateTerm,
  deactivateTerm,
  deleteTerm,
  type Term,
  type CreateTermInput,
  type SemesterType,
} from '../../../api/terms.api';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';

interface Props {
  isAdmin: boolean;
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

/**
 * Pick the semester enum value from a term name like "2nd Semester" or
 * "Summer 2027". Returns null if nothing matches.
 */
function inferSemesterFromName(name: string): SemesterType | null {
  const n = name.toLowerCase();
  if (/summer/.test(n)) return 'summer';
  if (/2nd|second/.test(n)) return '2nd';
  if (/1st|first/.test(n)) return '1st';
  return null;
}

/**
 * Map a term name to the enum value. Also used for the initial form.
 */
function defaultSemesterForTermName(name: string): SemesterType {
  return inferSemesterFromName(name) ?? '1st';
}

const EMPTY_FORM: CreateTermInput = {
  termName: '1st Semester',
  schoolYear: '',
  startDate: '',
  endDate: '',
  semester: '1st',
  setActive: false,
};

export default function TermsPanel({ isAdmin }: Props) {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const newTermRequested = searchParams.get('newTerm') === '1';
  const highlightedTermId = searchParams.get('termId');

  const { data: terms = [], isLoading } = useQuery({
    queryKey: ['terms'],
    queryFn: fetchTerms,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CreateTermInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Term | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Term | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['terms'] });
    qc.invalidateQueries({ queryKey: ['active-term'] });
    qc.invalidateQueries({ queryKey: ['schedules'] });
  };

  const openForm = useCallback(() => {
    setError(null);
    setSuccess(null);
    const latest = [...terms].sort((a, b) =>
      b.startDate.localeCompare(a.startDate),
    )[0];
    if (latest) {
      const [start, end] = latest.schoolYear.split('-');
      const nextSy =
        start && end
          ? `${Number(start) + 1}-${Number(end) + 1}`
          : latest.schoolYear;
      const shiftDate = (iso: string) => {
        const d = new Date(`${iso}T00:00:00`);
        if (Number.isNaN(d.getTime())) return '';
        d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().slice(0, 10);
      };
      // Infer semester from the latest term's name, but shift forward if
      // it was 1st sem (the natural next term is 2nd).
      const inferred = inferSemesterFromName(latest.termName);
      const nextSemester: SemesterType =
        inferred === '1st' ? '2nd' : (inferred ?? '1st');
      setForm({
        termName:
          nextSemester === '2nd'
            ? '2nd Semester'
            : nextSemester === 'summer'
            ? 'Summer'
            : '1st Semester',
        schoolYear: nextSy,
        startDate: shiftDate(latest.startDate),
        endDate: shiftDate(latest.endDate),
        semester: nextSemester,
        setActive: terms.length > 0 && !terms.some((t) => t.isActive),
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setFormOpen(true);
  }, [terms]);

  // A dashboard/search shortcut can deep-link here with ?newTerm=1.
  // Wait for terms to load so the form can suggest the next school year.
  useEffect(() => {
    if (!isAdmin || !newTermRequested || isLoading) return;
    openForm();
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('newTerm');
        return next;
      },
      { replace: true },
    );
  }, [isAdmin, isLoading, newTermRequested, openForm, setSearchParams]);

  // A term search result links here with ?termId=...; make the row easy to find.
  useEffect(() => {
    if (!highlightedTermId || isLoading) return;
    document
      .getElementById(`term-${highlightedTermId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedTermId, isLoading, terms.length]);

  // The Dean dashboard's "Manage terms" shortcut uses #academic-terms. Native
  // hash scrolling can miss the section because the route renders after the
  // navigation, so scroll once the query has settled.
  useEffect(() => {
    if (isLoading || location.hash !== '#academic-terms') return;
    document
      .getElementById('academic-terms')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isLoading, location.hash]);

  const createMutation = useMutation({
    mutationFn: createTerm,
    onSuccess: (t) => {
      setFormOpen(false);
      setSuccess(`Term "${t.termName}" created.`);
      invalidate();
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err?.message ?? 'Failed to create term',
      ),
  });

  const activateMutation = useMutation({
    mutationFn: activateTerm,
    onSuccess: (t) => {
      setSuccess(`Term "${t.termName}" is now active.`);
      invalidate();
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err?.message ?? 'Failed to activate',
      ),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateTerm,
    onSuccess: (t) => {
      setDeactivateTarget(null);
      setSuccess(
        `Term "${t.termName}" deactivated. No term is currently active.`,
      );
      invalidate();
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err?.message ?? 'Failed to deactivate',
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTerm,
    onSuccess: () => {
      setDeleteTarget(null);
      setSuccess('Term deleted.');
      invalidate();
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err?.message ?? 'Failed to delete',
      ),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.termName.trim() || !form.schoolYear.trim()) return;
    if (!form.startDate || !form.endDate) return;
    if (form.endDate <= form.startDate) {
      setError('End date must be after start date.');
      return;
    }
    if (!form.semester) {
      setError('Please select a semester.');
      return;
    }
    createMutation.mutate({
      termName: form.termName.trim(),
      schoolYear: form.schoolYear.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      semester: form.semester,
      setActive: form.setActive,
    });
  };

  const activeTerm = terms.find((t) => t.isActive);

  return (
    <section
      id="academic-terms"
      className="scroll-mt-24 rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden"
    >
      <header className="flex items-start gap-3 px-5 py-4 border-b border-surface-variant bg-surface-container-low">
        <Icon
          name="calendar_month"
          size={20}
          className="text-primary mt-0.5 shrink-0"
        />
        <div className="flex-1">
          <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">
            Academic Terms
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            {activeTerm
              ? `Currently active: ${activeTerm.termName} · AY ${activeTerm.schoolYear}`
              : 'No term is currently active. Schedules require an active term.'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openForm}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition"
          >
            <Icon name="add" size={14} />
            New Term
          </button>
        )}
      </header>

      <div className="p-5 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 rounded-lg bg-green-100 border border-green-300 text-green-700 text-sm">
            {success}
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-sm text-on-surface-variant">
            Loading terms…
          </div>
        ) : terms.length === 0 ? (
          <div className="py-8 text-center">
            <Icon
              name="calendar_month"
              size={36}
              className="text-on-surface-variant/40 mx-auto mb-2"
            />
            <p className="text-sm font-semibold text-on-surface mb-1">
              No terms yet
            </p>
            <p className="text-xs text-on-surface-variant">
              {isAdmin
                ? 'Click "New Term" to create one. Schedules require an active term.'
                : 'An administrator needs to create a term before schedules can be displayed.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {terms.map((t) => (
              <div
                key={t.termId}
                id={`term-${t.termId}`}
                className={`flex items-start justify-between gap-3 p-4 rounded-lg border transition-colors ${
                  highlightedTermId === String(t.termId)
                    ? 'ring-2 ring-primary/40 '
                    : ''
                }${
                  t.isActive
                    ? 'border-[#5c1219]/40 bg-red-50/30'
                    : 'border-surface-variant hover:bg-surface-container-low'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                      t.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-on-surface">
                        {t.termName}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        · AY {t.schoolYear}
                      </span>
                      {t.semester && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded">
                          {t.semester}
                        </span>
                      )}
                      {t.isActive && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {fmtDate(t.startDate)} – {fmtDate(t.endDate)}
                    </p>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {t.isActive ? (
                      <button
                        onClick={() => setDeactivateTarget(t)}
                        disabled={deactivateMutation.isPending}
                        className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition disabled:opacity-50"
                      >
                        {deactivateMutation.isPending ? '…' : 'Deactivate'}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => activateMutation.mutate(t.termId)}
                          disabled={activateMutation.isPending}
                          className="text-xs px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-50"
                        >
                          {activateMutation.isPending ? '…' : 'Activate'}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(t)}
                          disabled={deleteMutation.isPending}
                          className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 transition disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Term modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New Academic Term"
        description="Create a term that schedules will belong to."
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition disabled:opacity-50"
            >
              <Icon name="add" size={14} />
              {createMutation.isPending ? 'Creating…' : 'Create Term'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Term Name *
              </label>
              <select
                value={form.termName}
                onChange={(e) => {
                  const name = e.target.value;
                  const inferred = inferSemesterFromName(name);
                  setForm((p) => ({
                    ...p,
                    termName: name,
                    // Auto-suggest semester when the user picks a term name.
                    semester: inferred ?? p.semester,
                  }));
                }}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                <option value="1st Semester">1st Semester</option>
                <option value="2nd Semester">2nd Semester</option>
                <option value="Summer">Summer</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Semester *
              </label>
              <select
                value={form.semester}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    semester: e.target.value as SemesterType,
                  }))
                }
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                <option value="1st">1st Semester</option>
                <option value="2nd">2nd Semester</option>
                <option value="summer">Summer</option>
              </select>
              <p className="text-[10px] text-on-surface-variant mt-1">
                Controls which prospectus subjects the solver schedules for
                this term.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                School Year *
              </label>
              <input
                type="text"
                value={form.schoolYear}
                onChange={(e) =>
                  setForm((p) => ({ ...p, schoolYear: e.target.value }))
                }
                placeholder="2026-2027"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Start Date *
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  setForm((p) => ({ ...p, startDate: e.target.value }))
                }
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                End Date *
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) =>
                  setForm((p) => ({ ...p, endDate: e.target.value }))
                }
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.setActive ?? false}
              onChange={(e) =>
                setForm((p) => ({ ...p, setActive: e.target.checked }))
              }
              className="accent-[#5c1219]"
            />
            Set as active immediately
          </label>
          <p className="text-[11px] text-on-surface-variant">
            If checked, this term becomes the active one. Any previously active
            term is automatically deactivated.
          </p>
        </div>
      </Modal>

      {/* Deactivate confirmation */}
      <Modal
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        title="Deactivate term?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeactivateTarget(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (deactivateTarget) {
                  deactivateMutation.mutate(deactivateTarget.termId);
                }
              }}
              disabled={deactivateMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-50"
            >
              {deactivateMutation.isPending ? 'Deactivating…' : 'Deactivate'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Deactivate{' '}
          <strong>
            "{deactivateTarget?.termName} — AY {deactivateTarget?.schoolYear}"
          </strong>
          ?
        </p>
        <p className="text-sm text-slate-500 mt-2">
          Schedules for this term will remain in the database, but the
          Timetable won't display anything until a term is reactivated.
        </p>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete term?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.termId);
                }
              }}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete{' '}
          <strong>
            "{deleteTarget?.termName} — AY {deleteTarget?.schoolYear}"
          </strong>
          ? Schedules belonging to this term will remain in the database but
          won't be accessible from the UI. This cannot be undone.
        </p>
      </Modal>
    </section>
  );
}