import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import {
  fetchProspectus,
  toggleProspectusActive,
  deleteProspectus,
  createProspectus,
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

const YEAR_LEVELS = [1, 2, 3, 4, 5, 6];
const SEMESTERS: { value: SemesterType; label: string; short: string }[] = [
  { value: '1st', label: '1st Semester', short: '1st Sem' },
  { value: '2nd', label: '2nd Semester', short: '2nd Sem' },
  { value: 'summer', label: 'Summer', short: 'Summer' },
];

function ordinalSuffix(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'th';
  if (rem10 === 1) return 'st';
  if (rem10 === 2) return 'nd';
  if (rem10 === 3) return 'rd';
  return 'th';
}

export default function ProspectusPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProspectusRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProspectusRecord | null>(
    null,
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);

  // ── URL state ──
  const [searchParams, setSearchParams] = useSearchParams();
  const programParam = searchParams.get('program') ?? '';
  const yearParam = searchParams.get('year') ?? '';
  const semesterParam = (searchParams.get('semester') ?? '1st') as SemesterType;

  const [selectedProgramId, setSelectedProgramId] = useState(programParam);
  const [selectedYearLevel, setSelectedYearLevel] = useState<number>(
    yearParam ? Number(yearParam) : 1,
  );
  const [selectedSemester, setSelectedSemester] = useState<SemesterType>(
    semesterParam,
  );

  // Sync URL when selections change
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedProgramId) next.set('program', selectedProgramId);
    else next.delete('program');
    next.set('year', String(selectedYearLevel));
    next.set('semester', selectedSemester);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProgramId, selectedYearLevel, selectedSemester]);

  // ── Queries ──
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

  // ── Auto-dismiss success ──
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  // ── Scope-aware programs ──
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

  // Default program
  const effectiveProgramId =
    selectedProgramId || visiblePrograms[0]?.programId || '';

  const currentProgram = useMemo(
    () =>
      visiblePrograms.find(
        (p) => String(p.programId) === String(effectiveProgramId),
      ),
    [visiblePrograms, effectiveProgramId],
  );

  // Write permission
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
    return String(currentProgram.deptId) === String(profile.dept_id ?? '');
  }, [profile, currentProgram]);

  // ── Client-side subject lookup ──
  // The prospectus API returns a *narrow* SubjectRef (no room type / minor
  // flag). We join against the full subject list already loaded on the page.
  const subjectById = useMemo(() => {
    const m = new Map<string, (typeof subjects)[number]>();
    for (const s of subjects) m.set(String(s.subjectId), s);
    return m;
  }, [subjects]);

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

  // Counts and unit totals per year (for tabs)
  const yearStats = useMemo(() => {
    const map: Record<number, { count: number; units: number }> = {};
    for (const y of YEAR_LEVELS) map[y] = { count: 0, units: 0 };
    if (!effectiveProgramId) return map;
    for (const e of allEntries) {
      if (
        String(e.programId) === String(effectiveProgramId) &&
        e.semester === selectedSemester
      ) {
        const total = Number(e.subject?.totalUnits ?? 0);
        map[e.yearLevel] = map[e.yearLevel] ?? { count: 0, units: 0 };
        map[e.yearLevel].count += 1;
        map[e.yearLevel].units += total;
      }
    }
    return map;
  }, [allEntries, effectiveProgramId, selectedSemester]);

  // Total units in current view
  const currentViewStats = useMemo(() => {
    let units = 0;
    let active = 0;
    for (const e of filteredEntries) {
      units += Number(e.subject?.totalUnits ?? 0);
      if (e.isActive) active += 1;
    }
    return {
      subjects: filteredEntries.length,
      active,
      inactive: filteredEntries.length - active,
      units,
    };
  }, [filteredEntries]);

  // Program stats for the dropdown (subjects per program)
  const programStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of allEntries) {
      const key = String(e.programId);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [allEntries]);

  // Group programs for the dropdown
  const programOptions = useMemo(
    () =>
      visiblePrograms.map((p) => ({
        id: String(p.programId),
        label: `[${p.programCode}] ${p.programName}`,
      })),
    [visiblePrograms],
  );

  // ── Shared invalidation helper ──
  // Prospectus is the *source of truth* for coverage expected count.
  // Any change here can add/remove expected (subject × section) pairs.
  // 'prospectus-all' is the key TimetablePage reads for its plot modal.
  const invalidateAfterProspectusChange = () => {
    qc.invalidateQueries({ queryKey: ['prospectus'] });
    qc.invalidateQueries({ queryKey: ['prospectus-all'] });
    qc.invalidateQueries({ queryKey: ['prospectus-by-program'] });
    qc.invalidateQueries({ queryKey: ['coverage'] });
    qc.invalidateQueries({ queryKey: ['unplotted-minors'] });
  };

  // ── Mutations ──
  const toggleMutation = useMutation({
    mutationFn: toggleProspectusActive,
    onSuccess: () => invalidateAfterProspectusChange(),
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Toggle failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProspectus,
    onSuccess: () => {
      setSuccess('Prospectus entry removed.');
      setDeleteTarget(null);
      invalidateAfterProspectusChange();
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Delete failed'),
  });

  // ── Bulk action: activate/deactivate all visible ──
  const handleBulkToggle = async (activate: boolean) => {
    const targets = filteredEntries.filter((e) => e.isActive !== activate);
    if (targets.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      await Promise.all(
        targets.map((e) =>
          toggleProspectusActive(e.prospectusId).then(() => undefined),
        ),
      );
      setSuccess(
        `${activate ? 'Activated' : 'Deactivated'} ${targets.length} entr${
          targets.length === 1 ? 'y' : 'ies'
        }.`,
      );
      invalidateAfterProspectusChange();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Bulk operation failed');
    } finally {
      setBulkBusy(false);
    }
  };

  // ── Handlers ──
  const handleAdd = () => {
    setEditing(null);
    setModalOpen(true);
    setError(null);
    setSuccess(null);
  };

  const handleEdit = (entry: ProspectusRecord) => {
    if (!canWrite) return;
    setEditing(entry);
    setModalOpen(true);
    setError(null);
    setSuccess(null);
  };

  // ── Formatting helpers ──
  const semesterLabel = useMemo(
    () => SEMESTERS.find((s) => s.value === selectedSemester)?.label ?? '',
    [selectedSemester],
  );

  const renderUnits = (e: ProspectusRecord) => {
    const s = e.subject;
    if (!s) return '—';
    const lec = Number(s.lectureUnits ?? 0);
    const lab = Number(s.labUnits ?? 0);
    const total = Number(s.totalUnits ?? 0);
    return (
      <div className="inline-flex items-center gap-1 text-xs font-mono">
        {lec > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
            {lec}L
          </span>
        )}
        {lab > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
            {lab}Lab
          </span>
        )}
        {lec > 0 && lab > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
            = {total}
          </span>
        )}
      </div>
    );
  };

  const renderType = (e: ProspectusRecord) => {
    const s = e.subject;
    if (!s) return '—';
    const lec = Number(s.lectureUnits ?? 0);
    const lab = Number(s.labUnits ?? 0);
    if (lec > 0 && lab > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 uppercase">
          <Icon name="merge_type" size={10} />
          Mixed
        </span>
      );
    }
    if (lab > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 uppercase">
          <Icon name="science" size={10} />
          Lab
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">
        <Icon name="meeting_room" size={10} />
        Lecture
      </span>
    );
  };

  const renderRoomType = (e: ProspectusRecord) => {
    // Join client-side: pull the full SubjectRecord from the loaded list
    const full = e.subjectId ? subjectById.get(String(e.subjectId)) : undefined;
    const roomType = full?.requiredRoomType;
    if (!roomType) {
      return <span className="text-slate-400 text-xs">—</span>;
    }
    const iconMap: Record<string, string> = {
      any: 'swap_horiz',
      lecture_room: 'meeting_room',
      laboratory: 'science',
      computer_lab: 'computer',
      drafting_room: 'draw',
      other: 'category',
    };
    const icon = iconMap[roomType] ?? 'category';
    const label = roomType === 'any' ? 'Any' : roomType.replace('_', ' ');
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-600">
        <Icon name={icon} size={11} className="text-slate-400" />
        <span className="capitalize">{label}</span>
      </span>
    );
  };

  // ── Columns ──
  const columns: Column<ProspectusRecord>[] = [
    {
      key: 'code',
      header: 'Code',
      cardVariant: 'title',
      cellClassName: 'font-bold font-mono text-primary',
      render: (e) => {
        const full = e.subjectId
          ? subjectById.get(String(e.subjectId))
          : undefined;
        const isMinor = full?.isMinor ?? false;
        return (
          <span className="inline-flex items-center gap-1.5">
            {isMinor && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800"
                title="Minor subject"
              >
                <Icon name="school" size={9} />
                Minor
              </span>
            )}
            {e.subject?.subjectCode ?? '—'}
          </span>
        );
      },
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
      cellClassName: '',
      render: renderUnits,
    },
    {
      key: 'type',
      header: 'Type',
      cardVariant: 'badge',
      render: renderType,
    },
    {
      key: 'roomType',
      header: 'Room',
      cardVariant: 'meta',
      render: renderRoomType,
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
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: () => null,
    },
  ];

  const getActions = (e: ProspectusRecord): RowAction[] => {
    if (!canWrite) {
      return [
        {
          label: 'Read only',
          icon: 'lock',
          onClick: () => {},
          disabled: true,
        },
      ];
    }
    return [
      { label: 'Edit', icon: 'edit', onClick: () => handleEdit(e) },
      { divider: true },
      {
        label: e.isActive ? 'Deactivate' : 'Activate',
        icon: e.isActive ? 'toggle_off' : 'toggle_on',
        loading:
          toggleMutation.isPending &&
          toggleMutation.variables === e.prospectusId,
        onClick: () => toggleMutation.mutate(e.prospectusId),
      },
      { divider: true },
      {
        label: 'Remove',
        icon: 'delete',
        danger: true,
        loading:
          deleteMutation.isPending &&
          deleteMutation.variables === e.prospectusId,
        onClick: () => setDeleteTarget(e),
      },
    ];
  };

  // ── Keyboard: arrow keys on year tabs ──
  const onYearTabKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    y: number,
  ) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const idx = YEAR_LEVELS.indexOf(y);
      const next = YEAR_LEVELS[(idx + 1) % YEAR_LEVELS.length];
      setSelectedYearLevel(next);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const idx = YEAR_LEVELS.indexOf(y);
      const prev =
        YEAR_LEVELS[(idx - 1 + YEAR_LEVELS.length) % YEAR_LEVELS.length];
      setSelectedYearLevel(prev);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Prospectus</h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Map subjects to each program, year level, and semester.
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCopyModalOpen(true)}
              disabled={!effectiveProgramId || !currentProgram}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-surface-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="Copy subjects from another year/semester"
            >
              <Icon name="content_copy" size={16} />
              Copy from…
            </button>
            <button
              onClick={handleAdd}
              disabled={!effectiveProgramId}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Icon name="add" size={18} />
              Add Subject
            </button>
          </div>
        )}
      </div>

      {/* ── Workflow hint ── */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3 text-sm">
        <Icon name="info" size={18} className="text-blue-700 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-blue-900 font-medium">
            Step 3 of 3 Academic Structure
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

      {/* ── Read-only warning ── */}
      {!canWrite && currentProgram && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>Read-only view.</strong> This program belongs to another
            department. Contact the owning department head or an administrator
            to make changes.
          </span>
        </div>
      )}

      {/* ── Banners ── */}
      {error && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm flex items-start gap-2">
          <Icon name="error" size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800"
            aria-label="Dismiss"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 text-sm flex items-start gap-2">
          <Icon name="check_circle" size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{success}</span>
          <button
            onClick={() => setSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900"
            aria-label="Dismiss"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {visiblePrograms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-variant bg-surface-container-lowest py-16 text-center">
          <Icon
            name="school"
            size={48}
            className="text-slate-300 mx-auto mb-3"
          />
          <p className="text-on-surface font-semibold mb-1">
            {programs.length === 0
              ? 'No programs available'
              : 'No programs for your department'}
          </p>
          <p className="text-on-surface-variant text-sm mb-4">
            {programs.length === 0
              ? 'Run the demo seed to populate programs.'
              : "Your department doesn't own any programs yet. Contact the administrator."}
          </p>
          <Link
            to="/import"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
          >
            <Icon name="upload_file" size={16} />
            Go to Prospectus Import
          </Link>
        </div>
      ) : (
        <>
          {/* ── Breadcrumb path ── */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">
              Viewing
            </span>
            {currentProgram && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-semibold text-xs">
                <Icon name="school" size={12} />
                {currentProgram.programCode}
              </span>
            )}
            <Icon name="chevron_right" size={14} className="text-slate-300" />
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-semibold text-xs">
              <Icon name="calendar_today" size={12} />
              {selectedYearLevel}
              {ordinalSuffix(selectedYearLevel)} Year
            </span>
            <Icon name="chevron_right" size={14} className="text-slate-300" />
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-semibold text-xs">
              <Icon name="event" size={12} />
              {semesterLabel}
            </span>
          </div>

          {/* ── Program + Semester selector ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-surface-variant bg-surface-container-lowest">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Program
              </label>
              <select
                value={effectiveProgramId}
                onChange={(e) => setSelectedProgramId(e.target.value)}
                className="w-full bg-surface-container-low border border-surface-variant rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              >
                {programOptions.map((p) => {
                  const count = programStats.get(p.id) ?? 0;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.label}
                      {count > 0 ? ` · ${count} subjects` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">
                Semester
              </label>
              <div className="flex gap-1 p-1 rounded-lg bg-surface-container-low border border-surface-variant">
                {SEMESTERS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSelectedSemester(s.value)}
                    className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                      selectedSemester === s.value
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-slate-600 hover:bg-white'
                    }`}
                  >
                    {s.short}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Year level tabs ── */}
          <div className="flex flex-wrap gap-1 border-b border-surface-variant">
            {YEAR_LEVELS.map((y) => {
              const stat = yearStats[y];
              const isActive = y === selectedYearLevel;
              const isEmpty = stat.count === 0;
              return (
                <button
                  key={y}
                  onClick={() => setSelectedYearLevel(y)}
                  onKeyDown={(e) => onYearTabKeyDown(e, y)}
                  tabIndex={isActive ? 0 : -1}
                  className={`px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px flex items-center gap-2 ${
                    isActive
                      ? 'border-primary text-primary'
                      : `border-transparent ${
                          isEmpty
                            ? 'text-slate-400'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`
                  }`}
                  title={
                    isEmpty
                      ? `No subjects for ${y}${ordinalSuffix(y)} Year`
                      : `${stat.count} subjects · ${stat.units} units`
                  }
                >
                  <span>
                    {y}
                    {ordinalSuffix(y)} Year
                  </span>
                  {stat.count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                        isActive
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {stat.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Current view stats ── */}
          {currentViewStats.subjects > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-slate-500">
                <strong className="text-slate-800 font-bold text-base">
                  {currentViewStats.subjects}
                </strong>{' '}
                subject{currentViewStats.subjects === 1 ? '' : 's'}
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">
                <strong className="text-slate-800 font-bold text-base">
                  {currentViewStats.units}
                </strong>{' '}
                total units
              </span>
              {currentViewStats.inactive > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500">
                    {currentViewStats.inactive} inactive
                  </span>
                </>
              )}
              {canWrite && currentViewStats.subjects > 1 && (
                <>
                  <span className="ml-auto" />
                  <button
                    type="button"
                    onClick={() => handleBulkToggle(true)}
                    disabled={
                      bulkBusy ||
                      currentViewStats.active === currentViewStats.subjects
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Activate all visible entries"
                  >
                    <Icon name="check_circle" size={11} />
                    Activate all
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkToggle(false)}
                    disabled={bulkBusy || currentViewStats.inactive === 0}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Deactivate all visible entries"
                  >
                    <Icon name="toggle_off" size={11} />
                    Deactivate all
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Table ── */}
          {filteredEntries.length === 0 && !isLoading ? (
            <div className="rounded-xl border border-dashed border-surface-variant bg-surface-container-lowest py-16 text-center">
              <Icon
                name="menu_book"
                size={48}
                className="text-slate-300 mx-auto mb-3"
              />
              <p className="text-base font-semibold text-on-surface">
                No subjects in this slot
              </p>
              <p className="text-sm text-on-surface-variant mt-1 mb-4">
                {selectedYearLevel}
                {ordinalSuffix(selectedYearLevel)} Year · {semesterLabel} has no
                subjects mapped yet.
              </p>
              {canWrite && (
                <button
                  onClick={handleAdd}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition"
                >
                  <Icon name="add" size={16} />
                  Add first subject
                </button>
              )}
            </div>
          ) : (
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
              getActions={getActions}
              onRowClick={canWrite ? handleEdit : undefined}
            />
          )}
        </>
      )}

      {/* ── Add/Edit modal ── */}
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

      {/* ── Copy from… modal ── */}
      {canWrite && (
        <CopyFromModal
          open={copyModalOpen}
          onClose={() => setCopyModalOpen(false)}
          programLabel={currentProgram?.programCode ?? ''}
          currentProgramId={effectiveProgramId}
          currentYear={selectedYearLevel}
          currentSemester={selectedSemester}
          allEntries={allEntries}
          onCopied={(count) => {
            setSuccess(
              `Copied ${count} subject${count === 1 ? '' : 's'} into the current slot.`,
            );
            invalidateAfterProspectusChange();
          }}
        />
      )}

      {/* ── Delete confirmation ── */}
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
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.prospectusId)
              }
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 rounded-lg flex items-center gap-2"
            >
              {deleteMutation.isPending && (
                <Icon
                  name="progress_activity"
                  size={14}
                  className="animate-spin"
                />
              )}
              {deleteMutation.isPending ? 'Removing…' : 'Remove'}
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Remove <strong>"{deleteTarget?.subject?.subjectCode}"</strong> from
            the prospectus?
          </p>
          <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
            <span>
              Removing this mapping will not delete the subject itself — only
              its placement in {currentProgram?.programCode}. Existing
              timetable entries referencing this subject may become orphaned.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ────────────────────────────────────────────
// Copy-from modal (inline component)
// ────────────────────────────────────────────

function CopyFromModal({
  open,
  onClose,
  programLabel,
  currentProgramId,
  currentYear,
  currentSemester,
  allEntries,
  onCopied,
}: {
  open: boolean;
  onClose: () => void;
  programLabel: string;
  currentProgramId: string;
  currentYear: number;
  currentSemester: SemesterType;
  allEntries: ProspectusRecord[];
  onCopied: (count: number) => void;
}) {
  const [sourceYear, setSourceYear] = useState<number>(currentYear);
  const [sourceSemester, setSourceSemester] = useState<SemesterType>('1st');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Filter source entries by current program (so we only copy within the
  // same program). This is important — cross-program copy would be wrong.
  const sourceEntries = useMemo(
    () =>
      allEntries.filter(
        (e) =>
          String(e.programId) === String(currentProgramId) &&
          e.yearLevel === sourceYear &&
          e.semester === sourceSemester,
      ),
    [allEntries, currentProgramId, sourceYear, sourceSemester],
  );

  const isSameSlot =
    sourceYear === currentYear && sourceSemester === currentSemester;

  const handleCopy = async () => {
    setBusy(true);
    setErr(null);
    try {
      let count = 0;
      for (const e of sourceEntries) {
        if (!e.subjectId) continue;
        await createProspectus({
          programId: e.programId,
          subjectId: e.subjectId,
          yearLevel: currentYear,
          semester: currentSemester,
        });
        count += 1;
      }
      onCopied(count);
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? e?.message ?? 'Copy failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Copy subjects from…"
      description={`Into ${programLabel} · ${currentYear}${
        currentYear === 1
          ? 'st'
          : currentYear === 2
          ? 'nd'
          : currentYear === 3
          ? 'rd'
          : 'th'
      } Year · ${
        currentSemester === '1st'
          ? '1st'
          : currentSemester === '2nd'
          ? '2nd'
          : 'Summer'
      } Semester`}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={busy || isSameSlot || sourceEntries.length === 0}
            className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
          >
            {busy && (
              <Icon
                name="progress_activity"
                size={14}
                className="animate-spin"
              />
            )}
            {busy
              ? 'Copying…'
              : `Copy ${sourceEntries.length} subject${
                  sourceEntries.length === 1 ? '' : 's'
                }`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {err && (
          <div className="p-2.5 rounded bg-red-50 border border-red-200 text-xs text-red-800">
            {err}
          </div>
        )}
        <p className="text-xs text-slate-500">
          Copy subjects from another year and semester into the current slot.
          Existing entries will not be replaced.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              From Year
            </label>
            <select
              value={sourceYear}
              onChange={(e) => setSourceYear(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              {[1, 2, 3, 4, 5, 6].map((y) => (
                <option key={y} value={y}>
                  {y}
                  {y === 1 ? 'st' : y === 2 ? 'nd' : y === 3 ? 'rd' : 'th'} Year
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
              From Semester
            </label>
            <select
              value={sourceSemester}
              onChange={(e) =>
                setSourceSemester(e.target.value as SemesterType)
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            >
              {SEMESTERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {isSameSlot && (
          <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
            <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
            <span>
              Source and destination are the same. Pick a different year or
              semester.
            </span>
          </div>
        )}
        {!isSameSlot && (
          <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-xs text-slate-600">
            <strong>{sourceEntries.length}</strong> subject
            {sourceEntries.length === 1 ? '' : 's'} found in the source slot.
          </div>
        )}
      </div>
    </Modal>
  );
}