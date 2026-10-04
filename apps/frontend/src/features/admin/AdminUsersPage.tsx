import React, { useState } from 'react';
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

type Mode = 'create' | 'edit';

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      // Only send changed fields
      const payload: any = {};
      if (form.username !== editing.username) payload.username = form.username;
      if (form.role !== editing.role) payload.role = form.role;
      if ((form.deptId || null) !== editing.deptId) payload.deptId = form.deptId || null;
      if ((form.facultyId || null) !== editing.facultyId) payload.facultyId = form.facultyId || null;

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

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      administrator: 'bg-red-100 text-red-700',
      college_dean: 'bg-yellow-100 text-yellow-700',
      department_head: 'bg-blue-100 text-blue-700',
      viewer: 'bg-slate-100 text-slate-600',
    };
    return map[role] || 'bg-slate-100 text-slate-600';
  };

  const deptName = (id: string | null) => {
    if (!id) return '—';
    const d = departments.find((x) => String(x.deptId) === String(id));
    return d ? `[${d.deptCode}] ${d.deptName}` : `Dept #${id}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Users</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {users.length} user account(s) registered
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
        >
          <span className="material-symbols-outlined text-base">person_add</span>
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

      {/* Create / Edit Modal */}
      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-on-surface mb-4">
              {mode === 'create' ? 'Create User' : `Edit User — ${editing?.username}`}
            </h2>
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
                        className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary transition"
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
                        className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary transition"
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
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary transition"
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
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary transition"
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
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary transition"
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
          </div>
        </div>
      )}

      {/* Deactivate / Delete confirmation */}
      {actionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-xl">
            <h2
              className={`text-lg font-bold mb-2 ${
                actionTarget.action === 'delete' ? 'text-red-600' : 'text-amber-600'
              }`}
            >
              Confirm {actionTarget.action === 'delete' ? 'Deletion' : 'Deactivation'}
            </h2>
            <p className="text-sm text-on-surface-variant mb-1">
              User: <strong>{actionTarget.user.username}</strong> ({actionTarget.user.email})
            </p>
            <p className="text-xs text-on-surface-variant mb-4">
              {actionTarget.action === 'delete'
                ? 'This will permanently delete the account. Cannot be undone.'
                : 'This will disable the account until reactivated.'}
            </p>
            {verifyError && (
              <div className="mb-4 p-2 bg-red-100 text-red-700 text-xs rounded-lg">
                {verifyError}
              </div>
            )}
            <input
              type="password"
              placeholder="Your admin password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:border-red-500 transition mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={closeAction}
                className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-low rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={isVerifying || !adminPassword}
                className={`px-4 py-2 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50 ${
                  actionTarget.action === 'delete'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {isVerifying
                  ? 'Verifying...'
                  : actionTarget.action === 'delete'
                  ? 'Delete'
                  : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-variant text-on-surface-variant text-xs uppercase tracking-wider">
              <th className="text-left px-5 py-3">User</th>
              <th className="text-left px-5 py-3">Role</th>
              <th className="text-left px-5 py-3">Department</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-on-surface-variant">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-on-surface-variant">
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.userId} className="border-b border-white/5 hover:bg-surface-container-low">
                  <td className="px-5 py-3.5">
                    <p className="text-on-surface font-medium">{u.username}</p>
                    <p className="text-on-surface-variant text-xs">{u.email}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${roleBadge(u.role)}`}
                    >
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-on-surface-variant text-xs font-medium">
                    {deptName(u.deptId)}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => openEdit(u)}
                      className="text-xs px-3 py-1 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setActionTarget({ user: u, action: 'deactivate' })}
                      className={`text-xs px-3 py-1 rounded-lg border transition ${
                        u.isActive
                          ? 'border-amber-300 text-amber-700 hover:bg-amber-100'
                          : 'border-green-300 text-green-700 hover:bg-green-100'
                      }`}
                    >
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => setActionTarget({ user: u, action: 'delete' })}
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
  );
}