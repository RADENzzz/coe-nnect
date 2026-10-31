import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  createProgram,
  fetchAllPrograms,
  toggleProgramActive,
  updateProgram,
  type CreateProgramInput,
  type ProgramRecord,
} from '../../api/programs.api';
import { fetchDepartments } from '../../api/departments.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, {
  type Column,
} from '../../components/ui/ResponsiveTable';
import type { RowAction } from '../../components/ui/RowActionMenu';
import { ActiveBadge } from '../../components/ui/StatusBadge';

type Mode = 'create' | 'edit';
type StatusFilter = 'all' | 'active' | 'inactive';

interface FormState {
  programCode: string;
  programName: string;
  deptId: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  programCode: '',
  programName: '',
  deptId: '',
  isActive: true,
};

/**
 * Extract the server's message from a failed mutation. NestJS returns
 * `{ message: string | string[], error, statusCode }`.
 */
function extractErrorMessage(err: any, fallback: string): string {
  const raw = err?.response?.data?.message;
  if (Array.isArray(raw)) return raw[0] ?? fallback;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return err?.message ?? fallback;
}

const inputClass = (hasError: boolean) =>
  `w-full rounded-lg border px-3 py-2 text-sm bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 ${
    hasError ? 'border-red-400' : 'border-surface-variant'
  }`;

/**
 * Degree program management.
 *
 * Programs are the parent of subjects (via the prospectus) and sections,
 * so an empty program list blocks the whole academic-structure workflow.
 * Shared by `/programs` (department head) and `/dean/programs` (dean).
 */
export default function ProgramsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const role = profile?.role;
  const isDH = role === 'department_head';
  const isDean = role === 'college_dean' || role === 'administrator';
  const canManage = isDH || isDean;
  const myDeptId = profile?.dept_id != null ? String(profile.dept_id) : null;

  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<ProgramRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: programs = [], isLoading } = useQuery({
    queryKey: ['programs', { includeInactive: true }],
    queryFn: fetchAllPrograms,
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments', { includeInactive: true }],
    queryFn: () => fetchDepartments(true),
    enabled: !!user,
  });

  const deptById = useMemo(() => {
    const map = new Map<
      string,
      { deptCode: string; deptName: string; isActive: boolean }
    >();
    for (const d of departments) {
      map.set(String(d.deptId), {
        deptCode: d.deptCode,
        deptName: d.deptName,
        isActive: d.isActive,
      });
    }
    return map;
  }, [departments]);

  // Department heads only ever see their own department's programs.
  const scopedPrograms = useMemo(() => {
    if (!isDH) return programs;
    if (!myDeptId) return [];
    return programs.filter((p) => String(p.deptId) === myDeptId);
  }, [programs, isDH, myDeptId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedPrograms.filter((p) => {
      if (deptFilter && String(p.deptId) !== deptFilter) return false;
      if (statusFilter === 'active' && !p.isActive) return false;
      if (statusFilter === 'inactive' && p.isActive) return false;
      if (!q) return true;
      const dept = deptById.get(String(p.deptId));
      return (
        p.programCode.toLowerCase().includes(q) ||
        p.programName.toLowerCase().includes(q) ||
        (dept?.deptCode ?? '').toLowerCase().includes(q) ||
        (dept?.deptName ?? '').toLowerCase().includes(q)
      );
    });
  }, [scopedPrograms, search, deptFilter, statusFilter, deptById]);

  const stats = useMemo(() => {
    let active = 0;
    for (const p of scopedPrograms) if (p.isActive) active++;
    return {
      total: scopedPrograms.length,
      active,
      inactive: scopedPrograms.length - active,
    };
  }, [scopedPrograms]);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const invalidateAfterProgramChange = () => {
    qc.invalidateQueries({ queryKey: ['programs'] });
    qc.invalidateQueries({ queryKey: ['prospectus'] });
    qc.invalidateQueries({ queryKey: ['sections'] });
  };

  const createMutation = useMutation({
    mutationFn: createProgram,
    onSuccess: (p) => {
      setSuccess(`Program "${p.programCode}" created. You can now import a prospectus or add sections.`);
      closeForm();
      invalidateAfterProgramChange();
    },
    onError: (err: any) =>
      setError(extractErrorMessage(err, 'Failed to create program')),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<CreateProgramInput>;
    }) => updateProgram(id, input),
    onSuccess: (p) => {
      setSuccess(`Program "${p.programCode}" updated.`);
      closeForm();
      invalidateAfterProgramChange();
    },
    onError: (err: any) =>
      setError(extractErrorMessage(err, 'Failed to update program')),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleProgramActive,
    onSuccess: (p) => {
      setSuccess(
        p.isActive
          ? `Program "${p.programCode}" reactivated.`
          : `Program "${p.programCode}" deactivated. It no longer appears in pickers.`,
      );
      invalidateAfterProgramChange();
    },
    onError: (err: any) =>
      setError(extractErrorMessage(err, 'Failed to update status')),
  });

  const closeForm = () => {
    setMode(null);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
  };

  const openCreate = () => {
    setMode('create');
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      deptId: isDH && myDeptId ? myDeptId : '',
    });
    setFieldErrors({});
    setError(null);
  };

  const openEdit = (program: ProgramRecord) => {
    if (isDH && myDeptId && String(program.deptId) !== myDeptId) return;
    setMode('edit');
    setEditing(program);
    setForm({
      programCode: program.programCode,
      programName: program.programName,
      deptId: String(program.deptId),
      isActive: program.isActive,
    });
    setFieldErrors({});
    setError(null);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : value,
    }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.programCode.trim()) errs.programCode = 'Program code is required';
    if (!form.programName.trim()) errs.programName = 'Program name is required';
    if (!form.deptId) errs.deptId = 'Department is required';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload: CreateProgramInput = {
      programCode: form.programCode.trim().toUpperCase(),
      programName: form.programName.trim(),
      deptId: form.deptId,
      isActive: form.isActive,
    };

    if (mode === 'create') createMutation.mutate(payload);
    else if (mode === 'edit' && editing)
      updateMutation.mutate({ id: editing.programId, input: payload });
  };

  const deptOptions = useMemo(() => {
    return departments.filter((d) => {
      if (isDH) return String(d.deptId) === myDeptId;
      // Keep the current (possibly deactivated) dept visible while editing
      // so the select doesn't silently jump to another value.
      return d.isActive || String(d.deptId) === form.deptId;
    });
  }, [departments, isDH, myDeptId, form.deptId]);

  const columns: Column<ProgramRecord>[] = [
    {
      key: 'code',
      header: 'Code',
      cardVariant: 'title',
      cellClassName: 'font-bold font-mono text-primary',
      render: (p) => p.programCode,
    },
    {
      key: 'name',
      header: 'Program Name',
      cardVariant: 'subtitle',
      cellClassName: 'text-on-surface',
      render: (p) => p.programName,
    },
    {
      key: 'dept',
      header: 'Department',
      cardVariant: 'meta',
      cellClassName: 'text-xs',
      render: (p) => {
        const dept = deptById.get(String(p.deptId));
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono font-bold text-[11px] border ${
              dept?.isActive === false
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-slate-50 text-slate-700 border-slate-200'
            }`}
            title={dept?.isActive === false ? 'Department is deactivated' : undefined}
          >
            {dept?.isActive === false && <Icon name="lock" size={9} />}
            {dept?.deptCode ?? `#${p.deptId}`}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (p) => <ActiveBadge isActive={p.isActive} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: () => null,
    },
  ];

  const getActions = (program: ProgramRecord): RowAction[] => {
    if (!canManage) return [];
    return [
      { label: 'Edit', icon: 'edit', onClick: () => openEdit(program) },
      { divider: true },
      {
        label: program.isActive ? 'Deactivate' : 'Activate',
        icon: program.isActive ? 'toggle_off' : 'toggle_on',
        loading:
          toggleMutation.isPending &&
          toggleMutation.variables === program.programId,
        onClick: () => toggleMutation.mutate(program.programId),
      },
    ];
  };

  const formBusy = createMutation.isPending || updateMutation.isPending;
  const hasFilters =
    !!search.trim() || !!deptFilter || statusFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setDeptFilter('');
    setStatusFilter('all');
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3" data-tour="programs-header">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Programs</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Degree programs that subjects, prospectuses, and sections belong to.
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition shadow-sm"
          >
            <Icon name="add" size={18} />
            New Program
          </button>
        )}
      </div>

      {/* ── Workflow hint ── */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3 text-sm" data-tour="programs-workflow">
        <Icon name="info" size={18} className="text-blue-700 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-blue-900 font-medium">
            Step 1 of 3 — Academic Structure
          </p>
          <p className="text-blue-800 text-xs mt-0.5">
            Create a program first. Then add subjects on the Subjects page (or
            import a prospectus, which creates missing subjects for you), and
            finally create class sections for the program.
          </p>
        </div>
        {!isDean && (
          <Link
            to="/subjects"
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap flex items-center gap-1"
          >
            Go to Subjects
            <Icon name="arrow_forward" size={14} />
          </Link>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Programs" value={stats.total} icon="school" tone="neutral" />
        <StatCard label="Active" value={stats.active} icon="check_circle" tone="green" />
        <StatCard
          label="Inactive"
          value={stats.inactive}
          icon="toggle_off"
          tone={stats.inactive > 0 ? 'rose' : 'neutral'}
        />
      </div>

      {/* ── Banners ── */}
      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm flex items-start gap-2">
          <Icon name="error" size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800"
            aria-label="Dismiss error"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 text-sm flex items-start gap-2">
          <Icon name="check_circle" size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{success}</span>
          <button
            onClick={() => setSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900"
            aria-label="Dismiss"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {isDH && !myDeptId && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm flex items-start gap-2">
          <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
          <span>
            Your account is not assigned to a department, so you cannot create
            programs. Ask the college dean to assign you to one.
          </span>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Icon
            name="search"
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, name, or department…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-surface-variant bg-surface-container-lowest text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Search programs"
          />
        </div>

        {!isDH && (
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Filter by department"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.deptId} value={d.deptId}>
                [{d.deptCode}] {d.deptName}
                {d.isActive ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        )}

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs font-semibold text-on-surface-variant hover:text-on-surface flex items-center gap-1"
          >
            <Icon name="filter_alt_off" size={14} />
            Clear
          </button>
        )}

        <span className="text-xs text-on-surface-variant ml-auto">
          {filtered.length} of {scopedPrograms.length}
        </span>
      </div>

      {/* ── Table ── */}
      <div data-tour="programs-table">
        <ResponsiveTable
          columns={columns}
          rows={filtered}
          rowKey={(p) => p.programId}
          rowTitle={(p) => p.programCode}
          rowSubtitle={(p) => p.programName}
          isLoading={isLoading}
          hasSourceRows={scopedPrograms.length > 0}
          emptyMessage={
            isDH
              ? 'No programs in your department yet.'
              : 'No programs yet.'
          }
          noMatchMessage="No programs match your filters."
          getActions={getActions}
          onRowClick={canManage ? openEdit : undefined}
          emptyIcon="school"
          emptyAction={
            canManage && (!isDH || myDeptId !== null) ? (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
              >
                <Icon name="add" size={16} />
                Add first program
              </button>
            ) : undefined
          }
        />
      </div>

      {/* ── Create / Edit modal ── */}
      <Modal
        open={!!mode}
        onClose={() => closeForm()}
        title={
          mode === 'create'
            ? 'Create Program'
            : `Edit Program — ${editing?.programCode ?? ''}`
        }
        description={
          mode === 'create'
            ? 'Programs unlock prospectus imports and section creation.'
            : 'Update this program’s code, name, or department.'
        }
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="program-code"
                className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider"
              >
                Program Code <span className="text-red-500">*</span>
              </label>
              <input
                id="program-code"
                type="text"
                name="programCode"
                value={form.programCode}
                onChange={handleChange}
                placeholder="e.g. BS CPE"
                autoComplete="off"
                className={inputClass(!!fieldErrors.programCode)}
              />
              {fieldErrors.programCode ? (
                <p className="text-[11px] text-red-600 mt-1">
                  {fieldErrors.programCode}
                </p>
              ) : (
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Saved in uppercase. Must be unique.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="program-dept"
                className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider"
              >
                Department <span className="text-red-500">*</span>
              </label>
              <select
                id="program-dept"
                name="deptId"
                value={form.deptId}
                onChange={handleChange}
                disabled={isDH}
                className={`${inputClass(!!fieldErrors.deptId)} disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                <option value="">Select a department…</option>
                {deptOptions.map((d) => (
                  <option key={d.deptId} value={d.deptId}>
                    [{d.deptCode}] {d.deptName}
                    {d.isActive ? '' : ' (inactive)'}
                  </option>
                ))}
              </select>
              {fieldErrors.deptId ? (
                <p className="text-[11px] text-red-600 mt-1">
                  {fieldErrors.deptId}
                </p>
              ) : isDH ? (
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Locked to your department.
                </p>
              ) : null}
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="program-name"
                className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider"
              >
                Program Name <span className="text-red-500">*</span>
              </label>
              <input
                id="program-name"
                type="text"
                name="programName"
                value={form.programName}
                onChange={handleChange}
                placeholder="e.g. BS Computer Engineering"
                autoComplete="off"
                className={inputClass(!!fieldErrors.programName)}
              />
              {fieldErrors.programName && (
                <p className="text-[11px] text-red-600 mt-1">
                  {fieldErrors.programName}
                </p>
              )}
            </div>
          </div>

          {mode === 'edit' && (
            <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-surface-variant bg-surface-container-low p-3 hover:bg-surface-container transition">
              <input
                type="checkbox"
                name="isActive"
                checked={form.isActive}
                onChange={handleChange}
                className="accent-[#5c1219] w-4 h-4 mt-0.5"
              />
              <div className="flex-1">
                <span className="text-sm font-semibold text-on-surface">
                  Active
                </span>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  Inactive programs disappear from the prospectus import,
                  subjects, and sections pickers. Existing data is kept.
                </p>
              </div>
            </label>
          )}

          {mode === 'create' && (
            <div className="rounded-lg p-3 text-xs flex items-start gap-2 bg-surface-container-low border border-surface-variant">
              <Icon
                name="info"
                size={14}
                className="shrink-0 mt-0.5 text-amber-600"
              />
              <span className="text-on-surface-variant">
                After saving, the program immediately appears in the Import
                Prospectus and Sections dropdowns.
              </span>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-4 border-t border-surface-variant">
            <button
              type="button"
              onClick={() => closeForm()}
              disabled={formBusy}
              className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formBusy}
              className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
            >
              {formBusy && (
                <Icon
                  name="progress_activity"
                  size={14}
                  className="animate-spin"
                />
              )}
              {formBusy
                ? 'Saving…'
                : mode === 'create'
                  ? 'Create Program'
                  : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const STAT_TONES = {
  neutral: 'bg-surface-container-low text-on-surface',
  green: 'bg-emerald-50 text-emerald-900',
  rose: 'bg-rose-50 text-rose-900',
} as const;

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: string;
  tone: keyof typeof STAT_TONES;
}) {
  return (
    <div
      className={`rounded-xl border border-surface-variant p-4 ${STAT_TONES[tone]}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider opacity-70">
          {label}
        </span>
        <Icon name={icon} size={16} className="opacity-60" />
      </div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
