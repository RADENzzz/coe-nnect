import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchDepartments,
  createDepartment,
  toggleDepartmentActive,
  type Department,
} from '../../api/departments.api';

export default function AdminDepartmentsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);  // ← NEW

  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    deptCode: '',
    deptName: '',
    description: '',
  });

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: !!user,  // ← NEW
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
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to create');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleDepartmentActive,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Toggle failed'),
  });

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Departments</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {departments.length} department(s) registered
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
          <span className="material-symbols-outlined text-base">add</span>
          New Department
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-700 text-sm">
          {success}
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-6">
          <h2 className="text-base font-semibold text-on-surface mb-4">
            Create New Department
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary transition"
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
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary transition"
                  placeholder="e.g. Civil Engineering"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Description
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={2}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary transition resize-none"
                  placeholder="Optional"
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
                {createMutation.isPending ? 'Creating...' : 'Create Department'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-variant text-on-surface-variant text-xs uppercase tracking-wider">
              <th className="text-left px-5 py-3">ID</th>
              <th className="text-left px-5 py-3">Code</th>
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-5 py-3">Description</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-on-surface-variant">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </div>
                </td>
              </tr>
            ) : departments.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-on-surface-variant">
                  No departments yet.
                </td>
              </tr>
            ) : (
              departments.map((dept: Department) => (
                <tr key={dept.deptId} className="border-b border-white/5 hover:bg-surface-container-low">
                  <td className="px-5 py-3.5 text-on-surface-variant font-mono">
                    {dept.deptId}
                  </td>
                  <td className="px-5 py-3.5 font-bold font-mono text-primary">
                    {dept.deptCode}
                  </td>
                  <td className="px-5 py-3.5 text-on-surface font-medium">
                    {dept.deptName}
                  </td>
                  <td className="px-5 py-3.5 text-on-surface-variant max-w-xs truncate">
                    {dept.description || '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        dept.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {dept.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => toggleMutation.mutate(dept.deptId)}
                      disabled={toggleMutation.isPending}
                      className={`text-xs px-3 py-1 rounded-lg border transition ${
                        dept.isActive
                          ? 'border-red-300 text-red-700 hover:bg-red-100'
                          : 'border-green-300 text-green-700 hover:bg-green-100'
                      }`}
                    >
                      {dept.isActive ? 'Deactivate' : 'Activate'}
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