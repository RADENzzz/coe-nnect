import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchDepartments,
  createDepartment,
  toggleDepartmentActive,
  type Department,
} from '../../api/departments.api';
import { login } from '../../api/auth.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import type { RowAction } from '../../components/ui/RowActionMenu';
import { ActiveBadge } from '../../components/ui/StatusBadge';

export default function AdminDepartmentsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    deptCode: '',
    deptName: '',
    description: '',
  });

  const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: createDepartment,
    onSuccess: (dept) => {
      setSuccess(`Department "${dept.deptName}" created.`);
      setForm({ deptCode: '', deptName: '', description: '' });
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to create',
      );
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleDepartmentActive,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      setDeactivateTarget(null);
      setAdminPassword('');
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
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    createMutation.mutate({
      deptCode: form.deptCode.toUpperCase(),
      deptName: form.deptName,
      description: form.description || undefined,
    });
  };

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
      render: (d) => d.deptName,
    },
    {
      key: 'id',
      header: 'ID',
      cardVariant: 'hideOnMobile' as any,
      hideOnMobile: true,
      cellClassName: 'text-on-surface-variant font-mono',
      render: (d) => String(d.deptId),
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
      label: d.isActive ? 'Deactivate' : 'Activate',
      icon: d.isActive ? 'toggle_off' : 'toggle_on',
      danger: d.isActive,
      onClick: () => {
        if (d.isActive) {
          setDeactivateTarget(d.deptId);
        } else {
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
            {departments.length} department(s) registered
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
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Create New Department"
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
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
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              placeholder="e.g. CE, CpE, ME"
            />
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
              {createMutation.isPending ? 'Creating...' : 'Create Department'}
            </button>
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
      />
    </div>
  );
}