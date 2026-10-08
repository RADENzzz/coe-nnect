import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchFacultyRequests,
  createFacultyRequest,
  approveFacultyRequest,
  rejectFacultyRequest,
  cancelFacultyRequest,
  type FacultyRequest,
  type FacultyRequestStatus,
} from '../../api/faculty-requests.api';
import { fetchDepartments } from '../../api/departments.api';
import { fetchActiveTerm } from '../../api/schedule.api';
import { fetchSubjects } from '../../api/subjects.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import StatusBadge from '../../components/ui/StatusBadge';
import type { RowAction } from '../../components/ui/RowActionMenu';

type FilterTab = 'all' | FacultyRequestStatus;

const STATUS_TONE: Record<
  FacultyRequestStatus,
  'warning' | 'success' | 'danger' | 'neutral'
> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const myDeptId = profile?.dept_id ? String(profile.dept_id) : '';

  const [filter, setFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'waiting-on-me' | 'waiting-on-them'>('all');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [respondTarget, setRespondTarget] = useState<{
    request: FacultyRequest;
    action: 'approve' | 'reject';
  } | null>(null);
  const [respondRemarks, setRespondRemarks] = useState('');

  const [cancelTarget, setCancelTarget] = useState<FacultyRequest | null>(null);

  const [form, setForm] = useState({
    targetDeptId: '',
    facultyId: '',
    subjectId: '',
    reason: '',
  });

  // ── Queries ──
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['faculty-requests'],
    queryFn: fetchFacultyRequests,
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: !!user,
  });

  const { data: activeTerm } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
    enabled: !!user,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => fetchSubjects(false),
    enabled: !!user && showForm,
    staleTime: 5 * 60 * 1000,
  });

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: createFacultyRequest,
    onSuccess: () => {
      setSuccess('Request submitted for approval.');
      setForm({ targetDeptId: '', facultyId: '', subjectId: '', reason: '' });
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['faculty-requests'] });
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to submit request',
      );
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, remarks }: { id: string; remarks?: string }) =>
      approveFacultyRequest(id, remarks),
    onSuccess: () => {
      setSuccess('Request approved.');
      setRespondTarget(null);
      setRespondRemarks('');
      qc.invalidateQueries({ queryKey: ['faculty-requests'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Approve failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, remarks }: { id: string; remarks: string }) =>
      rejectFacultyRequest(id, remarks),
    onSuccess: () => {
      setSuccess('Request rejected.');
      setRespondTarget(null);
      setRespondRemarks('');
      qc.invalidateQueries({ queryKey: ['faculty-requests'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Reject failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelFacultyRequest,
    onSuccess: () => {
      setSuccess('Request cancelled.');
      setCancelTarget(null);
      qc.invalidateQueries({ queryKey: ['faculty-requests'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Cancel failed'),
  });

  // ── Permissions ──
  const isAdminOrDean =
    profile?.role === 'administrator' || profile?.role === 'college_dean';

  const canRespondTo = useCallback(
    (r: FacultyRequest) => {
      if (r.status !== 'pending') return false;
      if (isAdminOrDean) return true;
      return String(profile?.dept_id) === String(r.targetDeptId);
    },
    [isAdminOrDean, profile?.dept_id],
  );

  const canCancel = useCallback(
    (r: FacultyRequest) => {
      if (r.status !== 'pending') return false;
      if (isAdminOrDean) return true;
      return String(profile?.dept_id) === String(r.requestingDeptId);
    },
    [isAdminOrDean, profile?.dept_id],
  );

  // ── Filtering ──
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requests.filter((r) => {
      // Tab
      if (filter !== 'all' && r.status !== filter) return false;

      // Scope
      if (scopeFilter === 'waiting-on-me' && !canRespondTo(r)) return false;
      if (scopeFilter === 'waiting-on-them' && !canCancel(r)) return false;

      // Search
      if (q) {
        const haystack = [
          r.requestId,
          r.facultyId ?? '',
          r.subjectId,
          r.reason,
          r.responseRemarks ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [requests, filter, searchQuery, scopeFilter, canRespondTo, canCancel]);

  // ── Counts ──
  const counts = useMemo(() => {
    const pending = requests.filter((r) => r.status === 'pending');
    return {
      total: requests.length,
      pending: pending.length,
      waitingOnMe: pending.filter(canRespondTo).length,
      waitingOnThem: pending.filter(canCancel).length,
      approved: requests.filter((r) => r.status === 'approved').length,
      rejected: requests.filter((r) => r.status === 'rejected').length,
      cancelled: requests.filter((r) => r.status === 'cancelled').length,
    };
  }, [requests, canRespondTo, canCancel]);

  // ── Handlers ──
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!activeTerm) {
      setError('No active term. Cannot create requests.');
      return;
    }
    createMutation.mutate({
      targetDeptId: form.targetDeptId,
      facultyId: form.facultyId || undefined,
      subjectId: form.subjectId,
      termId: activeTerm.termId,
      reason: form.reason,
    });
  };

  const deptName = (id: string) =>
    departments.find((d) => String(d.deptId) === String(id))?.deptCode ??
    `#${id}`;

  const subjectLabel = (id: string) => {
    const s = subjects.find((x) => String(x.subjectId) === String(id));
    return s ? `[${s.subjectCode}] ${s.title}` : `#${id}`;
  };

  // ── Columns ──
  const columns: Column<FacultyRequest>[] = [
    {
      key: 'request',
      header: 'Request',
      cardVariant: 'title',
      cellClassName: 'text-on-surface',
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-primary font-bold">
            {deptName(r.requestingDeptId)}
          </span>
          <Icon
            name="arrow_forward"
            size={14}
            className="text-on-surface-variant"
          />
          <span className="font-mono font-bold">{deptName(r.targetDeptId)}</span>
        </span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      cardVariant: 'meta',
      cellClassName: 'text-xs text-on-surface',
      render: (r) => (
        <span className="font-mono text-xs">{subjectLabel(r.subjectId)}</span>
      ),
    },
    {
      key: 'faculty',
      header: 'Faculty',
      hideOnMobile: true,
      cardVariant: 'meta',
      cellClassName: 'text-on-surface',
      render: (r) =>
        r.facultyId ? (
          <span className="font-mono text-xs">#{r.facultyId}</span>
        ) : (
          <span className="text-on-surface-variant text-xs italic">
            any
          </span>
        ),
    },
    {
      key: 'reason',
      header: 'Reason',
      cardVariant: 'subtitle',
      cellClassName: 'text-on-surface-variant max-w-md',
      render: (r) => (
        <div>
          <p className="line-clamp-2">{r.reason}</p>
          {r.responseRemarks && (
            <p className="text-xs italic mt-1 text-on-surface-variant/70">
              Response: {r.responseRemarks}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (r) => (
        <StatusBadge tone={STATUS_TONE[r.status]}>
          <span className="capitalize">{r.status}</span>
        </StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (r: FacultyRequest): RowAction[] => {
    const actions: RowAction[] = [];
    if (canRespondTo(r)) {
      actions.push({
        label: 'Approve',
        icon: 'check_circle',
        onClick: () => setRespondTarget({ request: r, action: 'approve' }),
      });
      actions.push({
        label: 'Reject',
        icon: 'cancel',
        danger: true,
        onClick: () => setRespondTarget({ request: r, action: 'reject' }),
      });
    }
    if (canCancel(r) && !canRespondTo(r)) {
      actions.push({
        label: 'Cancel Request',
        icon: 'undo',
        danger: true,
        onClick: () => setCancelTarget(r),
      });
    }
    return actions;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">
            Faculty Requests
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Cross-department faculty assignment requests
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setError(null);
            setSuccess(null);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
        >
          <Icon name="add" size={18} />
          New Request
        </button>
      </div>

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

      {/* Quick-scope split */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => setScopeFilter('all')}
          className={`p-4 rounded-xl border text-left transition ${
            scopeFilter === 'all'
              ? 'border-primary bg-primary/5'
              : 'border-surface-variant bg-surface-container-lowest hover:border-primary/40'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              All Requests
            </span>
            <Icon name="list_alt" size={16} className="text-on-surface-variant" />
          </div>
          <div className="text-2xl font-extrabold text-on-surface">
            {counts.total}
          </div>
        </button>

        <button
          onClick={() => setScopeFilter('waiting-on-me')}
          className={`p-4 rounded-xl border text-left transition ${
            scopeFilter === 'waiting-on-me'
              ? 'border-amber-400 bg-amber-50'
              : 'border-surface-variant bg-surface-container-lowest hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
              Waiting on You
            </span>
            <Icon name="pending_actions" size={16} className="text-amber-700" />
          </div>
          <div className="text-2xl font-extrabold text-amber-800">
            {counts.waitingOnMe}
          </div>
        </button>

        <button
          onClick={() => setScopeFilter('waiting-on-them')}
          className={`p-4 rounded-xl border text-left transition ${
            scopeFilter === 'waiting-on-them'
              ? 'border-blue-400 bg-blue-50'
              : 'border-surface-variant bg-surface-container-lowest hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
              Waiting on Them
            </span>
            <Icon name="hourglass_top" size={16} className="text-blue-700" />
          </div>
          <div className="text-2xl font-extrabold text-blue-800">
            {counts.waitingOnThem}
          </div>
        </button>
      </div>

      {/* Search + filter panel */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Search
            </label>
            <div className="relative">
              <Icon
                name="search"
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Subject, faculty, reason, or request ID…"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="ml-auto text-xs text-on-surface-variant whitespace-nowrap">
            Showing <strong className="text-on-surface">{filtered.length}</strong>{' '}
            of {requests.length}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-surface-variant overflow-x-auto">
          {(
            ['all', 'pending', 'approved', 'rejected', 'cancelled'] as FilterTab[]
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px whitespace-nowrap ${
                filter === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab !== 'all' && (
                <span className="ml-1.5 text-xs opacity-60">
                  ({counts[tab as keyof typeof counts]})
                </span>
              )}
              {tab === 'all' && (
                <span className="ml-1.5 text-xs opacity-60">
                  ({counts.total})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.requestId}
        rowTitle={(r) =>
          `${deptName(r.requestingDeptId)} → ${deptName(r.targetDeptId)}`
        }
        rowSubtitle={(r) => r.reason}
        isLoading={isLoading}
        hasSourceRows={requests.length > 0}
        emptyMessage={
          filter === 'all' && !searchQuery && scopeFilter === 'all'
            ? 'No requests yet.'
            : 'No requests match your filters.'
        }
        noMatchMessage="No requests match your filters."
        getActions={getActions}
      />

      {/* New request modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Create Cross-Department Request"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Target Department *
              </label>
              <select
                name="targetDeptId"
                required
                value={form.targetDeptId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Select a department…</option>
                {departments
                  .filter(
                    (d) =>
                      d.isActive &&
                      String(d.deptId) !== String(profile?.dept_id),
                  )
                  .map((d) => (
                    <option key={d.deptId} value={d.deptId}>
                      [{d.deptCode}] {d.deptName}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Preferred Faculty ID (optional)
              </label>
              <input
                type="text"
                name="facultyId"
                value={form.facultyId}
                onChange={handleChange}
                placeholder="Leave blank for any available"
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Subject *
              </label>
              <select
                name="subjectId"
                required
                value={form.subjectId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Select a subject…</option>
                {subjects.map((s) => (
                  <option key={s.subjectId} value={s.subjectId}>
                    [{s.subjectCode}] {s.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Reason *
              </label>
              <textarea
                name="reason"
                required
                rows={3}
                value={form.reason}
                onChange={handleChange}
                placeholder="e.g. Need a qualified instructor for this subject; our department is at capacity."
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-surface-variant mt-6">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {createMutation.isPending ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Respond modal */}
      <Modal
        open={!!respondTarget}
        onClose={() => {
          setRespondTarget(null);
          setRespondRemarks('');
        }}
        title={
          respondTarget?.action === 'approve'
            ? 'Approve Request'
            : 'Reject Request'
        }
        description={
          respondTarget?.action === 'approve'
            ? 'Add an optional note explaining the approval.'
            : 'A rejection requires an explanation.'
        }
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setRespondTarget(null);
                setRespondRemarks('');
              }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                approveMutation.isPending ||
                rejectMutation.isPending ||
                (respondTarget?.action === 'reject' && !respondRemarks.trim())
              }
              onClick={() => {
                if (!respondTarget) return;
                const { request, action } = respondTarget;
                if (action === 'approve') {
                  approveMutation.mutate({
                    id: request.requestId,
                    remarks: respondRemarks || undefined,
                  });
                } else {
                  rejectMutation.mutate({
                    id: request.requestId,
                    remarks: respondRemarks,
                  });
                }
              }}
              className={`px-6 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
                respondTarget?.action === 'approve'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {respondTarget?.action === 'approve' ? 'Approve' : 'Reject'}
            </button>
          </>
        }
      >
        <textarea
          rows={3}
          value={respondRemarks}
          onChange={(e) => setRespondRemarks(e.target.value)}
          placeholder={
            respondTarget?.action === 'approve'
              ? 'Optional remarks…'
              : 'Reason for rejection (required)…'
          }
          className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary resize-none"
        />
      </Modal>

      {/* Cancel confirm */}
      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel request?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Keep request
            </button>
            <button
              type="button"
              onClick={() =>
                cancelTarget && cancelMutation.mutate(cancelTarget.requestId)
              }
              disabled={cancelMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
            >
              {cancelMutation.isPending ? 'Cancelling…' : 'Cancel request'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Cancel request <strong>#{cancelTarget?.requestId}</strong>? This
          cannot be undone.
        </p>
      </Modal>
    </div>
  );
}