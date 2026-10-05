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

  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [selectedYearLevel, setSelectedYearLevel] = useState<number>(1);
  const [selectedSemester, setSelectedSemester] = useState<SemesterType>('1st');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProspectusRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Fetch programs for the dropdown ──
  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: fetchPrograms,
    enabled: !!user,
  });

  // ── Fetch all prospectus entries once; filter client-side ──
  // (Program size is small enough that this is simpler than
  //  re-fetching on every program change.)
  const { data: allEntries = [], isLoading } = useQuery({
    queryKey: ['prospectus'],
    queryFn: fetchProspectus,
    enabled: !!user,
  });

  // ── Fetch subjects for the modal ──
  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects', { includeInactive: true }],
    queryFn: () => fetchSubjects(true),
    enabled: !!user,
  });

  // Default to the first program once loaded
  const effectiveProgramId = selectedProgramId || programs[0]?.programId || '';

  // ── Filter for the current view ──
  const filteredEntries = useMemo(() => {
    if (!effectiveProgramId) return [];
    return allEntries.filter(
      (e) =>
        String(e.programId) === String(effectiveProgramId) &&
        e.yearLevel === selectedYearLevel &&
        e.semester === selectedSemester,
    );
  }, [allEntries, effectiveProgramId, selectedYearLevel, selectedSemester]);

  // ── Counts per year (for tab badges) ──
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
      qc.invalidateQueries({ queryKey: ['prospectus'] });
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Delete failed'),
  });

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

  const handleDelete = (entry: ProspectusRecord) => {
    const code = entry.subject?.subjectCode ?? 'this subject';
    if (!window.confirm(`Remove "${code}" from the prospectus?`)) return;
    deleteMutation.mutate(entry.prospectusId);
  };

  const currentProgram = programs.find(
    (p) => String(p.programId) === String(effectiveProgramId),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Prospectus</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Map subjects to each program, year level, and semester.
          </p>
        </div>
        <button
          onClick={handleAdd}
          disabled={!effectiveProgramId}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="add" size={18} />
          Add Subject
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
      {/* Flow hint — SRS Academic Structure Management order */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3 text-sm">
        <Icon
          name="info"
          size={18}
          className="text-blue-700 shrink-0 mt-0.5"
        />
        <div className="flex-1">
          <p className="text-blue-900 font-medium">
            Prospectus is step 3 of 3 in the Academic Structure flow.
          </p>
          <p className="text-blue-800 text-xs mt-0.5">
            Only subjects created in the Subjects page can be mapped here. If you
            don't see a subject you need, add it in Subjects first.
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
      {/* Filters */}
      {programs.length === 0 ? (
        <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-12 text-center">
          <Icon
            name="school"
            size={48}
            className="text-on-surface-variant mb-3 mx-auto"
          />
          <p className="text-on-surface font-semibold mb-1">
            No programs available
          </p>
          <p className="text-on-surface-variant text-sm">
            Run the demo seed to populate programs.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Program
              </label>
              <select
                value={effectiveProgramId}
                onChange={(e) => setSelectedProgramId(e.target.value)}
                className="bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary min-w-[240px]"
              >
                {programs.map((p) => (
                  <option key={p.programId} value={p.programId}>
                    [{p.programCode}] {p.programName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Semester
              </label>
              <select
                value={selectedSemester}
                onChange={(e) =>
                  setSelectedSemester(e.target.value as SemesterType)
                }
                className="bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary min-w-[160px]"
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

          {/* Year level tabs */}
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

          {/* Table */}
          <div className="rounded-xl border border-surface-variant bg-surface-container-lowest overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-variant text-on-surface-variant text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Code</th>
                  <th className="text-left px-5 py-3">Title</th>
                  <th className="text-left px-5 py-3">Units</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center text-on-surface-variant"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Loading…
                      </div>
                    </td>
                  </tr>
                ) : filteredEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-12 text-center text-on-surface-variant"
                    >
                      <p className="font-medium mb-1">
                        No subjects for this combination yet.
                      </p>
                      <p className="text-xs">
                        Click "Add Subject" to add the first one.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => (
                    <tr
                      key={entry.prospectusId}
                      className="border-b border-white/5 hover:bg-surface-container-low"
                    >
                      <td className="px-5 py-3.5 font-bold font-mono text-primary">
                        {entry.subject?.subjectCode ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-on-surface">
                        {entry.subject?.title ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-on-surface-variant font-mono text-xs">
                        {entry.subject
                          ? `${Number(entry.subject.lectureUnits)}L + ${Number(
                              entry.subject.labUnits,
                            )}Lab = ${Number(entry.subject.totalUnits)}`
                          : '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                            entry.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {entry.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => handleEdit(entry)}
                          className="text-xs px-3 py-1 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() =>
                            toggleMutation.mutate(entry.prospectusId)
                          }
                          disabled={toggleMutation.isPending}
                          className={`text-xs px-3 py-1 rounded-lg border transition ${
                            entry.isActive
                              ? 'border-red-300 text-red-700 hover:bg-red-100'
                              : 'border-green-300 text-green-700 hover:bg-green-100'
                          }`}
                        >
                          {entry.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleDelete(entry)}
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

          {/* Modal */}
          <ProspectusFormModal
            open={modalOpen}
            onClose={() => {
              setModalOpen(false);
              setEditing(null);
            }}
            programs={programs}
            subjects={subjects}
            editing={editing}
            defaultProgramId={effectiveProgramId}
            defaultYearLevel={selectedYearLevel}
            defaultSemester={selectedSemester}
          />
        </>
      )}
    </div>
  );
}