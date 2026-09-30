import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Department {
  dept_id: number;
  dept_code: string;
  dept_name: string;
  description: string | null;
  is_active: boolean;
}

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    dept_code: '',
    dept_name: '',
    description: '',
  });

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('department')
      .select('*')
      .order('dept_name');
    if (data) setDepartments(data);
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const { data, error } = await supabase
      .from('department')
      .insert({
        dept_code: form.dept_code.toUpperCase(),
        dept_name: form.dept_name,
        description: form.description || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      setError(error.message);
    } else {
      setSuccess(`Department "${data.dept_name}" created with ID: ${data.dept_id}`);
      setForm({ dept_code: '', dept_name: '', description: '' });
      setShowForm(false);
      await fetchDepartments();
    }
    setSubmitting(false);
  };

  const toggleActive = async (dept: Department) => {
    const { error } = await supabase
      .from('department')
      .update({ is_active: !dept.is_active })
      .eq('dept_id', dept.dept_id);
    if (!error) fetchDepartments();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Departments</h1>
          <p className="text-on-surface-variant text-sm mt-1">{departments.length} department(s) registered</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(null); setSuccess(null); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
        >
          <span className="material-symbols-outlined text-base">add</span>
          New Department
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-700 text-sm">{success}</div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-6">
          <h2 className="text-base font-semibold text-on-surface mb-4">Create New Department</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">Department Code *</label>
                <input
                  type="text"
                  name="dept_code"
                  required
                  value={form.dept_code}
                  onChange={handleChange}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary transition"
                  placeholder="e.g. CE, CpE, ME"
                />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">Department Name *</label>
                <input
                  type="text"
                  name="dept_name"
                  required
                  value={form.dept_name}
                  onChange={handleChange}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary transition"
                  placeholder="e.g. Civil Engineering"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">Description</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={2}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary transition resize-none"
                  placeholder="Optional description..."
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
                disabled={submitting}
                className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create Department'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Departments Table */}
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
            {loading ? (
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
                  <span className="material-symbols-outlined text-4xl block mb-2">domain_disabled</span>
                  No departments yet. Click "New Department" to get started.
                </td>
              </tr>
            ) : (
              departments.map((dept, i) => (
                <tr
                  key={dept.dept_id}
                  className={`border-b border-white/5 hover:bg-surface-container-low transition ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}
                >
                  <td className="px-5 py-3.5 text-on-surface-variant font-mono">{dept.dept_id}</td>
                  <td className="px-5 py-3.5 font-bold font-mono text-primary">{dept.dept_code}</td>
                  <td className="px-5 py-3.5 text-on-surface font-medium">{dept.dept_name}</td>
                  <td className="px-5 py-3.5 text-on-surface-variant max-w-xs truncate">{dept.description || '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                      dept.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {dept.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => toggleActive(dept)}
                      className={`text-xs px-3 py-1 rounded-lg border transition ${
                        dept.is_active
                          ? 'border-red-300 text-red-700 hover:bg-red-100'
                          : 'border-green-300 text-green-700 hover:bg-green-100'
                      }`}
                    >
                      {dept.is_active ? 'Deactivate' : 'Activate'}
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

