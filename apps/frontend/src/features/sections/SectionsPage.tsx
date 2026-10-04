import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchSections,
  createSection,
  toggleSectionActive,
  deleteSection,
  type Section,
} from '../../api/sections.api';
import Icon from '../../components/ui/Icon';

export default function SectionsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    sectionCode: '',
    yearLevel: '',
    studentCount: '',
  });

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ['sections'],
    queryFn: fetchSections,
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: createSection,
    onSuccess: (section) => {
      setSuccess(`Section "${section.sectionCode}" created.`);
      setForm({ sectionCode: '', yearLevel: '', studentCount: '' });
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['sections'] });
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to create',
      );
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleSectionActive,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sections'] }),
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Toggle failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSection,
    onSuccess: () => {
      setSuccess('Section deleted.');
      qc.invalidateQueries({ queryKey: ['sections'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Delete failed'),
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    createMutation.mutate({
      sectionCode: form.sectionCode.trim(),
      yearLevel: form.yearLevel ? Number(form.yearLevel) : undefined,
      studentCount: form.studentCount ? Number(form.studentCount) : undefined,
    });
  };

  const handleDelete = (section: Section) => {
    if (
      !window.confirm(
        `Delete section "${section.sectionCode}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    deleteMutation.mutate(section.sectionId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Sections</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            {sections.length} section(s) registered
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
          <Icon name="add" size={18} />
          New Section
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

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-6">
          <h2 className="text-base font-semibold text-on-surface mb-4">
            Create Section
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Section Code *
                </label>
                <input
                  type="text"
                  name="sectionCode"
                  required
                  value={form.sectionCode}
                  onChange={handleChange}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary transition"
                  placeholder="e.g. CpE-1A"
                />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Year Level
                </label>
                <select
                  name="yearLevel"
                  value={form.yearLevel}
                  onChange={handleChange}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary transition"
                >
                  <option value="">— none —</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant mb-1.5 uppercase tracking-wider">
                  Student Count
                </label>
                <input
                  type="number"
                  name="studentCount"
                  min="0"
                  value={form.studentCount}
                  onChange={handleChange}
                  className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary transition"
                  placeholder="e.g. 40"
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
                {createMutation.isPending ? 'Creating...' : 'Create Section'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-variant text-on-surface-variant text-xs uppercase tracking-wider">
              <th className="text-left px-5 py-3">ID</th>
              <th className="text-left px-5 py-3">Section Code</th>
              <th className="text-left px-5 py-3">Year Level</th>
              <th className="text-left px-5 py-3">Students</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-8 text-center text-on-surface-variant"
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </div>
                </td>
              </tr>
            ) : sections.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-12 text-center text-on-surface-variant"
                >
                  No sections yet.
                </td>
              </tr>
            ) : (
              sections.map((s) => (
                <tr
                  key={s.sectionId}
                  className="border-b border-white/5 hover:bg-surface-container-low"
                >
                  <td className="px-5 py-3.5 text-on-surface-variant font-mono">
                    {s.sectionId}
                  </td>
                  <td className="px-5 py-3.5 font-bold font-mono text-primary">
                    {s.sectionCode}
                  </td>
                  <td className="px-5 py-3.5 text-on-surface-variant">
                    {s.yearLevel ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 text-on-surface">
                    {s.studentCount ?? '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        s.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right space-x-2">
                    <button
                      onClick={() => toggleMutation.mutate(s.sectionId)}
                      disabled={toggleMutation.isPending}
                      className={`text-xs px-3 py-1 rounded-lg border transition ${
                        s.isActive
                          ? 'border-red-300 text-red-700 hover:bg-red-100'
                          : 'border-green-300 text-green-700 hover:bg-green-100'
                      }`}
                    >
                      {s.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
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
    </div>
  );
}