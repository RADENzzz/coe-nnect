import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchTerms,
  createTerm,
  activateTerm,
  deactivateTerm,
  deleteTerm,
  fetchTermLifecycleSummary,
  type Term,
  type CreateTermInput,
  type TermLifecycleSummary,
} from '../../../../api/terms.api';
import Icon from '../../../../components/ui/Icon';
import Modal from '../../../../components/ui/Modal';
import ConfirmDialog from '../../../../components/ui/ConfirmDialog';
import FormErrorSummary from '../../../../components/ui/FormErrorSummary';
import {
  clearFieldError,
  mergeFieldError,
  type FieldError,
} from '../../../../components/ui/form-errors';
import { useFeedback } from '../../../../components/ui/FeedbackToast';
import { extractApiError } from '../../../../lib/api-error';
import { useSemesterTypes } from '../../../../hooks/use-semester-types';
import { matchSemesterType } from '../../../../lib/semester-match';
import {
  buildTermFormDefaults,
  collectTermFormErrors,
  COMPACT_TERM_LIMIT,
  TERM_PAGE_SIZE,
} from './term-shared';

export type TermManagementSectionProps = {
  canWrite: boolean;
  mode: 'compact' | 'full';
};

type LifecycleAction = 'deactivate' | 'activate';

interface LifecycleSummaryRequest {
  term: Term;
  action: LifecycleAction;
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

/**
 * Dates are optional, so show whichever ends are known instead of rendering
 * an empty range or treating a blank value as a date.
 */
function fmtDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const from = fmtDate(start);
  const until = fmtDate(end);
  if (from && until) return `${from} – ${until}`;
  if (from) return `From ${from}`;
  if (until) return `Until ${until}`;
  return 'Dates not set';
}

const EMPTY_FORM: CreateTermInput = {
  termName: '1st Semester',
  schoolYear: '',
  startDate: '',
  endDate: '',
  semester: '',
  setActive: false,
};

export default function TermManagementSection({
  canWrite,
  mode,
}: TermManagementSectionProps) {
  const qc = useQueryClient();
  const feedback = useFeedback();
  const {
    types,
    activeTypes,
    options,
    labelFor,
    shortLabelFor,
    isLoading: typesLoading,
    isError: typesError,
  } = useSemesterTypes();
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
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Term | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Term | null>(null);
  const [deactivateSummary, setDeactivateSummary] =
    useState<TermLifecycleSummary | null>(null);
  const [activateTarget, setActivateTarget] = useState<Term | null>(null);
  const [activateSummary, setActivateSummary] =
    useState<TermLifecycleSummary | null>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  // Full-page filters and pagination are local UI state; only the create and
  // highlight deep links live in the URL.
  const [search, setSearch] = useState('');
  const [schoolYearFilter, setSchoolYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const scrollToErrorSummary = () => {
    requestAnimationFrame(() =>
      errorSummaryRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      }),
    );
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['terms'] });
    qc.invalidateQueries({ queryKey: ['active-term'] });
    qc.invalidateQueries({ queryKey: ['schedules'] });
  };

  const openForm = useCallback(() => {
    setForm(buildTermFormDefaults(terms, types, labelFor));
    setErrors([]);
    setFormOpen(true);
  }, [terms, types, labelFor]);

  // A dashboard/search shortcut can deep-link here with ?newTerm=1. Wait for
  // both queries: terms supply the next school year, and the semester catalog
  // supplies a usable semester. If the catalog fails, keep newTerm in the URL
  // so a later successful refetch can still open a complete form.
  useEffect(() => {
    if (
      !canWrite ||
      !newTermRequested ||
      isLoading ||
      typesLoading ||
      typesError
    )
      return;
    openForm();
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('newTerm');
        return next;
      },
      { replace: true },
    );
  }, [
    canWrite,
    isLoading,
    typesLoading,
    typesError,
    newTermRequested,
    openForm,
    setSearchParams,
  ]);

  // Full mode can paginate a highlighted term off the first page. Clear the
  // filters and jump to its page so ?termId=... always reveals the row.
  useEffect(() => {
    if (mode !== 'full' || !highlightedTermId || isLoading) return;
    setSearch('');
    setSchoolYearFilter('');
    setStatusFilter('');
    const index = terms.findIndex(
      (term) => String(term.termId) === highlightedTermId,
    );
    if (index >= 0) setPage(Math.floor(index / TERM_PAGE_SIZE) + 1);
    // Re-run only for a new deep link or a fresh terms load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedTermId, isLoading, mode]);

  // The Dean dashboard's "Manage terms" shortcut uses #academic-terms. Native
  // hash scrolling can miss the section because the route renders after the
  // navigation, so scroll once the query has settled.
  useEffect(() => {
    if (isLoading || location.hash !== '#academic-terms') return;
    document
      .getElementById('academic-terms')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isLoading, location.hash]);

  const schoolYears = useMemo(
    () =>
      [...new Set(terms.map((term) => term.schoolYear))].sort((a, b) =>
        b.localeCompare(a),
      ),
    [terms],
  );

  const filteredTerms = useMemo(() => {
    if (mode !== 'full') return terms;
    const needle = search.trim().toLowerCase();
    return terms.filter((term) => {
      if (
        needle &&
        !`${term.termName} ${term.schoolYear}`.toLowerCase().includes(needle)
      )
        return false;
      if (schoolYearFilter && term.schoolYear !== schoolYearFilter) return false;
      if (statusFilter === 'active' && !term.isActive) return false;
      if (statusFilter === 'inactive' && term.isActive) return false;
      return true;
    });
  }, [terms, mode, search, schoolYearFilter, statusFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTerms.length / TERM_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const shownTerms =
    mode === 'compact'
      ? filteredTerms.slice(0, COMPACT_TERM_LIMIT)
      : filteredTerms.slice(
          (currentPage - 1) * TERM_PAGE_SIZE,
          currentPage * TERM_PAGE_SIZE,
        );

  // A term search result links here with ?termId=...; make the row easy to find.
  useEffect(() => {
    if (!highlightedTermId || isLoading) return;
    document
      .getElementById(`term-${highlightedTermId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedTermId, isLoading, shownTerms.length, currentPage]);

  const createMutation = useMutation({
    mutationFn: createTerm,
    onSuccess: (t) => {
      setFormOpen(false);
      feedback.success(`Term "${t.termName}" was created.`, {
        title: 'Term created',
      });
      invalidate();
    },
    onError: (err: any) =>
      feedback.failed(extractApiError(err, 'Failed to create term'), {
        title: 'Could not create term',
      }),
  });

  // Read-only preflight: neither switch reaches its mutation until the Dean
  // has seen what will be saved, closed, cleared, or restored.
  const summaryMutation = useMutation({
    mutationFn: (input: LifecycleSummaryRequest) =>
      fetchTermLifecycleSummary(input.term.termId, input.action),
    onSuccess: (summary, input) => {
      if (input.action === 'deactivate') {
        setDeactivateTarget(input.term);
        setDeactivateSummary(summary);
      } else {
        setActivateTarget(input.term);
        setActivateSummary(summary);
      }
    },
    onError: (err: unknown, input: LifecycleSummaryRequest) => {
      feedback.failed(
        extractApiError(err, 'Failed to load the term lifecycle summary'),
        { title: 'Could not check term changes' },
      );
      if (input.action === 'deactivate') {
        setDeactivateTarget(null);
        setDeactivateSummary(null);
      } else {
        setActivateTarget(null);
        setActivateSummary(null);
      }
    },
  });

  const summaryBusy = (termId: string, action: LifecycleAction) =>
    summaryMutation.isPending &&
    summaryMutation.variables?.action === action &&
    summaryMutation.variables.term.termId === termId;

  const activateMutation = useMutation({
    mutationFn: activateTerm,
    onSuccess: (t) => {
      setActivateTarget(null);
      setActivateSummary(null);
      feedback.success(`Term "${t.termName}" is now active.`, {
        title: 'Term activated',
      });
      invalidate();
    },
    onError: (err: any) =>
      feedback.failed(extractApiError(err, 'Failed to activate term'), {
        title: 'Could not activate term',
      }),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateTerm,
    onSuccess: (t) => {
      setDeactivateTarget(null);
      setDeactivateSummary(null);
      feedback.success(
        `Term "${t.termName}" was deactivated. No term is currently active.`,
        { title: 'Term deactivated' },
      );
      invalidate();
    },
    onError: (err: any) =>
      feedback.failed(extractApiError(err, 'Failed to deactivate term'), {
        title: 'Could not deactivate term',
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTerm,
    onSuccess: () => {
      setDeleteTarget(null);
      feedback.success('The term was deleted.', { title: 'Term deleted' });
      invalidate();
    },
    onError: (err: any) =>
      feedback.failed(extractApiError(err, 'Failed to delete term'), {
        title: 'Could not delete term',
      }),
  });

  const handleFieldChange = (event: React.FormEvent<HTMLElement>) => {
    const field = (event.target as HTMLElement).id;
    if (field) setErrors((prev) => clearFieldError(prev, field));
  };

  const handleFieldBlur = (event: React.FocusEvent<HTMLElement>) => {
    const field = (event.target as HTMLElement).id;
    if (!field) return;
    const problem = collectTermFormErrors(form).find(
      (error) => error.field === field,
    );
    setErrors((prev) =>
      problem
        ? mergeFieldError(prev, field, problem.message)
        : clearFieldError(prev, field),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const problems = collectTermFormErrors(form);
    setErrors(problems);
    if (problems.length > 0) {
      scrollToErrorSummary();
      return;
    }

    createMutation.mutate({
      termName: form.termName.trim(),
      schoolYear: form.schoolYear.trim(),
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      semester: form.semester,
      setActive: form.setActive,
    });
  };

  return (
    <div className="px-5 pb-5 pt-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {canWrite && (
            <button
              onClick={openForm}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:opacity-90 transition"
            >
              <Icon name="add" size={14} />
              New Term
            </button>
          )}
        </div>
      </div>

      {mode === 'full' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="term-search"
              className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider"
            >
              Search terms
            </label>
            <input
              id="term-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Term name or school year"
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label
              htmlFor="term-school-year"
              className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider"
            >
              School year
            </label>
            <select
              id="term-school-year"
              value={schoolYearFilter}
              onChange={(e) => {
                setSchoolYearFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">All school years</option>
              {schoolYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="term-status"
              className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider"
            >
              Status
            </label>
            <select
              id="term-status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
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
            {canWrite
              ? 'Click "New Term" to create one. Schedules require an active term.'
              : 'A term manager needs to create a term before schedules can be displayed.'}
          </p>
        </div>
      ) : shownTerms.length === 0 ? (
        <div className="py-8 text-center text-sm text-on-surface-variant">
          No terms match these filters.
        </div>
      ) : (
        <div className="space-y-2">
          {shownTerms.map((t) => (
            <div
              key={t.termId}
              id={`term-${t.termId}`}
              className={`flex items-start justify-between gap-3 p-4 rounded-lg border transition-colors ${
                highlightedTermId === String(t.termId)
                  ? 'ring-2 ring-primary/40 '
                  : ''
              }${
                t.isActive
                  ? 'border-primary/40 bg-red-50/30'
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
                        {shortLabelFor(t.semester)}
                      </span>
                    )}
                    {t.isActive && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {fmtDateRange(t.startDate, t.endDate)}
                  </p>
                </div>
              </div>

              {canWrite && (
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {t.isActive ? (
                    <button
                      onClick={() =>
                        summaryMutation.mutate({ term: t, action: 'deactivate' })
                      }
                      disabled={
                        summaryMutation.isPending || deactivateMutation.isPending
                      }
                      className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition disabled:opacity-50"
                    >
                      {summaryBusy(t.termId, 'deactivate') ||
                      deactivateMutation.isPending
                        ? '…'
                        : 'Deactivate'}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() =>
                          summaryMutation.mutate({ term: t, action: 'activate' })
                        }
                        disabled={
                          summaryMutation.isPending || activateMutation.isPending
                        }
                        className="text-xs px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-50"
                      >
                        {summaryBusy(t.termId, 'activate') ||
                        activateMutation.isPending
                          ? '…'
                          : 'Activate'}
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

      {mode === 'compact' && terms.length > 0 && (
        <p className="text-[11px] text-on-surface-variant">
          Showing {shownTerms.length} of {terms.length} terms — open the full
          page to search and manage every term.
        </p>
      )}

      {mode === 'full' && filteredTerms.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-on-surface-variant">
            Showing {shownTerms.length} of {filteredTerms.length} terms · Page{' '}
            {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="text-xs px-3 py-1.5 rounded-lg border border-surface-variant text-on-surface hover:bg-surface-container-low transition disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="text-xs px-3 py-1.5 rounded-lg border border-surface-variant text-on-surface hover:bg-surface-container-low transition disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

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
        <div
          className="space-y-4"
          onChangeCapture={handleFieldChange}
          onBlurCapture={handleFieldBlur}
        >
          <div ref={errorSummaryRef}>
            <FormErrorSummary
              errors={errors}
              onJump={(field) => document.getElementById(field)?.focus()}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Term Name *
              </label>
              <select
                id="termName"
                value={form.termName}
                onChange={(e) => {
                  const name = e.target.value;
                  const inferred = matchSemesterType(name, types)?.code;
                  if (inferred) {
                    setErrors((prev) => clearFieldError(prev, 'semester'));
                  }
                  setForm((p) => ({
                    ...p,
                    termName: name,
                    // Auto-suggest semester when the user picks a term name.
                    semester: inferred ?? p.semester,
                  }));
                }}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                {activeTypes.map((t) => (
                  <option key={t.code} value={t.label}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Semester *
              </label>
              <select
                id="semester"
                value={form.semester}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    semester: e.target.value,
                  }))
                }
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                {options(form.semester).map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
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
                id="schoolYear"
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
                Start Date
                <span className="ml-1 font-normal normal-case tracking-normal text-on-surface-variant/70">
                  (optional)
                </span>
              </label>
              <input
                id="startDate"
                type="date"
                value={form.startDate ?? ''}
                onChange={(e) =>
                  setForm((p) => ({ ...p, startDate: e.target.value }))
                }
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                End Date
                <span className="ml-1 font-normal normal-case tracking-normal text-on-surface-variant/70">
                  (optional)
                </span>
              </label>
              <input
                id="endDate"
                type="date"
                value={form.endDate ?? ''}
                onChange={(e) =>
                  setForm((p) => ({ ...p, endDate: e.target.value }))
                }
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <p className="text-[11px] text-on-surface-variant">
            Leave a date blank if it is not known yet. If both dates are set,
            the end date must come after the start date.
          </p>

          <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.setActive ?? false}
              onChange={(e) =>
                setForm((p) => ({ ...p, setActive: e.target.checked }))
              }
              className="accent-primary"
            />
            Set as active immediately
          </label>
          <p className="text-[11px] text-on-surface-variant">
            If checked, this term becomes the active one. Any previously active
            term is automatically deactivated.
          </p>
        </div>
      </Modal>

      {/* Activate confirmation */}
      <ConfirmDialog
        open={!!activateTarget}
        onClose={() => {
          setActivateTarget(null);
          setActivateSummary(null);
        }}
        title="Activate term?"
        description={
          activateSummary ? (
            <>
              <p>
                Restore saved rows for term "{activateSummary.termName} — AY{' '}
                {activateTarget?.schoolYear}" and make it active?
              </p>
              <p className="mt-2">
                Restored rows for "{activateSummary.termName}" (draft{' '}
                {activateSummary.statusCounts.draft}, review{' '}
                {activateSummary.statusCounts.review}, finalized{' '}
                {activateSummary.statusCounts.finalized}, published{' '}
                {activateSummary.statusCounts.published}).
              </p>
              {activateSummary.otherTerm ? (
                <>
                  <p className="mt-2">
                    Saved and cleared from the currently active term "
                    {activateSummary.otherTerm.termName}" (draft{' '}
                    {activateSummary.otherTerm.statusCounts.draft}, review{' '}
                    {activateSummary.otherTerm.statusCounts.review}, finalized{' '}
                    {activateSummary.otherTerm.statusCounts.finalized}, published{' '}
                    {activateSummary.otherTerm.statusCounts.published}); its live
                    grid will be cleared.
                  </p>
                  <p className="mt-2 font-semibold text-amber-700">
                    Activating "{activateSummary.termName}" switches the timetable
                    to its restored rows.
                  </p>
                </>
              ) : (
                <p className="mt-2 font-semibold text-amber-700">
                  No other term is active, so there is no live grid to save and
                  clear before restoring "{activateSummary.termName}".
                </p>
              )}
            </>
          ) : (
            <p>Checking saved rows and the active term…</p>
          )
        }
        confirmLabel="Activate term"
        busy={summaryMutation.isPending || activateMutation.isPending}
        onConfirm={() => {
          if (activateTarget) {
            activateMutation.mutate(activateTarget.termId);
          }
        }}
      />

      {/* Deactivate confirmation */}
      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => {
          setDeactivateTarget(null);
          setDeactivateSummary(null);
        }}
        title="Deactivate term?"
        description={
          deactivateSummary ? (
            <>
              <p>
                Deactivate term "{deactivateTarget?.termName} — AY{' '}
                {deactivateTarget?.schoolYear}", which leaves no active term and
                hides the timetable until one is activated?
              </p>
              <p className="mt-2">
                Rows in this term: draft {deactivateSummary.statusCounts.draft},
                review {deactivateSummary.statusCounts.review}, finalized{' '}
                {deactivateSummary.statusCounts.finalized}, published{' '}
                {deactivateSummary.statusCounts.published}.
              </p>
              <p className="mt-2">
                Pending requests: publish{' '}
                {deactivateSummary.pendingRequests.publish}, change{' '}
                {deactivateSummary.pendingRequests.change}, unfinalize{' '}
                {deactivateSummary.pendingRequests.unfinalize}, faculty{' '}
                {deactivateSummary.pendingRequests.faculty}.
              </p>
              <p className="mt-2 font-semibold text-red-700">
                Warning: draft rows and all other rows will be saved to the term
                archive, pending requests will be closed, and the live timetable
                grid will be cleared.
              </p>
            </>
          ) : (
            <p>Checking rows and pending requests…</p>
          )
        }
        confirmLabel="Deactivate term"
        tone="danger"
        busy={summaryMutation.isPending || deactivateMutation.isPending}
        requireText="DEACTIVATE"
        onConfirm={() => {
          if (deactivateTarget) {
            deactivateMutation.mutate(deactivateTarget.termId);
          }
        }}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete term?"
        description={`Delete term "${deleteTarget?.termName} — AY ${deleteTarget?.schoolYear}", which keeps its schedules in the database but makes them inaccessible from the UI and cannot be undone?`}
        confirmLabel="Delete term"
        tone="danger"
        busy={deleteMutation.isPending}
        requireText={deleteTarget?.termName}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.termId);
          }
        }}
      />
    </div>
  );
}
