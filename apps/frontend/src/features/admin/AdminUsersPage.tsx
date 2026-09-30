import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface UserRecord {
  user_id: string;
  username: string;
  email: string;
  role: string;
  dept_id: number | null;
  is_active: boolean;
  created_at: string;
  department?: { dept_code: string; dept_name: string } | null;
}

interface Department {
  dept_id: number;
  dept_code: string;
  dept_name: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    email: '',
    username: '',
    dept_id: '',
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [usersRes, deptsRes] = await Promise.all([
      supabase
        .from('users')
        .select('*, department(dept_code, dept_name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('department')
        .select('dept_id, dept_code, dept_name')
        .eq('is_active', true)
        .order('dept_name'),
    ]);
    if (usersRes.data) setUsers(usersRes.data);
    if (deptsRes.data) setDepartments(deptsRes.data);
    setLoading(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    // Creating a user via the Supabase Admin API requires service_role key 
    // which cannot be exposed in the browser. 
    // This needs a Supabase Edge Function or a backend endpoint.
    // For now, we show the note and guide the admin to use the script.
    setError(
      'Creating user accounts requires a secure backend call. ' +
      'Please run: node apps/frontend/create-admin.mjs ' +
      `with role=department_head and dept_id=${form.dept_id || '(your dept ID)'}.`
    );
    setSubmitting(false);
  };

  const toggleActive = async (user: UserRecord) => {
    const { error } = await supabase
      .from('users')
      .update({ is_active: !user.is_active })
      .eq('user_id', user.user_id);
    if (!error) fetchAll();
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Users</h1>
          <p className="text-on-surface-variant text-sm mt-1">{users.length} user account(s) registered</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(null); setSuccess(null); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
        >
          <span className="material-symbols-outlined text-base">person_add</span>
          New User
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-300 text-green-700 text-sm">{success}</div>
      )}

      {/* Create User Form */}
      {showForm && (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-6">
          <h2 className="text-base font-semibold text-on-surface mb-1">Create Department Head Account</h2>
          <p className="text-xs text-on-surface-variant mb-4">
            Run <code className="bg-surface-container-high px-1.5 py-0.5 rounded text-on-surface/60">node apps/frontend/create-admin.mjs</code> in your terminal 
            to securely create a user with a password via the service_role key.
            Provide the <strong className="text-on-surface-variant">dept_id</strong> from the Departments page.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">Email *</label>
                <input
                  type="email"
                  name="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary transition"
                  placeholder="head@wmsu.edu.ph"
                />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">Username *</label>
                <input
                  type="text"
                  name="username"
                  required
                  value={form.username}
                  onChange={handleChange}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary transition"
                  placeholder="head.ce"
                />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">Department *</label>
                <select
                  name="dept_id"
                  required
                  value={form.dept_id}
                  onChange={handleChange}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary transition"
                >
                  <option value="" className="bg-surface-container-lowest">Select department...</option>
                  {departments.map(d => (
                    <option key={d.dept_id} value={d.dept_id} className="bg-surface-container-lowest">
                      [{d.dept_code}] {d.dept_name}
                    </option>
                  ))}
                </select>
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
                disabled={submitting}
                className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {submitting ? 'Processing...' : 'See Instructions'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-variant text-on-surface-variant text-xs uppercase tracking-wider">
              <th className="text-left px-5 py-3">User</th>
              <th className="text-left px-5 py-3">Role</th>
              <th className="text-left px-5 py-3">Department</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-left px-5 py-3">Joined</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-on-surface-variant">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-4xl block mb-2">person_off</span>
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u, i) => (
                <tr
                  key={u.user_id}
                  className={`border-b border-white/5 hover:bg-surface-container-low transition ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}
                >
                  <td className="px-5 py-3.5">
                    <p className="text-on-surface font-medium">{u.username}</p>
                    <p className="text-on-surface-variant text-xs">{u.email}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${roleBadge(u.role)}`}>
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-on-surface-variant text-xs">
                    {u.department
                      ? `[${u.department.dept_code}] ${u.department.dept_name}`
                      : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                      u.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-on-surface-variant text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => toggleActive(u)}
                      className={`text-xs px-3 py-1 rounded-lg border transition ${
                        u.is_active
                          ? 'border-red-500/30 text-red-700 hover:bg-red-100'
                          : 'border-green-500/30 text-green-700 hover:bg-green-500/10'
                      }`}
                    >
                      {u.is_active ? 'Deactivate' : 'Activate'}
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

