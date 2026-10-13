import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchUsers,
  createUser,
  updateUser,
  toggleUserActive,
  deleteUser,
  type UserRecord,
  type UserRole,
} from '../../api/users.api';
import { useAuthStore } from '../../store/auth.store';
import { fetchDepartments } from '../../api/departments.api';
import { login } from '../../api/auth.api';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import ResponsiveTable, { type Column } from '@/components/ui/ResponsiveTable';
import type { RowAction } from '@/components/ui/RowActionMenu';
import StatusBadge, { ActiveBadge } from '@/components/ui/StatusBadge';

type Mode = 'create' | 'edit';

const ROLE_TONE: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
  administrator: 'danger',
  college_dean: 'warning',
  department_head: 'info',
  viewer: 'neutral',
};

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [form, setForm] = useState({
    email: '',
    password: '',
    username: '',
    role: 'department_head' as UserRole,
    deptId: '',
    facultyId: '',
  });

  const [actionTarget, setActionTarget] = useState<{
    user: UserRecord;
    action: 'deactivate' | 'delete';
  } | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: (u) => {
      setSuccess(`User "${u.username}" created.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to create user',
      ),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: any }) =>
      updateUser(id, input),
    onSuccess: (u) => {
      setSuccess(`User "${u.username}" updated.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to update user',
      ),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleUserActive,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      closeAction();
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Toggle failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      setSuccess('User deleted.');
      qc.invalidateQueries({ queryKey: ['users'] });
      closeAction();
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Delete failed'),
  });

  const closeForm = () => {
    setMode(null);
    setEditing(null);
    setForm({
      email: '',
      password: '',
      username: '',
      role: 'department_head',
      deptId: '',
      facultyId: '',
    });
    setError(null);
  };

  const closeAction = () => {
    setActionTarget(null);
    setAdminPassword('');
    setVerifyError(null);
    setIsVerifying(false);
  };

  const openCreate = () => {
    setMode('create');
    setEditing(null);
    setForm({
      email: '',
      password: '',
      username: '',
      role: 'department_head',
      deptId: '',
      facultyId: '',
    });
    setError(null);
    setSuccess(null);
  };

  const openEdit = (u: UserRecord) => {
    setMode('edit');
    setEditing(u);
    setForm({
      email: u.email,
      password: '',
      username: u.username,
      role: u.role,
      deptId: u.deptId ?? '',
      facultyId: u.facultyId ?? '',
    });
    setError(null);
    setSuccess(null);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const isDeptHead = form.role === 'department_head';
    if (isDeptHead && !form.deptId) {
      setError('Department Heads must be assigned to a department.');
      return;
    }

    if (mode === 'create') {
      const isEmailTaken = users.some((u) => u.email === form.email);
      const isUsernameTaken = users.some((u) => u.username === form.username);
      if (isEmailTaken) {
        setError('This email is already in use.');
        return;
      }
      if (isUsernameTaken) {
        setError('This username is already taken.');
        return;
      }

      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!passwordRegex.test(form.password)) {
        setError(
          'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.',
        );
        return;
      }

      createMutation.mutate({
        email: form.email,
        password: form.password,
        username: form.username,
        role: form.role,
        deptId: form.deptId || undefined,
        facultyId: form.facultyId || undefined,
      });
    } else if (mode === 'edit' && editing) {
      const payload: any = {};
      if (form.username !== editing.username) payload.username = form.username;
      if (form.role !== editing.role) payload.role = form.role;
      if ((form.deptId || null) !== editing.deptId)
        payload.deptId = form.deptId || null;
      if ((form.facultyId || null) !== editing.facultyId)
        payload.facultyId = form.facultyId || null;

      if (Object.keys(payload).length === 0) {
        setError('No changes to save.');
        return;
      }

      updateMutation.mutate({ id: editing.userId, input: payload });
    }
  };

  const handleConfirmAction = async () => {
    if (!user?.email || !actionTarget) return;
    setIsVerifying(true);
    setVerifyError(null);
    try {
      await login({ email: user.email, password: adminPassword });
      if (actionTarget.action === 'deactivate') {
        toggleMutation.mutate(actionTarget.user.userId);
      } else {
        deleteMutation.mutate(actionTarget.user.userId);
      }
    } catch (err: any) {
      setVerifyError(err?.response?.data?.message || 'Incorrect password');
      setIsVerifying(false);
    }
  };

  const deptName = (id: string | null) => {
    if (!id) return '—';
    const d = departments.find((x) => String(x.deptId) === String(id));
    return d ? `[${d.deptCode}] ${d.deptName}` : `Dept #${id}`;
  };

  const visibleUsers = useMemo(
    () => users.filter((u) => u.role !== 'administrator'),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleUsers.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.employeeId ?? '').toLowerCase().includes(q) ||
        (u.wmsuId ?? '').toLowerCase().includes(q)
      );
    });
  }, [visibleUsers, searchQuery, roleFilter]);

  const columns: Column<UserRecord>[] = [
    {
      key: 'user',
      header: 'User',
      cardVariant: 'title',
      cellClassName: 'text-on-surface font-medium',
      render: (u) => u.username,
    },
    {
      key: 'email',
      header: 'Email',
      cardVariant: 'subtitle',
      cellClassName: 'text-on-surface-variant text-xs',
      render: (u) => u.email,
    },
    {
      key: 'role',
      header: 'Role',
      cardVariant: 'badge',
      render: (u) => (
        <StatusBadge tone={ROLE_TONE[u.role] ?? 'neutral'}>
          <span className="capitalize">{u.role.replace('_', ' ')}</span>
        </StatusBadge>
      ),
    },
    {
      key: 'dept',
      header: 'Department',
      cardVariant: 'meta',
      cellClassName: 'text-on-surface-variant text-xs font-medium',
      render: (u) => deptName(u.deptId),
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (u) => <ActiveBadge isActive={u.isActive} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (u: UserRecord): RowAction[] => [
    { label: 'Edit', icon: 'edit', onClick: () => openEdit(u) },
    {
      label: u.isActive ? 'Deactivate' : 'Activate',
      icon: u.isActive ? 'toggle_off' : 'toggle_on',
      onClick: () => setActionTarget({ user: u, action: 'deactivate' }),
    },
    {
      label: 'Delete',
      icon: 'delete',
      danger: true,
      onClick: () => setActionTarget({ user: u, action: 'delete' }),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Users</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {visibleUsers.length} user account(s) registered
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
        >
          <Icon name="person_add" size={18} />
          New User
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

      <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
        <div className="flex-1 min-w-[220px]">
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
              placeholder="Name, email, employee ID, or WMSU ID…"
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="min-w-[160px]">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
            Role
          </label>
          <select
            value={roleFilter}
            onChange={(e) =>
              setRoleFilter(e.target.value as 'all' | UserRole)
            }
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            <option value="all">All roles</option>
            <option value="administrator">Administrator</option>
            <option value="college_dean">College Dean</option>
            <option value="department_head">Department Head</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        {(searchQuery || roleFilter !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setRoleFilter('all');
            }}
            className="text-xs px-3 py-2 rounded-lg border border-surface-variant text-on-surface-variant hover:bg-surface-container-low transition"
          >
            Clear
          </button>
        )}
        <div className="ml-auto text-xs text-on-surface-variant">
          Showing <strong className="text-on-surface">{filteredUsers.length}</strong> of{' '}
          {visibleUsers.length}
        </div>
      </div>

      <ResponsiveTable
        columns={columns}
        rows={filteredUsers}
        rowKey={(u) => u.userId}
        rowTitle={(u) => u.username}
        rowSubtitle={(u) => u.email}
        isLoading={isLoading}
        hasSourceRows={visibleUsers.length > 0}
        emptyMessage="No users yet."
        noMatchMessage="No users match your filters."
        getActions={getActions}
      />

      <Modal
        open={!!mode}
        onClose={closeForm}
        title={
          mode === 'create'
            ? 'Create User'
            : `Edit User — ${editing?.username}`
        }
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mode === 'create' && (
              <>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                    placeholder="head@wmsu.edu.ph"
                  />
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Password *
                  </label>
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={8}
                    value={form.password}
                    onChange={handleChange}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                    placeholder="Must be strong"
                  />
                  <p className="text-[10px] text-on-surface-variant mt-1 leading-tight">
                    Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol.
                  </p>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Username *
              </label>
              <input
                type="text"
                name="username"
                required
                value={form.username}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                placeholder="head.ce"
              />
            </div>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Role *
              </label>
              <select
                name="role"
                required
                value={form.role}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                <option value="department_head">Department Head</option>
                <option value="college_dean">College Dean</option>
                <option value="administrator">Administrator</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Department {form.role === 'department_head' ? '*' : '(optional)'}
              </label>
              <select
                name="deptId"
                required={form.role === 'department_head'}
                value={form.deptId}
                onChange={handleChange}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
              >
                <option value="">— none —</option>
                {departments
                  .filter((d) => d.isActive)
                  .map((d) => (
                    <option key={d.deptId} value={d.deptId}>
                      [{d.deptCode}] {d.deptName}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-surface-variant mt-6">
            <button
              type="button"
              onClick={closeForm}
              className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : mode === 'create'
                ? 'Create User'
                : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!actionTarget}
        onClose={closeAction}
        title={
          actionTarget?.action === 'delete'
            ? 'Confirm deletion'
            : 'Confirm deactivation'
        }
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={closeAction}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmAction}
              disabled={isVerifying || !adminPassword}
              className={`px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
                actionTarget?.action === 'delete'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {isVerifying
                ? 'Verifying...'
                : actionTarget?.action === 'delete'
                ? 'Delete'
                : 'Deactivate'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            User:{' '}
            <strong>{actionTarget?.user.username}</strong> (
            {actionTarget?.user.email})
          </p>
          <p className="text-xs text-slate-500">
            {actionTarget?.action === 'delete'
              ? 'This will permanently delete the account. Cannot be undone.'
              : 'This will disable the account until reactivated.'}
          </p>
          {verifyError && (
            <div className="p-2 bg-red-100 text-red-700 text-xs">
              {verifyError}
            </div>
          )}
          <input
            type="password"
            placeholder="Your admin password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:border-primary"
          />
        </div>
      </Modal>
    </div>
  );
}