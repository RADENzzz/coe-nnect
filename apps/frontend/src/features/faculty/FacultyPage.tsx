import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchFaculty,
  createFaculty,
  updateFaculty,
  toggleFacultyActive,
  deleteFaculty,
  type FacultyRecord,
  type FacultyClass,
  type CreateFacultyInput,
} from '../../api/faculty.api';
import { fetchDepartments } from '../../api/departments.api';
import Icon from '../../components/ui/Icon';
import QualificationsModal from './components/QualificationsModal';

const CLASSIFICATIONS: { value: FacultyClass; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'part_time', label: 'Part-Time' },
  { value: 'visiting_lecturer', label: 'Visiting Lecturer' },
  { value: 'other', label: 'Other' },
];

type Mode = 'create' | 'edit';

export default function FacultyPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<FacultyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    contact: '',
    wmsuId: '',
    employeeId: '',
    deptId: '',
    classification: 'regular' as FacultyClass,
    requiredHours: '',
  });
  const [qualOpen, setQualOpen] = useState(false);
  const [qualFaculty, setQualFaculty] = useState<FacultyRecord | null>(null);

  const { data: faculty = [], isLoading } = useQuery({
    queryKey: ['faculty', { includeInactive: true }],
    queryFn: () => fetchFaculty(true),
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: createFaculty,
    onSuccess: (f) => {
      setSuccess(`Faculty "${f.lastName}, ${f.firstName}" created.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['faculty'] });
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to create',
      ),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<CreateFacultyInput>;
    }) => updateFaculty(id, input),
    onSuccess: (f) => {
      setSuccess(`Faculty "${f.lastName}, ${f.firstName}" updated.`);
      closeForm();
      qc.invalidateQueries({ queryKey: ['faculty'] });
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to update',
      ),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleFacultyActive,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['faculty'] }),
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Toggle failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFaculty,
    onSuccess: () => {
      setSuccess('Faculty deleted.');
      qc.invalidateQueries({ queryKey: ['faculty'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Delete failed'),
  });

  const closeForm = () => {
    setMode(null);
    setEditing(null);
    setForm({
      firstName: '',
      lastName: '',
      email: '',
      contact: '',
      wmsuId: '',
      employeeId: '',
      deptId: '',
      classification: 'regular',
      requiredHours: '',
    });
    setError(null);
  };

  const openCreate = () => {
    setMode('create');
    setEditing(null);
    setForm({
      firstName: '',
      lastName: '',
      email: '',
      contact: '',
      wmsuId: '',
      employeeId: '',
      deptId: '',
      classification: 'regular',
      requiredHours: '',
    });
    setError(null);
    setSuccess(null);
  };

  const openEdit = (f: FacultyRecord) => {
    setMode('edit');
    setEditing(f);
    setForm({
      firstName: f.firstName,
      lastName: f.lastName,
      email: f.email ?? '',
      contact: f.contact ?? '',
      wmsuId: f.wmsuId ?? '',
      employeeId: f.employeeId ?? '',
      deptId: f.deptId ?? '',
      classification: f.classification,
      requiredHours: f.requiredHours != null ? String(f.requiredHours) : '',
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

    const payload: CreateFacultyInput = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim() || undefined,
      contact: form.contact.trim() || undefined,
      wmsuId: form.wmsuId.trim() || undefined,
      employeeId: form.employeeId.trim() || undefined,
      deptId: form.deptId || undefined,
      classification: form.classification,
      requiredHours: form.requiredHours
        ? Number(form.requiredHours)
        : undefined,
    };

    if (mode === 'create') {
      createMutation.mutate(payload);
    } else if (mode === 'edit' && editing) {
      updateMutation.mutate({ id: editing.facultyId, input: payload });
    }
  };

  const handleDelete = (f: FacultyRecord) => {
    if (
      !window.confirm(
        `Delete faculty "${f.lastName}, ${f.firstName}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    deleteMutation.mutate(f.facultyId);
  };

  const deptName = (id: string | null) => {
    if (!id) return '—';
    const d = departments.find((x) => String(x.deptId) === String(id));
    return d ? `[${d.deptCode}] ${d.deptName}` : `Dept #${id}`;
  };

  const classBadge = (c: FacultyClass) => {
    const map: Record<FacultyClass, string> = {
      regular: 'bg-blue-100 text-blue-700',
      part_time: 'bg-amber-100 text-amber-700',
      visiting_lecturer: 'bg-purple-100 text-purple-700',
      other: 'bg-slate-100 text-slate-600',
    };
    return map[c] ?? 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Faculty</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {faculty.length} faculty member(s) registered
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
        >
          <Icon name="add" size={18} />
          New Faculty
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
              {mode === 'create'
                ? 'Create Faculty'
                : `Edit Faculty — ${editing?.lastName}, ${editing?.firstName}`}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    First Name *
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    required
                    value={form.firstName}
                    onChange={handleChange}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    required
                    value={form.lastName}
                    onChange={handleChange}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Contact
                  </label>
                  <input
                    type="text"
                    name="contact"
                    value={form.contact}
                    onChange={handleChange}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    WMSU ID
                  </label>
                  <input
                    type="text"
                    name="wmsuId"
                    value={form.wmsuId}
                    onChange={handleChange}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Employee ID
                  </label>
                  <input
                    type="text"
                    name="employeeId"
                    value={form.employeeId}
                    onChange={handleChange}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Department
                  </label>
                  <select
                    name="deptId"
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
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Classification *
                  </label>
                  <select
                    name="classification"
                    required
                    value={form.classification}
                    onChange={handleChange}
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                  >
                    {CLASSIFICATIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                    Required Hours
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    name="requiredHours"
                    value={form.requiredHours}
                    onChange={handleChange}
                    placeholder="Leave blank for 18 (default)"
                    className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    Standard workload is 18 hours/week. Blank uses the default.
                  </p>
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
                    ? 'Create Faculty'
                    : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-variant text-on-surface-variant text-xs uppercase tracking-wider">
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-5 py-3">Email</th>
              <th className="text-left px-5 py-3">Dept</th>
              <th className="text-left px-5 py-3">Classification</th>
              <th className="text-left px-5 py-3">Hours</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-on-surface-variant">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </div>
                </td>
              </tr>
            ) : faculty.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-on-surface-variant">
                  No faculty yet.
                </td>
              </tr>
            ) : (
              faculty.map((f) => (
                <tr key={f.facultyId} className="border-b border-white/5 hover:bg-surface-container-low">
                  <td className="px-5 py-3.5 text-on-surface font-medium">
                    {f.lastName}, {f.firstName}
                  </td>
                  <td className="px-5 py-3.5 text-on-surface-variant text-xs">
                    {f.email ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 text-on-surface-variant text-xs">
                    {deptName(f.deptId)}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${classBadge(f.classification)}`}
                    >
                      {f.classification.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-on-surface-variant font-mono text-xs">
                    {f.requiredHours != null ? `${f.requiredHours}h` : '18h (default)'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        f.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {f.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => openEdit(f)}
                      className="text-xs px-3 py-1 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setQualFaculty(f);
                        setQualOpen(true);
                      }}
                      className="text-xs px-3 py-1 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-100 transition"
                    >
                      Qualifications
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate(f.facultyId)}
                      disabled={toggleMutation.isPending}
                      className={`text-xs px-3 py-1 rounded-lg border transition ${
                        f.isActive
                          ? 'border-red-300 text-red-700 hover:bg-red-100'
                          : 'border-green-300 text-green-700 hover:bg-green-100'
                      }`}
                    >
                      {f.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDelete(f)}
                      disabled={deleteMutation.isPending}
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
      <QualificationsModal
        open={qualOpen}
        onClose={() => {
          setQualOpen(false);
          setQualFaculty(null);
        }}
        faculty={qualFaculty}
      />
    </div>
  );
}