import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFacultyQualifications,
  addFacultyQualification,
  removeFacultyQualification,
  type FacultyQualification,
} from '../../../api/faculty-qualifications.api';
import { fetchSubjects, type SubjectRecord } from '../../../api/subjects.api';
import type { FacultyRecord } from '../../../api/faculty.api';
import Icon from '../../../components/ui/Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  faculty: FacultyRecord | null;
}

export default function QualificationsModal({
  open,
  onClose,
  faculty,
}: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  const { data: quals = [], isLoading } = useQuery({
    queryKey: ['faculty-qualifications', faculty?.facultyId],
    queryFn: () => fetchFacultyQualifications(faculty!.facultyId),
    enabled: open && !!faculty,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects', { includeInactive: false }],
    queryFn: () => fetchSubjects(false),
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: (subjectId: string) =>
      addFacultyQualification(faculty!.facultyId, subjectId),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['faculty-qualifications', faculty?.facultyId],
      });
      setSelectedSubjectId('');
      setError(null);
    },
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to add',
      ),
  });

  const removeMutation = useMutation({
    mutationFn: (qualId: string) =>
      removeFacultyQualification(faculty!.facultyId, qualId),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ['faculty-qualifications', faculty?.facultyId],
      }),
    onError: (err: any) =>
      setError(
        err?.response?.data?.message ?? err.message ?? 'Failed to remove',
      ),
  });

  if (!open || !faculty) return null;

  // Group subjects by department for the dropdown
  const grouped = subjects.reduce<Record<string, SubjectRecord[]>>(
    (acc, s) => {
      const key = s.deptId || 'unknown';
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
    },
    {},
  );

  // Filter out subjects already qualified
  const existingIds = new Set(quals.map((q) => String(q.subjectId)));
  const availableSubjects = subjects.filter(
    (s) => !existingIds.has(String(s.subjectId)) && s.isActive,
  );

  const sortedQuals = [...quals].sort((a, b) =>
    (a.subject?.subjectCode ?? '').localeCompare(b.subject?.subjectCode ?? ''),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-surface-variant bg-surface-container-lowest shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-variant sticky top-0 bg-surface-container-lowest z-10">
          <div>
            <h2 className="text-lg font-bold text-primary">
              Subject Qualifications
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {faculty.lastName}, {faculty.firstName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant"
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* F-5 hint */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900 flex items-start gap-2">
            <Icon name="info" size={16} className="shrink-0 mt-0.5" />
            <div>
              {quals.length === 0 ? (
                <>
                  <strong>No qualifications configured.</strong> Rule F-5 is
                  currently not enforced for this faculty member — they can be
                  scheduled for any subject. Add at least one qualification to
                  enable the restriction.
                </>
              ) : (
                <>
                  <strong>
                    {quals.length} qualification{quals.length === 1 ? '' : 's'}{' '}
                    on file.
                  </strong>{' '}
                  Rule F-5 restricts this faculty member to only the subjects
                  listed below. Attempting to plot them for any other subject
                  will be rejected.
                </>
              )}
            </div>
          </div>

          {/* Add new */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Add Subject
              </label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Select a subject…</option>
                {availableSubjects.map((s) => (
                  <option key={s.subjectId} value={s.subjectId}>
                    [{s.subjectCode}] {s.title}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                if (selectedSubjectId) addMutation.mutate(selectedSubjectId);
              }}
              disabled={!selectedSubjectId || addMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name="add" size={16} />
              {addMutation.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>

          {/* List */}
          <div className="rounded-lg border border-surface-variant overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-container-low border-b border-surface-variant text-xs uppercase tracking-wider text-on-surface-variant">
                  <th className="text-left px-4 py-2.5">Code</th>
                  <th className="text-left px-4 py-2.5">Title</th>
                  <th className="text-left px-4 py-2.5">Units</th>
                  <th className="text-left px-4 py-2.5">Source</th>
                  <th className="text-right px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-on-surface-variant"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : sortedQuals.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-on-surface-variant"
                    >
                      No qualifications yet.
                    </td>
                  </tr>
                ) : (
                  sortedQuals.map((q) => (
                    <tr
                      key={q.qualId}
                      className="border-b border-white/5 hover:bg-surface-container-low"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-primary font-bold">
                        {q.subject?.subjectCode ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-on-surface">
                        {q.subject?.title ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant font-mono text-xs">
                        {q.subject
                          ? `${Number(q.subject.lectureUnits)}L + ${Number(
                              q.subject.labUnits,
                            )}Lab`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {q.sourceSystem ?? 'Manual'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove "${q.subject?.subjectCode}" from this faculty's qualifications?`,
                              )
                            ) {
                              removeMutation.mutate(q.qualId);
                            }
                          }}
                          disabled={removeMutation.isPending}
                          className="text-xs px-3 py-1 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 transition"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-surface-variant flex justify-end bg-surface-container-low">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}