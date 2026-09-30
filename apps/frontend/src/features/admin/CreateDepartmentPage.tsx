import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Department {
  dept_id: number;
  dept_code: string;
  dept_name: string;
  is_active: boolean;
}

export default function CreateDepartmentPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);

  const [formData, setFormData] = useState({
    dept_code: '',
    dept_name: '',
    description: '',
    head_email: '',
    head_username: '',
    head_first_name: '',
    head_last_name: '',
    head_password: '',
  });

  // Fetch existing departments on mount
  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    setLoadingDepts(true);
    const { data } = await supabase
      .from('department')
      .select('dept_id, dept_code, dept_name, is_active')
      .order('dept_name');
    if (data) setDepartments(data);
    setLoadingDepts(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Step 1: Insert the department into the database
      const { data: dept, error: deptError } = await supabase
        .from('department')
        .insert({
          dept_code: formData.dept_code.toUpperCase(),
          dept_name: formData.dept_name,
          description: formData.description || null,
          is_active: true,
        })
        .select()
        .single();

      if (deptError) throw deptError;

      // Step 2: Department head user creation requires the service_role key
      // (admin-level privilege) which cannot be done from the browser safely.
      // This is intentional — the user account must be created via the backend
      // or the create-admin.mjs script with the service_role key.
      // The department was created successfully.
      setSuccess(
        `✅ Department "${dept.dept_name}" (${dept.dept_code}) created! ` +
        `Now run the backend script or use the Supabase Dashboard to create the Department Head account ` +
        `and assign dept_id: ${dept.dept_id}.`
      );

      await fetchDepartments();
      setFormData({
        dept_code: '',
        dept_name: '',
        description: '',
        head_email: '',
        head_username: '',
        head_first_name: '',
        head_last_name: '',
        head_password: '',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to create department');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Manage Departments</h1>
        <p className="text-on-surface-variant mt-1">
          Create new departments and assign department head accounts.
        </p>
      </div>

      {/* Existing Departments Table */}
      <div className="card p-6 bg-surface-bright">
        <h2 className="text-lg font-semibold text-primary mb-4">Existing Departments</h2>
        {loadingDepts ? (
          <div className="flex items-center gap-2 text-on-surface-variant text-sm">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading departments...
          </div>
        ) : departments.length === 0 ? (
          <p className="text-on-surface-variant text-sm">No departments yet. Create one below.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-variant text-on-surface-variant text-left">
                  <th className="pb-2 pr-4">ID</th>
                  <th className="pb-2 pr-4">Code</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.dept_id} className="border-b border-surface-variant last:border-0">
                    <td className="py-2 pr-4 text-on-surface-variant">{d.dept_id}</td>
                    <td className="py-2 pr-4 font-mono font-bold text-primary">{d.dept_code}</td>
                    <td className="py-2 pr-4 text-on-surface">{d.dept_name}</td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        d.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-600'
                      }`}>
                        {d.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Department Form */}
      <div className="card p-6 bg-surface-bright">
        <h2 className="text-lg font-semibold text-primary mb-1">Create New Department</h2>
        <p className="text-xs text-on-surface-variant mb-4">
          The department head's user account must be created separately via the admin script or
          Supabase Dashboard using the service_role key, then linked to the department ID shown after creation.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-100 text-red-700 text-sm rounded-md">{error}</div>
          )}
          {success && (
            <div className="p-3 bg-green-100 text-green-700 text-sm rounded-md">{success}</div>
          )}

          {/* Department Info */}
          <div>
            <h3 className="text-sm font-semibold text-on-surface mb-3 uppercase tracking-wide">
              Department Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label block mb-1">Department Code <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  name="dept_code"
                  required
                  value={formData.dept_code}
                  onChange={handleChange}
                  className="input uppercase"
                  placeholder="e.g. CE, CpE, ME"
                />
              </div>
              <div>
                <label className="label block mb-1">Department Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  name="dept_name"
                  required
                  value={formData.dept_name}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g. Civil Engineering"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label block mb-1">Description (Optional)</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  className="input min-h-[80px]"
                  placeholder="Brief description of the department..."
                />
              </div>
            </div>
          </div>

          {/* Department Head Info (informational, account created via script) */}
          <div className="border border-dashed border-surface-variant rounded-lg p-4">
            <h3 className="text-sm font-semibold text-on-surface-variant mb-1 flex items-center gap-2">
              <span className="text-yellow-500">⚠</span> Department Head Account (Reference Only)
            </h3>
            <p className="text-xs text-on-surface-variant mb-3">
              Fill these in as a reference. After the department is created, use
              <code className="mx-1 px-1 bg-surface-container rounded text-xs">create-admin.mjs</code>
              or the Supabase Dashboard to create the actual login account with the <strong>dept_id</strong> shown after creation.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label block mb-1">First Name</label>
                <input
                  type="text"
                  name="head_first_name"
                  value={formData.head_first_name}
                  onChange={handleChange}
                  className="input"
                  placeholder="Juan"
                />
              </div>
              <div>
                <label className="label block mb-1">Last Name</label>
                <input
                  type="text"
                  name="head_last_name"
                  value={formData.head_last_name}
                  onChange={handleChange}
                  className="input"
                  placeholder="Dela Cruz"
                />
              </div>
              <div>
                <label className="label block mb-1">Email Address</label>
                <input
                  type="email"
                  name="head_email"
                  value={formData.head_email}
                  onChange={handleChange}
                  className="input"
                  placeholder="head@wmsu.edu.ph"
                />
              </div>
              <div>
                <label className="label block mb-1">Username</label>
                <input
                  type="text"
                  name="head_username"
                  value={formData.head_username}
                  onChange={handleChange}
                  className="input"
                  placeholder="head.ce"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary px-8 disabled:opacity-50"
            >
              {loading ? 'Creating Department...' : 'Create Department'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

