import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchFacultyQualifications,
  addFacultyQualification,
  removeFacultyQualification,
  removeFacultyQualificationsBulk,
  type FacultyQualification,
} from '../../../api/faculty-qualifications.api';
import { fetchSubjects, type SubjectRecord } from '../../../api/subjects.api';
import type { FacultyRecord } from '../../../api/faculty.api';
import Icon from '../../../components/ui/Icon';
import Modal from '../../../components/ui/Modal';
import ResponsiveTable, {
  type Column,
} from '../../../components/ui/ResponsiveTable';
import StatusBadge from '../../../components/ui/StatusBadge';
import type { RowAction } from '../../../components/ui/RowActionMenu';

interface Props {
  open: boolean;
  onClose: () => void;
  faculty: FacultyRecord | null;
}

/**
 * Normalise whatever a mutation might throw (Axios error, plain Error,
 * network failure, or a raw string) into a display string.
 */
function extractMessage(err: unknown, fallback: string): string {
  const e = err as any;
  return e?.response?.data?.message ?? e?.message ?? fallback;
}

export default function QualificationsModal({ open, onClose, faculty }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [removeTarget, setRemoveTarget] = useState<FacultyQualification | null>(
    null,
  );
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  useEffect(() => {
    setSelectedKeys(new Set());
    setBulkConfirmOpen(false);
    setRemoveTarget(null);
    setError(null);
  }, [faculty?.facultyId, open]);

  const qualsKey = useMemo(
    () => ['faculty-qualifications', faculty?.facultyId] as const,
    [faculty?.facultyId],
  );

  const { data: quals = [], isLoading } = useQuery({
    queryKey: qualsKey,
    queryFn: () => fetchFacultyQualifications(faculty!.facultyId),
    enabled: open && !!faculty,
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects', { includeInactive: false }],
    queryFn: () => fetchSubjects(false),
    enabled: open,
  });

  const invalidateQuals = () => {
    qc.invalidateQueries({ queryKey: qualsKey });
    qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
    qc.invalidateQueries({ queryKey: ['faculty'] });
  };

  // ── add (optimistic) ──
  const addMutation = useMutation({
    mutationFn: (subjectId: string) =>
      addFacultyQualification(faculty!.facultyId, subjectId),
    onMutate: async (subjectId) => {
      await qc.cancelQueries({ queryKey: qualsKey });
      const previous = qc.getQueryData<FacultyQualification[]>(qualsKey);
      const subject = subjects.find(
        (s) => String(s.subjectId) === String(subjectId),
      );
      const tempId = `temp-${Date.now()}`;
      const temp = {
        qualId: tempId,
        facultyId: faculty!.facultyId,
        subjectId,
        subject,
      } as FacultyQualification;
      qc.setQueryData<FacultyQualification[]>(qualsKey, (old) => [
        ...(old ?? []),
        temp,
      ]);
      return { previous, tempId };
    },
    onSuccess: (real, _v, ctx) => {
      qc.setQueryData<FacultyQualification[]>(qualsKey, (old) =>
        (old ?? []).map((q) => (q.qualId === ctx?.tempId ? real : q)),
      );
      qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
      qc.invalidateQueries({ queryKey: ['faculty'] });
    },
    onError: (err: any, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qualsKey, ctx.previous);
      setError(extractMessage(err, 'Failed to add'));
    },
  });

  // ── remove (optimistic) ──
  const removeMutation = useMutation({
    mutationFn: (qualId: string) =>
      removeFacultyQualification(faculty!.facultyId, qualId),
    onMutate: async (qualId) => {
      await qc.cancelQueries({ queryKey: qualsKey });
      const previous = qc.getQueryData<FacultyQualification[]>(qualsKey);
      qc.setQueryData<FacultyQualification[]>(qualsKey, (old) =>
        (old ?? []).filter((q) => String(q.qualId) !== String(qualId)),
      );
      return { previous };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
      qc.invalidateQueries({ queryKey: ['faculty'] });
      setRemoveTarget(null);
    },
    onError: (err: any, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qualsKey, ctx.previous);
      setError(extractMessage(err, 'Failed to remove'));
    },
  });

  // ── bulk remove (optimistic) ──
  const bulkRemoveMutation = useMutation({
    mutationFn: (qualIds: string[]) =>
      removeFacultyQualificationsBulk(faculty!.facultyId, qualIds),
    onMutate: async (qualIds) => {
      await qc.cancelQueries({ queryKey: qualsKey });
      const previous = qc.getQueryData<FacultyQualification[]>(qualsKey);
      const set = new Set(qualIds.map(String));
      qc.setQueryData<FacultyQualification[]>(qualsKey, (old) =>
        (old ?? []).filter((q) => !set.has(String(q.qualId))),
      );
      return { previous };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['faculty-status-summary'] });
      qc.invalidateQueries({ queryKey: ['faculty'] });
      setSelectedKeys(new Set());
      setBulkConfirmOpen(false);
      setError(null);
    },
    onError: (err: any, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qualsKey, ctx.previous);
      setBulkConfirmOpen(false);
      setError(extractMessage(err, 'Failed to remove'));
    },
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const existingIds = new Set(quals.map((q) => String(q.subjectId)));
  const availableSubjects = useMemo(
    () =>
      subjects.filter(
        (s) => !existingIds.has(String(s.subjectId)) && s.isActive,
      ),
    [subjects, quals],
  );

  const filteredSubjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableSubjects;
    return availableSubjects.filter(
      (s) =>
        s.subjectCode.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q),
    );
  }, [availableSubjects, search]);

  const sortedQuals = useMemo(
    () =>
      [...quals].sort((a, b) =>
        (a.subject?.subjectCode ?? '').localeCompare(
          b.subject?.subjectCode ?? '',
        ),
      ),
    [quals],
  );

  useEffect(() => {
    setSelectedKeys((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(quals.map((q) => String(q.qualId)));
      const next = new Set([...prev].filter((k) => valid.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [quals]);

  const toggleRow = useCallback((qualId: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(qualId)) next.delete(qualId);
      else next.add(qualId);
      return next;
    });
  }, []);

  const allSelected =
    sortedQuals.length > 0 &&
    sortedQuals.every((q) => selectedKeys.has(String(q.qualId)));

  const toggleSelectAll = useCallback(() => {
    setSelectedKeys(
      allSelected
        ? new Set()
        : new Set(sortedQuals.map((q) => String(q.qualId))),
    );
  }, [allSelected, sortedQuals]);

  const selectedQuals = useMemo(
    () => sortedQuals.filter((q) => selectedKeys.has(String(q.qualId))),
    [sortedQuals, selectedKeys],
  );
  const selectedCount = selectedQuals.length;

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
      header: '',
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
    },
  ];

  const handleAdd = () => {
    if (!selectedSubjectId) return;
    const id = selectedSubjectId;
    // Clear the input *before* the mutation so the row appears instantly.
    setSelectedSubjectId('');
    setSearch('');
    setDropdownOpen(false);
    addMutation.mutate(id);
  };

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
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg active:scale-[0.98]"
          >
            Close
          </button>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-700 text-sm rounded-lg flex items-start gap-2">
              <Icon name="error" size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

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
                  listed below.
                </>
              )}
            </div>
          </div>

          {/* Add new — searchable dropdown */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 relative" ref={dropdownRef}>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Add Subject
              </label>
              <div className="relative">
                <Icon
                  name="search"
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setDropdownOpen(true);
                  }}
                  onFocus={() => setDropdownOpen(true)}
                  placeholder="Search by code or title…"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-8 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setSelectedSubjectId('');
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>

              {dropdownOpen && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {filteredSubjects.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-slate-500 text-center">
                      {availableSubjects.length === 0
                        ? 'All subjects already qualified.'
                        : 'No subjects match your search.'}
                    </div>
                  ) : (
                    filteredSubjects.slice(0, 50).map((s) => (
                      <button
                        key={s.subjectId}
                        type="button"
                        onClick={() => {
                          setSelectedSubjectId(s.subjectId);
                          setSearch(`[${s.subjectCode}] ${s.title}`);
                          setDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-primary/5 transition border-b border-slate-100 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-primary">
                            {s.subjectCode}
                          </span>
                          <span className="text-sm text-slate-800 truncate">
                            {s.title}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {Number(s.lectureUnits)}L + {Number(s.labUnits)}Lab
                          units
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!selectedSubjectId}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              <Icon name="add" size={16} />
              Add
            </button>
          </div>

          {/* List header + selection controls */}
          {quals.length > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Qualified Subjects
                </p>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                  {quals.length}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {allSelected ? 'Clear selection' : 'Select all'}
              </button>
            </div>
          )}

          {/* Batch action bar */}
          {selectedCount > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs font-semibold text-red-800">
                {selectedCount} selected
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedKeys(new Set())}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 rounded-md hover:bg-white transition active:scale-[0.98]"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setBulkConfirmOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-md hover:bg-red-700 transition active:scale-[0.98]"
                >
                  <Icon name="delete" size={14} />
                  Delete selected
                </button>
              </div>
            </div>
          )}

          <ResponsiveTable
            columns={columns}
            rows={sortedQuals}
            rowKey={(q) => q.qualId}
            rowTitle={(q) => q.subject?.subjectCode ?? 'Qualification'}
            rowSubtitle={(q) => q.subject?.title ?? ''}
            isLoading={isLoading}
            hasSourceRows={quals.length > 0}
            emptyMessage="No qualifications yet. Add one above to restrict this faculty to specific subjects."
            noMatchMessage="No qualifications match your filters."
            getActions={getActions}
            selectable
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            onRowClick={(q) => toggleRow(String(q.qualId))}
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
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!removeTarget) return;
                const id = removeTarget.qualId;
                // Optimistic removal in onMutate deletes the row instantly;
                // close the confirm dialog immediately for zero perceived latency.
                setRemoveTarget(null);
                removeMutation.mutate(id);
              }}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition rounded-lg flex items-center gap-2 active:scale-[0.98]"
            >
              Remove
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Remove <strong>"{removeTarget?.subject?.subjectCode}"</strong> from
          this faculty's qualifications? This cannot be undone.
        </p>
      </Modal>

      {/* Batch remove confirmation */}
      <Modal
        open={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        title="Delete qualifications?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setBulkConfirmOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition rounded-lg active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const ids = selectedQuals.map((q) => String(q.qualId));
                setBulkConfirmOpen(false);
                bulkRemoveMutation.mutate(ids);
              }}
              disabled={selectedCount === 0}
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 rounded-lg flex items-center gap-2 active:scale-[0.98]"
            >
              Delete {selectedCount}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Remove <strong>{selectedCount}</strong> qualification
          {selectedCount === 1 ? '' : 's'} from{' '}
          <strong>
            {faculty
              ? `${faculty.lastName}, ${faculty.firstName}`
              : 'this faculty'}
          </strong>
          ? This cannot be undone.
        </p>

        <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
          <ul className="space-y-1">
            {selectedQuals.map((q) => (
              <li key={q.qualId} className="flex items-baseline gap-2 text-xs">
                <span className="font-mono font-bold text-primary shrink-0">
                  {q.subject?.subjectCode ?? '—'}
                </span>
                <span className="text-slate-600 truncate">
                  {q.subject?.title ?? ''}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {selectedCount >= quals.length && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
            <span>
              Removing every qualification means rule F-5 is no longer enforced
              for this faculty member — they can be scheduled for any subject.
            </span>
          </p>
        )}
      </Modal>
    </>
  );
}