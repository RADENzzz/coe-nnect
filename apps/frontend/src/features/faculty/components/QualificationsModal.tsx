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
import Modal from '../../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../../components/ui/ResponsiveTable';
import StatusBadge from '../../../components/ui/StatusBadge';
import type { RowAction } from '../../../components/ui/RowActionMenu';

interface Props {
  open: boolean;
  onClose: () => void;
  faculty: FacultyRecord | null;
}

export default function QualificationsModal({ open, onClose, faculty }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [removeTarget, setRemoveTarget] = useState<FacultyQualification | null>(null);

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
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to add'),
  });

  const removeMutation = useMutation({
    mutationFn: (qualId: string) =>
      removeFacultyQualification(faculty!.facultyId, qualId),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['faculty-qualifications', faculty?.facultyId],
      });
      setRemoveTarget(null);
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to remove'),
  });

  // Filter out subjects already qualified
  const existingIds = new Set(quals.map((q) => String(q.subjectId)));
  const availableSubjects = subjects.filter(
    (s) => !existingIds.has(String(s.subjectId)) && s.isActive,
  );

  const sortedQuals = [...quals].sort((a, b) =>
    (a.subject?.subjectCode ?? '').localeCompare(b.subject?.subjectCode ?? ''),
  );

  const columns: Column<FacultyQualification>[] = [
    {
      key: 'code',
      header: 'Code',
      cardVariant: 'title',
      cellClassName: 'font-mono text-xs text-primary font-bold',
      render: (q) => q.subject?.subjectCode ?? '—',
    },
    {
      key: 'title',
      header: 'Title',
      cardVariant: 'subtitle',
      cellClassName: 'text-on-surface',
      render: (q) => q.subject?.title ?? '—',
    },
    {
      key: 'units',
      header: 'Units',
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant font-mono text-xs',
      render: (q) =>
        q.subject
          ? `${Number(q.subject.lectureUnits)}L + ${Number(q.subject.labUnits)}Lab`
          : '—',
    },
    {
      key: 'source',
      header: 'Source',
      cardVariant: 'badge',
      render: (q) => (
        <StatusBadge tone={q.sourceSystem ? 'info' : 'neutral'}>
          {q.sourceSystem ?? 'Manual'}
        </StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (q: FacultyQualification): RowAction[] => [
    {
      label: 'Remove',
      icon: 'delete',
      danger: true,
      onClick: () => setRemoveTarget(q),
      disabled: removeMutation.isPending,
    },
  ];

  return (
    <>
      <Modal
        open={open && !!faculty}
        onClose={onClose}
        title="Subject Qualifications"
        description={
          faculty ? `${faculty.lastName}, ${faculty.firstName}` : undefined
        }
        size="lg"
        footer={
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
          >
            Close
          </button>
        }
      >
        <div className="space-y-5">
          {error && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-700 text-sm">
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
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Add Subject
              </label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
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
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name="add" size={16} />
              {addMutation.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>

          {/* List */}
          <ResponsiveTable
            columns={columns}
            rows={sortedQuals}
            rowKey={(q) => q.qualId}
            rowTitle={(q) => q.subject?.subjectCode ?? 'Qualification'}
            rowSubtitle={(q) => q.subject?.title ?? ''}
            isLoading={isLoading}
            hasSourceRows={quals.length > 0}
            emptyMessage="No qualifications yet."
            noMatchMessage="No qualifications match your filters."
            getActions={getActions}
          />
        </div>
      </Modal>

      {/* Remove confirmation */}
      <Modal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Remove qualification?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setRemoveTarget(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                removeTarget && removeMutation.mutate(removeTarget.qualId)
              }
              disabled={removeMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
            >
              {removeMutation.isPending ? 'Removing…' : 'Remove'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Remove{' '}
          <strong>"{removeTarget?.subject?.subjectCode}"</strong> from this
          faculty's qualifications? This cannot be undone.
        </p>
      </Modal>
    </>
  );
}