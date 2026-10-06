import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchProspectus,
  toggleProspectusActive,
  deleteProspectus,
  type ProspectusRecord,
  type SemesterType,
} from '../../api/prospectus.api';
import { fetchPrograms } from '../../api/programs.api';
import { fetchSubjects } from '../../api/subjects.api';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import ResponsiveTable, { type Column } from '../../components/ui/ResponsiveTable';
import type { RowAction } from '../../components/ui/RowActionMenu';
import { ActiveBadge } from '../../components/ui/StatusBadge';
import ProspectusFormModal from './components/ProspectusFormModal';
import { Link } from 'react-router-dom';

const YEAR_LEVELS = [1, 2, 3, 4, 5, 6];
const SEMESTERS: { value: SemesterType; label: string }[] = [
  { value: '1st', label: '1st Semester' },
  { value: '2nd', label: '2nd Semester' },
  { value: 'summer', label: 'Summer' },
];

export default function ProspectusPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [selectedYearLevel, setSelectedYearLevel] = useState<number>(1);
  const [selectedSemester, setSelectedSemester] = useState<SemesterType>('1st');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProspectusRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProspectusRecord | null>(null);

  // ── Data ──
  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: fetchPrograms,
    enabled: !!user,
  });

  const { data: allEntries = [], isLoading } = useQuery({
    queryKey: ['prospectus'],
    queryFn: fetchProspectus,
    enabled: !!user,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects', { includeInactive: true }],
    queryFn: () => fetchSubjects(true),
    enabled: !!user,
  });

  // ── Department-scoped program list ──
  // DHs see only programs owned by their own department.
  // Admin and Dean see everything.
  const visiblePrograms = useMemo(() => {
    if (!profile) return programs;
    if (
      profile.role === 'administrator' ||
      profile.role === 'college_dean'
    ) {
      return programs;
    }
    return programs.filter(
      (p) => String(p.deptId) === String(profile.dept_id ?? ''),
    );
  }, [programs, profile]);

  // First visible program is the default
  const effectiveProgramId =
    selectedProgramId || visiblePrograms[0]?.programId || '';

  const currentProgram = useMemo(
    () =>
      visiblePrograms.find(
        (p) => String(p.programId) === String(effectiveProgramId),
      ),
    [visiblePrograms, effectiveProgramId],
  );

  // Can the caller write to the currently selected program?
  const canWrite = useMemo(() => {
    if (!profile) return false;
    if (
      profile.role === 'administrator' ||
      profile.role === 'college_dean'
    ) {
      return true;
    }
    if (profile.role !== 'department_head') return false;
    if (!currentProgram) return false;
    return (
      String(currentProgram.deptId) === String(profile.dept_id ?? '')
    );
  }, [profile, currentProgram]);

  // ── Filtering ──
  const filteredEntries = useMemo(() => {
    if (!effectiveProgramId) return [];
    return allEntries.filter(
      (e) =>
        String(e.programId) === String(effectiveProgramId) &&
        e.yearLevel === selectedYearLevel &&
        e.semester === selectedSemester,
    );
  }, [allEntries, effectiveProgramId, selectedYearLevel, selectedSemester]);

  const countsByYear = useMemo(() => {
    const map: Record<number, number> = {};
    for (const y of YEAR_LEVELS) map[y] = 0;
    if (!effectiveProgramId) return map;
    for (const e of allEntries) {
      if (
        String(e.programId) === String(effectiveProgramId) &&
        e.semester === selectedSemester
      ) {
        map[e.yearLevel] = (map[e.yearLevel] ?? 0) + 1;
      }
    }
    return map;
  }, [allEntries, effectiveProgramId, selectedSemester]);

  // ── Mutations ──
  const toggleMutation = useMutation({
    mutationFn: toggleProspectusActive,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prospectus'] }),
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Toggle failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProspectus,
    onSuccess: () => {
      setSuccess('Prospectus entry removed.');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['prospectus'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Delete failed'),
  });

  // ── Handlers ──
  const handleAdd = () => {
    setEditing(null);
    setModalOpen(true);
    setError(null);
    setSuccess(null);
  };

  const handleEdit = (entry: ProspectusRecord) => {
    setEditing(entry);
    setModalOpen(true);
    setError(null);
    setSuccess(null);
  };

  // ── Columns ──
  const columns: Column<ProspectusRecord>[] = [
    {
      key: 'code',
      header: 'Code',
      cardVariant: 'title',
      cellClassName: 'font-bold font-mono text-primary',
      render: (e) => e.subject?.subjectCode ?? '—',
    },
    {
      key: 'title',
      header: 'Title',
      cardVariant: 'subtitle',
      cellClassName: 'text-on-surface',
      render: (e) => e.subject?.title ?? '—',
    },
    {
      key: 'units',
      header: 'Units',
      cardVariant: 'mono',
      cellClassName: 'text-on-surface-variant font-mono text-xs',
      render: (e) =>
        e.subject
          ? `${Number(e.subject.lectureUnits)}L + ${Number(e.subject.labUnits)}Lab = ${Number(e.subject.totalUnits)}`
          : '—',
    },
    {
      key: 'status',
      header: 'Status',
      cardVariant: 'badge',
      render: (e) => <ActiveBadge isActive={e.isActive} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      cardVariant: 'actions',
      render: () => null,
    },
  ];

  const getActions = (e: ProspectusRecord): RowAction[] => {
    if (!canWrite) return [];
    return [
      { label: 'Edit', icon: 'edit', onClick: () => handleEdit(e) },
      {
        label: e.isActive ? 'Deactivate' : 'Activate',
        icon: e.isActive ? 'toggle_off' : 'toggle_on',
        onClick: () => toggleMutation.mutate(e.prospectusId),
        disabled: toggleMutation.isPending,
      },
      {
        label: 'Delete',
        icon: 'delete',
        danger: true,
        onClick: () => setDeleteTarget(e),
        disabled: deleteMutation.isPending,
      },
    ];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Prospectus</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Map subjects to each program, year level, and semester.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={handleAdd}
            disabled={!effectiveProgramId}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon name="add" size={18} />
            Add Subject
          </button>
        )}
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

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3 text-sm">
        <Icon name="info" size={18} className="text-blue-700 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-blue-900 font-medium">
            Prospectus is step 3 of 3 in the Academic Structure flow.
          </p>
          <p className="text-blue-800 text-xs mt-0.5">
            Only subjects created in the Subjects page can be mapped here. If
            you don't see a subject you need, add it in Subjects first.
          </p>
        </div>
        <Link
          to="/subjects"
          className="text-xs font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap flex items-center gap-1"
        >
          Go to Subjects
          <Icon name="arrow_forward" size={14} />
        </Link>
      </div>

      {visiblePrograms.length === 0 ? (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-12 text-center">
          <Icon
            name="school"
            size={48}
            className="text-on-surface-variant mb-3 mx-auto"
          />
          <p className="text-on-surface font-semibold mb-1">
            {programs.length === 0
              ? 'No programs available'
              : 'No programs for your department'}
          </p>
          <p className="text-on-surface-variant text-sm">
            {programs.length === 0
              ? 'Run the demo seed to populate programs.'
              : "Your department doesn't own any programs yet. Contact the administrator."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Program
              </label>
              <select
                value={effectiveProgramId}
                onChange={(e) => setSelectedProgramId(e.target.value)}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                {visiblePrograms.map((p) => (
                  <option key={p.programId} value={p.programId}>
                    [{p.programCode}] {p.programName}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[160px]">
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Semester
              </label>
              <select
                value={selectedSemester}
                onChange={(e) =>
                  setSelectedSemester(e.target.value as SemesterType)
                }
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              >
                {SEMESTERS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {currentProgram && (
              <div className="ml-auto text-xs text-on-surface-variant">
                Showing{' '}
                <strong className="text-on-surface">
                  {filteredEntries.length}
                </strong>{' '}
                subject{filteredEntries.length === 1 ? '' : 's'} in{' '}
                <strong className="text-on-surface">
                  {currentProgram.programCode}
                </strong>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1 border-b border-surface-variant">
            {YEAR_LEVELS.map((y) => {
              const count = countsByYear[y] ?? 0;
              const isActive = y === selectedYearLevel;
              return (
                <button
                  key={y}
                  onClick={() => setSelectedYearLevel(y)}
                  className={`px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {y}
                  {y === 1 ? 'st' : y === 2 ? 'nd' : y === 3 ? 'rd' : 'th'} Year
                  {count > 0 && (
                    <span
                      className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <ResponsiveTable
            columns={columns}
            rows={filteredEntries}
            rowKey={(e) => e.prospectusId}
            rowTitle={(e) => e.subject?.subjectCode ?? '—'}
            rowSubtitle={(e) => e.subject?.title ?? ''}
            isLoading={isLoading}
            hasSourceRows={allEntries.length > 0}
            emptyMessage="No subjects for this combination yet."
            noMatchMessage="No subjects match your filters."
            getActions={canWrite ? getActions : undefined}
          />

          {canWrite && (
            <ProspectusFormModal
              open={modalOpen}
              onClose={() => {
                setModalOpen(false);
                setEditing(null);
              }}
              programs={visiblePrograms}
              subjects={subjects}
              editing={editing}
              defaultProgramId={effectiveProgramId}
              defaultYearLevel={selectedYearLevel}
              defaultSemester={selectedSemester}
            />
          )}
        </>
      )}

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove from prospectus?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                deleteTarget &&
                deleteMutation.mutate(deleteTarget.prospectusId)
              }
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Removing…' : 'Remove'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Remove <strong>"{deleteTarget?.subject?.subjectCode}"</strong> from
          the prospectus?
        </p>
      </Modal>
    </div>
  );
}