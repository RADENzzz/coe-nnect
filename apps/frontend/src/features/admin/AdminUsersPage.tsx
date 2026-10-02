import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchUsers,
  createUser,
  toggleUserActive,
  type UserRecord,
} from '../../api/users.api';
import { useAuthStore } from '../../store/auth.store';
import { fetchDepartments } from '../../api/departments.api';
import { login } from '../../api/auth.api';

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    username: '',
    role: 'department_head' as const,
    deptId: '',
  });

  const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null);
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
    onSuccess: (user) => {
      setSuccess(`User "${user.username}" created.`);
      setForm({ email: '', password: '', username: '', role: 'department_head', deptId: '' });
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to create user');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleUserActive,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setDeactivateTarget(null);
      setAdminPassword('');
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Toggle failed'),
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
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

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

    createMutation.mutate({
      email: form.email,
      password: form.password,
      username: form.username,
      role: form.role,
      deptId: form.deptId || undefined,
    });
  };

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      administrator: 'bg-red-100 text-red-700',
      college_dean: 'bg-yellow-100 text-yellow-700',
      department_head: 'bg-blue-100 text-blue-700',
      viewer: 'bg-surface-container-high text-on-surface-variant',
    };
    return map[role] || 'bg-surface-container-high text-on-surface-variant';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Users</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {users.length} user account(s) registered
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

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-on-surface mb-4">Create User</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    placeholder="Min 8 characters"
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
                    Department (optional)
                  </label>
                  <select
                    name="deptId"
                    value={form.deptId}
                    onChange={handleChange}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary transition"
                  >
                    <option value="">None</option>
                    {departments.map((d) => (
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
                  {createMutation.isPending ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-xl">
            <h2 className="text-lg font-bold text-red-600 mb-2">Confirm Deactivation</h2>
            <p className="text-sm text-on-surface-variant mb-4">
              Please enter your password to confirm this action.
            </p>
            {verifyError && (
              <div className="mb-4 p-2 bg-red-100 text-red-700 text-xs rounded-lg">
                {verifyError}
              </div>
            )}
            <input
              type="password"
              placeholder="Admin password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:border-red-500 transition mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeactivateTarget(null);
                  setAdminPassword('');
                  setVerifyError(null);
                }}
                className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-low rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeactivate}
                disabled={isVerifying || !adminPassword}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition disabled:opacity-50"
              >
                {isVerifying ? 'Verifying...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

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
              users.map((u: UserRecord) => (
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
                    {u.deptId 
                      ? departments.find(d => String(d.deptId) === String(u.deptId))?.deptName || `Dept #${u.deptId}`
                      : '—'}
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
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => {
                        if (u.isActive) {
                          setDeactivateTarget(u.userId);
                        } else {
                          toggleMutation.mutate(u.userId);
                        }
                      }}
                      disabled={toggleMutation.isPending}
                      className={`text-xs px-3 py-1 rounded-lg border transition ${
                        u.isActive
                          ? 'border-red-300 text-red-700 hover:bg-red-100'
                          : 'border-green-300 text-green-700 hover:bg-green-100'
                      }`}
                    >
                      {u.isActive ? 'Deactivate' : 'Activate'}
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