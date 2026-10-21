import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchDepartments,
  createDepartment,
  updateDepartment,
  toggleDepartmentActive,
  type Department,
  type CreateDepartmentInput,
} from '../../api/departments.api';
import {
  fetchUsers,
  updateUser,
  type UserRecord,
} from '../../api/users.api';
import { login } from '../../api/auth.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import type { RowAction } from '../../components/ui/RowActionMenu';
import { ActiveBadge } from '../../components/ui/StatusBadge';

type Mode = 'create' | 'edit';

export default function DeanDepartmentsManagePage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<Department | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    deptCode: '',
    deptName: '',
    description: '',
    headUserId: '',
  });

  const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // ALWAYS include inactive — this is the reactivation surface.
  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments', { includeInactive: true }],
    queryFn: () => fetchDepartments(true),
    enabled: !!user,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: !!user,
  });

  const eligibleHeads = useMemo(() => {
    const editingDeptId = editing?.deptId ? String(editing.deptId) : null;
    return allUsers.filter((u) => {
      if (u.role !== 'department_head') return false;
      if (!u.isActive) return false;
      const userDept = u.deptId ? String(u.deptId) : null;
      if (userDept === null) return true;
      if (editingDeptId && userDept === editingDeptId) return true;
      return false;
    });
  }, [allUsers, editing]);

  const currentHead = useMemo(() => {
    if (!editing) return null;
    return (
      allUsers.find(
        (u) =>
          u.role === 'department_head' &&
          u.isActive &&
          String(u.deptId ?? '') === String(editing.deptId),
      ) ?? null
    );
  }, [allUsers, editing]);

  // Shared invalidation — any change to a dept's active state can
  // affect schedule visibility, coverage, and every picker.
  const invalidateAfterDeptChange = () => {
    qc.invalidateQueries({ queryKey: ['departments'] });
    qc.invalidateQueries({ queryKey: ['schedules'] });
    qc.invalidateQueries({ queryKey: ['coverage'] });
    qc.invalidateQueries({ queryKey: ['unplotted-minors'] });
    qc.invalidateQueries({ queryKey: ['sections'] });
    qc.invalidateQueries({ queryKey: ['subjects'] });
    qc.invalidateQueries({ queryKey: ['faculty'] });
    qc.invalidateQueries({ queryKey: ['rooms'] });
    qc.invalidateQueries({ queryKey: ['prospectus'] });
    qc.invalidateQueries({ queryKey: ['prospectus-all'] });
    qc.invalidateQueries({ queryKey: ['programs'] });
  };

  const createMutation = useMutation({
    mutationFn: createDepartment,
    onSuccess: async (dept) => {
      if (form.headUserId) {
        try {
          await updateUser(form.headUserId, { deptId: dept.deptId });
        } catch (err) {
          setError(
            'Department created, but head assignment failed. Use the Users page to assign a head.',
          );
          invalidateAfterDeptChange();
          qc.invalidateQueries({ queryKey: ['users'] });
          closeForm();
          return;
        }
      }
      setSuccess(`Department "${dept.deptName}" created.`);
      closeForm();
      invalidateAfterDeptChange();
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to create',
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<CreateDepartmentInput>;
    }) => updateDepartment(id, input),
    onSuccess: (dept) => {
      setSuccess(`Department "${dept.deptName}" updated.`);
      closeForm();
      invalidateAfterDeptChange();
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to update',
      );
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleDepartmentActive,
    onSuccess: (dept) => {
      // Confirm the state change clearly so the Dean knows it stuck.
      setSuccess(
        dept.isActive
          ? `Department "${dept.deptName}" reactivated. Its schedules are visible again.`
          : `Department "${dept.deptName}" deactivated. Its schedules are now hidden from DHs.`,
      );
      setDeactivateTarget(null);
      setAdminPassword('');
      invalidateAfterDeptChange();
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Toggle failed'),
  });

  const handleConfirmDeactivate = async () => {
    if (!user?.email || !deactivateTarget) return;
    setIsVerifying(true);
    setVerifyError(null);
    try {
      await login({ email: user.email, password: adminPassword });
      toggleMutation.mutate(deactivateTarget);
    } catch (err: any) {
      setVerifyError(err?.response?.data?.message || 'Incorrect password');
      setIsVerifying(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const payload = {
      deptCode: form.deptCode.trim().toUpperCase(),
      deptName: form.deptName.trim(),
      description: form.description.trim() || undefined,
    };

    if (mode === 'create') {
      createMutation.mutate(payload);
    } else if (mode === 'edit' && editing) {
      updateMutation.mutate({ id: editing.deptId, input: payload });

      const currentHeadId = currentHead ? currentHead.userId : '';
      const targetHeadId = form.headUserId;
      if (currentHeadId !== targetHeadId) {
        try {
          if (currentHeadId) {
            await updateUser(currentHeadId, { deptId: null });
          }
          if (targetHeadId) {
            await updateUser(targetHeadId, { deptId: editing.deptId });
          }
          qc.invalidateQueries({ queryKey: ['users'] });
        } catch (err: any) {
          setError(
            'Department updated, but head reassignment failed. Use the Users page to fix it.',
          );
        }
      }
    }
  };

  const openCreate = () => {
    setMode('create');
    setEditing(null);
    setForm({ deptCode: '', deptName: '', description: '', headUserId: '' });
    setError(null);
    setSuccess(null);
  };

  const openEdit = (d: Department) => {
    setMode('edit');
    setEditing(d);
    const head = allUsers.find(
      (u) =>
        u.role === 'department_head' &&
        u.isActive &&
        String(u.deptId ?? '') === String(d.deptId),
    );
    setForm({
      deptCode: d.deptCode,
      deptName: d.deptName,
      description: d.description ?? '',
      headUserId: head ? head.userId : '',
    });
    setError(null);
    setSuccess(null);
  };

  const closeForm = () => {
    setMode(null);
    setEditing(null);
    setForm({ deptCode: '', deptName: '', description: '', headUserId: '' });
    setError(null);
  };

  const inactiveCount = departments.filter((d) => !d.isActive).length;

  const columns: Column<Department>[] = [
    {
      key: 'code',
      header: 'Code',
      cardVariant: 'title',
      cellClassName: 'font-bold font-mono text-primary',
      render: (d) => d.deptCode,
    },
    {
      key: 'name',
      header: 'Name',
      cardVariant: 'subtitle',
      cellClassName: 'text-on-surface font-medium',
      render: (d) => (
        <span className="inline-flex items-center gap-2">
          <span className={d.isActive ? '' : 'text-slate-500'}>
            {d.deptName}
          </span>
          {!d.isActive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
              <Icon name="block" size={9} />
              Inactive
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'head',
      header: 'Head',
      cardVariant: 'meta',
      cellClassName: 'text-xs text-on-surface-variant',
      render: (d) => {
        const head = allUsers.find(
          (u) =>
            u.role === 'department_head' &&
            u.isActive &&
            String(u.deptId ?? '') === String(d.deptId),
        );
        return head ? (
          <span className="text-on-surface">{head.username}</span>
        ) : (
          <span className="italic">Not assigned</span>
        );
      },
    },
    {
      key: 'description',
      header: 'Description',
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant max-w-xs truncate',
      render: (d) => d.description || '—',
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (d) => <ActiveBadge isActive={d.isActive} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (d: Department): RowAction[] => [
    {
      label: 'Edit',
      icon: 'edit',
      onClick: () => openEdit(d),
    },
    {
      label: d.isActive ? 'Deactivate' : 'Activate',
      icon: d.isActive ? 'toggle_off' : 'toggle_on',
      danger: d.isActive,
      onClick: () => {
        if (d.isActive) {
          setDeactivateTarget(d.deptId);
        } else {
          // Reactivation needs no password confirmation — it's additive.
          toggleMutation.mutate(d.deptId);
        }
      },
      disabled: toggleMutation.isPending,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Departments</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {departments.length} department(s)
            {inactiveCount > 0 && (
              <>
                {' · '}
                <span className="text-rose-700 font-medium">
                  {inactiveCount} deactivated
                </span>
              </>
            )}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
        >
          <Icon name="add" size={18} />
          New Department
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

      <Modal
        open={!!mode}
        onClose={closeForm}
        title={
          mode === 'create'
            ? 'Create New Department'
            : `Edit Department — ${editing?.deptCode ?? ''}`
        }
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={closeForm}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="department-form"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-6 py-2 text-sm font-semibold bg-primary text-on-primary hover:opacity-90 transition disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving…'
                : mode === 'create'
                ? 'Create Department'
                : 'Save Changes'}
            </button>
          </>
        }
      >
        <form
          id="department-form"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          {editing && !editing.isActive && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
              <Icon name="info" size={14} className="shrink-0 mt-0.5" />
              <span>
                This department is currently <strong>deactivated</strong>. Save
                changes to its details here, then close and reactivate it via
                the Activate action in the table.
              </span>
            </div>
          )}
          <div>
            <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Department Code *
            </label>
            <input
              type="text"
              name="deptCode"
              required
              value={form.deptCode}
              onChange={handleChange}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary uppercase"
              placeholder="e.g. CE, CpE, ME"
            />
            <p className="text-[10px] text-on-surface-variant mt-1">
              Stored uppercase. Must be unique.
            </p>
          </div>
          <div>
            <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Department Name *
            </label>
            <input
              type="text"
              name="deptName"
              required
              value={form.deptName}
              onChange={handleChange}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              placeholder="e.g. Civil Engineering"
            />
          </div>
          <div>
            <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Department Head
            </label>
            <select
              name="headUserId"
              value={form.headUserId}
              onChange={handleChange}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
            >
              <option value="">— none —</option>
              {eligibleHeads.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.username} ({u.email})
                </option>
              ))}
            </select>
            <p className="text-[10px] text-on-surface-variant mt-1">
              Only active DHs who aren't assigned to another department
              appear here. Create new DHs on the Users page.
            </p>
          </div>
          <div>
            <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
              Description
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={2}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary resize-none"
              placeholder="Optional"
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!deactivateTarget}
        onClose={() => {
          setDeactivateTarget(null);
          setAdminPassword('');
          setVerifyError(null);
        }}
        title="Confirm Deactivation"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setDeactivateTarget(null);
                setAdminPassword('');
                setVerifyError(null);
              }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDeactivate}
              disabled={isVerifying || !adminPassword}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
            >
              {isVerifying ? 'Verifying...' : 'Confirm'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Please enter your password to confirm this action.
          </p>
          <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <Icon name="info" size={14} className="shrink-0 mt-0.5" />
            <span>
              Deactivating a department <strong>preserves</strong> its faculty,
              rooms, subjects, and schedule history — but hides them from DH
              views and blocks new schedule changes until it's reactivated.
            </span>
          </div>
          {verifyError && (
            <div className="p-2 bg-red-100 text-red-700 text-xs">
              {verifyError}
            </div>
          )}
          <input
            type="password"
            placeholder="Admin password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </Modal>

      <ResponsiveTable
        columns={columns}
        rows={departments}
        rowKey={(d) => d.deptId}
        rowTitle={(d) => `[${d.deptCode}] ${d.deptName}`}
        rowSubtitle={(d) => d.description ?? ''}
        isLoading={isLoading}
        hasSourceRows={departments.length > 0}
        emptyMessage="No departments yet."
        noMatchMessage="No departments match your filters."
        getActions={getActions}
        onRowClick={(d) => openEdit(d)}
      />
    </div>
  );
}