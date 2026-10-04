import { useState } from 'react';
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
import { fetchSections } from '../../api/sections.api';
import { fetchActiveTerm } from '../../api/schedule.api';
import Icon from '../../components/ui/Icon';

type FilterTab = 'all' | FacultyRequestStatus;

function StatusBadge({ status }: { status: FacultyRequestStatus }) {
  const styles: Record<FacultyRequestStatus, string> = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    cancelled: 'bg-slate-100 text-slate-600',
  };
  return (
    <span
      className={`text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const [filter, setFilter] = useState<FilterTab>('all');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [respondTarget, setRespondTarget] = useState<{
    request: FacultyRequest;
    action: 'approve' | 'reject';
  } | null>(null);
  const [respondRemarks, setRespondRemarks] = useState('');

  const [form, setForm] = useState({
    targetDeptId: '',
    facultyId: '',
    subjectId: '',
    reason: '',
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['faculty-requests'],
    queryFn: fetchFacultyRequests,
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: !!user && showForm,
  });

  const { data: activeTerm } = useQuery({
    queryKey: ['active-term'],
    queryFn: fetchActiveTerm,
    enabled: !!user && showForm,
  });

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
      qc.invalidateQueries({ queryKey: ['faculty-requests'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Cancel failed'),
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
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

  const filtered =
    filter === 'all' ? requests : requests.filter((r) => r.status === filter);

  const isAdminOrDean =
    profile?.role === 'administrator' || profile?.role === 'college_dean';

  const canRespondTo = (r: FacultyRequest) => {
    if (r.status !== 'pending') return false;
    if (isAdminOrDean) return true;
    return String(profile?.dept_id) === String(r.targetDeptId);
  };

  const canCancel = (r: FacultyRequest) => {
    if (r.status !== 'pending') return false;
    if (isAdminOrDean) return true;
    return String(profile?.dept_id) === String(r.requestingDeptId);
  };

  const deptName = (id: string) =>
    departments.find((d) => d.deptId === id)?.deptCode ?? `#${id}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Faculty Requests</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Cross-department faculty assignment requests
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm);
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

      {/* Filter tabs */}
      <div className="flex gap-2 border-b border-surface-variant">
        {(['all', 'pending', 'approved', 'rejected', 'cancelled'] as FilterTab[]).map(
          (tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
                filter === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab !== 'all' && (
                <span className="ml-1.5 text-xs opacity-60">
                  ({requests.filter((r) => r.status === tab).length})
                </span>
              )}
            </button>
          ),
        )}
      </div>

      {/* New request form */}
      {showForm && (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-6">
          <h2 className="text-base font-semibold text-on-surface mb-4">
            Create Cross-Department Request
          </h2>
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
                  placeholder="Leave blank for any available faculty"
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Subject ID *
                </label>
                <input
                  type="text"
                  name="subjectId"
                  required
                  value={form.subjectId}
                  onChange={handleChange}
                  placeholder="e.g. 5"
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                />
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
            <div className="flex gap-3 justify-end">
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
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-variant text-on-surface-variant text-xs uppercase tracking-wider">
              <th className="text-left px-5 py-3">Request</th>
              <th className="text-left px-5 py-3">Faculty</th>
              <th className="text-left px-5 py-3">Reason</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-8 text-center text-on-surface-variant"
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-12 text-center text-on-surface-variant"
                >
                  No {filter === 'all' ? '' : filter} requests.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.requestId}
                  className="border-b border-white/5 hover:bg-surface-container-low align-top"
                >
                  <td className="px-5 py-3.5">
                    <p className="text-xs text-on-surface-variant mb-0.5">
                      #{r.requestId}
                    </p>
                    <p className="text-on-surface">
                      <span className="font-mono text-primary font-bold">
                        {deptName(r.requestingDeptId)}
                      </span>
                      <Icon
                        name="arrow_forward"
                        size={14}
                        className="mx-1.5 text-on-surface-variant"
                      />
                      <span className="font-mono font-bold">
                        {deptName(r.targetDeptId)}
                      </span>
                    </p>
                  </td>
                  <td className="px-5 py-3.5 text-on-surface">
                    {r.facultyId ? (
                      <span className="font-mono text-sm">#{r.facultyId}</span>
                    ) : (
                      <span className="text-on-surface-variant text-xs italic">
                        any available
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-on-surface-variant max-w-md">
                    <p className="line-clamp-2">{r.reason}</p>
                    {r.responseRemarks && (
                      <p className="text-xs italic mt-1 text-on-surface-variant/70">
                        Response: {r.responseRemarks}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-5 py-3.5 text-right space-x-2 whitespace-nowrap">
                    {canRespondTo(r) && (
                      <>
                        <button
                          onClick={() =>
                            setRespondTarget({ request: r, action: 'approve' })
                          }
                          className="text-xs px-3 py-1 rounded-lg border border-green-300 text-green-700 hover:bg-green-100 transition"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() =>
                            setRespondTarget({ request: r, action: 'reject' })
                          }
                          className="text-xs px-3 py-1 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 transition"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {canCancel(r) && !canRespondTo(r) && (
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              'Cancel this request? This cannot be undone.',
                            )
                          ) {
                            cancelMutation.mutate(r.requestId);
                          }
                        }}
                        className="text-xs px-3 py-1 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                      >
                        Cancel
                      </button>
                    )}
                    {r.status !== 'pending' && (
                      <span className="text-xs text-on-surface-variant">
                        No actions
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Respond modal */}
      {respondTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setRespondTarget(null)}
          />
          <div className="relative w-full max-w-md bg-surface-container-lowest rounded-xl shadow-2xl border border-surface-variant p-6">
            <h3 className="text-lg font-bold text-on-surface mb-1">
              {respondTarget.action === 'approve' ? 'Approve' : 'Reject'} Request
            </h3>
            <p className="text-xs text-on-surface-variant mb-4">
              {respondTarget.action === 'approve'
                ? 'Add an optional note explaining the approval.'
                : 'A rejection requires an explanation.'}
            </p>
            <textarea
              rows={3}
              value={respondRemarks}
              onChange={(e) => setRespondRemarks(e.target.value)}
              placeholder={
                respondTarget.action === 'approve'
                  ? 'Optional remarks…'
                  : 'Reason for rejection (required)…'
              }
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary resize-none"
            />
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => {
                  setRespondTarget(null);
                  setRespondRemarks('');
                }}
                className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low transition"
              >
                Cancel
              </button>
              <button
                disabled={
                  approveMutation.isPending || rejectMutation.isPending
                }
                onClick={() => {
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
                className={`px-6 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 ${
                  respondTarget.action === 'approve'
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {respondTarget.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}