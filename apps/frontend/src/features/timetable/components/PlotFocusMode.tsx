import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';

import {
  fetchUnscheduled,
  type UnscheduledRecord,
} from '../../../api/schedule.api';
import {
  fetchQualifiedFaculty,
  fetchQualifiedFacultyForSubjects,
} from '../../../api/faculty-qualifications.api';
import Icon from '../../../components/ui/Icon';
import TimetableGrid from './TimetableGrid';
import PlotSubjectModal, {
  type DepartmentOption,
  type FacultyOption,
  type PlotSubjectPreset,
  type RoomOption,
  type SubjectOption,
} from '../../plot-subject/PlotSubjectModal';
import {
  PLOT_DRAG_MIME,
  type ExternalPlotDragPayload,
  type ScheduleEntry,
} from '../types';

const DAY_ABBR_TO_FULL: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

const KIND_LABEL: Record<UnscheduledRecord['kind'], string> = {
  lecture: 'Lecture',
  lab: 'Laboratory',
};

function payloadFor(record: UnscheduledRecord): ExternalPlotDragPayload {
  return {
    unscheduledId: record.unscheduledId,
    subjectId: record.subjectId,
    subjectCode: record.subjectCode,
    subjectTitle: record.subjectTitle,
    sectionId: record.sectionId,
    sectionCode: record.sectionCode,
    kind: record.kind,
    sessionIndex: record.sessionIndex,
  };
}

function SessionRow({
  record,
  armedHere,
  moving,
  onDragStart,
  onPlot,
}: {
  record: UnscheduledRecord;
  armedHere: boolean;
  moving: boolean;
  onDragStart: (
    event: DragEvent<HTMLDivElement>,
    record: UnscheduledRecord,
  ) => void;
  onPlot: (record: UnscheduledRecord) => void;
}) {
  return (
    <div
      draggable={!moving}
      onDragStart={(event) => onDragStart(event, record)}
      className={clsx(
        'flex items-center gap-2 border border-dashed px-2 py-1.5 text-[11px] transition',
        moving
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-grab active:cursor-grabbing',
        armedHere
          ? 'border-emerald-400/70 bg-emerald-50/60 dark:bg-emerald-500/10'
          : 'border-outline-variant/70 bg-surface-container-low/40 hover:border-primary/40',
      )}
    >
      <Icon
        name="drag_indicator"
        size={14}
        className="shrink-0 text-on-surface-variant"
      />
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-on-surface">
          {record.sectionCode} · {KIND_LABEL[record.kind]}
        </span>
        <span className="ml-1 text-on-surface-variant">
          session {record.sessionIndex + 1}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onPlot(record)}
        disabled={moving}
        title="Open the plot dialog"
        className="shrink-0 border border-outline-variant bg-surface px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        Plot
      </button>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  termId: string;
  termLabel: string;
  deptId: string;
  deptName: string;
  entries: ScheduleEntry[];
  readOnlyEntryIds?: Set<string>;
  onEntryMove?: (
    entryId: string,
    newDay: string,
    newStartTime: string,
  ) => void | Promise<unknown>;
  onEntryClick?: (entry: ScheduleEntry) => void;
  subjects: SubjectOption[];
  rooms: RoomOption[];
  departments: DepartmentOption[];
  existingCounts: Array<{
    scheduleId: string;
    section: string | null;
    subjectId: string;
    loadType: 'lecture' | 'laboratory' | 'other';
  }>;
}

/**
 * Full-screen plotting workspace.
 *
 * The palette lists only unscheduled sessions and the faculty panel lists only
 * faculty qualified for the selected subject — including other departments.
 * Dropping a card on the grid opens the normal plot dialog with the slot and
 * faculty pre-filled, so the existing conflict checks and cross-department
 * approval request stay in one place.
 */
export default function PlotFocusMode({
  open,
  onClose,
  termId,
  termLabel,
  deptId,
  deptName,
  entries,
  readOnlyEntryIds,
  onEntryMove,
  onEntryClick,
  subjects,
  rooms,
  departments,
  existingCounts,
}: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(
    null,
  );
  const [armed, setArmed] = useState<{
    subjectId: string;
    facultyId: string;
  } | null>(null);
  const [preset, setPreset] = useState<PlotSubjectPreset | null>(null);
  const [moving, setMoving] = useState(false);
  const [paletteMode, setPaletteMode] = useState<'subject' | 'faculty'>(
    'subject',
  );

  const { data: unscheduled = [], isLoading } = useQuery({
    queryKey: ['unscheduled', termId, deptId],
    queryFn: () => fetchUnscheduled(termId, deptId || undefined),
    enabled: open && !!termId,
  });

  // Auto-select the first subject so the faculty panel is never dead on open.
  useEffect(() => {
    if (!open) return;
    if (selectedSubjectId) return;
    const first = unscheduled[0];
    if (first) setSelectedSubjectId(first.subjectId);
  }, [open, unscheduled, selectedSubjectId]);

  const activeSubjectId = preset?.subjectId ?? selectedSubjectId ?? '';

  const { data: qualified = [], isLoading: qualifiedLoading } = useQuery({
    queryKey: ['qualified-faculty', activeSubjectId],
    queryFn: () => fetchQualifiedFaculty(activeSubjectId),
    enabled: open && !!activeSubjectId,
  });

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.subjectId === selectedSubjectId) ?? null,
    [subjects, selectedSubjectId],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return unscheduled;
    return unscheduled.filter((record) =>
      [record.subjectCode, record.subjectTitle, record.sectionCode]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [unscheduled, search]);

  const grouped = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        subjectId: string;
        code: string;
        title: string;
        rows: UnscheduledRecord[];
      }
    >();
    for (const record of filtered) {
      const key = `${record.subjectId}|${record.sectionId ?? record.sectionCode}`;
      const existing = groups.get(key);
      if (existing) {
        existing.rows.push(record);
        continue;
      }
      groups.set(key, {
        key,
        subjectId: record.subjectId,
        code: record.subjectCode,
        title: record.subjectTitle,
        rows: [record],
      });
    }
    return Array.from(groups.values());
  }, [filtered]);

  const rowsBySubject = useMemo(() => {
    const map = new Map<string, UnscheduledRecord[]>();
    for (const record of filtered) {
      const rows = map.get(record.subjectId);
      if (rows) rows.push(record);
      else map.set(record.subjectId, [record]);
    }
    return map;
  }, [filtered]);

  const backlogSubjectIds = useMemo(
    () => Array.from(new Set(unscheduled.map((record) => record.subjectId))),
    [unscheduled],
  );

  const { data: qualifiedPairs = [], isLoading: facultyViewLoading } = useQuery({
    queryKey: ['qualified-faculty-batch', backlogSubjectIds],
    queryFn: () => fetchQualifiedFacultyForSubjects(backlogSubjectIds),
    enabled:
      open && paletteMode === 'faculty' && backlogSubjectIds.length > 0,
  });

  const facultyGroups = useMemo(() => {
    type SubjectGroup = {
      subjectId: string;
      subjectCode: string;
      subjectTitle: string;
      rows: UnscheduledRecord[];
    };
    type FacultyGroup = {
      facultyId: string;
      firstName: string;
      lastName: string;
      deptId: string | null;
      deptCode: string | null;
      deptName: string | null;
      classification: string;
      subjects: SubjectGroup[];
    };

    const byFaculty = new Map<string, FacultyGroup>();
    for (const pair of qualifiedPairs) {
      const rows = rowsBySubject.get(pair.subjectId);
      if (!rows || rows.length === 0) continue;

      let group = byFaculty.get(pair.facultyId);
      if (!group) {
        group = {
          facultyId: pair.facultyId,
          firstName: pair.firstName,
          lastName: pair.lastName,
          deptId: pair.deptId,
          deptCode: pair.deptCode,
          deptName: pair.deptName,
          classification: pair.classification,
          subjects: [],
        };
        byFaculty.set(pair.facultyId, group);
      }
      if (group.subjects.some((s) => s.subjectId === pair.subjectId)) continue;
      group.subjects.push({
        subjectId: pair.subjectId,
        subjectCode: rows[0].subjectCode,
        subjectTitle: rows[0].subjectTitle,
        rows,
      });
    }

    const groups = Array.from(byFaculty.values());
    for (const group of groups) {
      group.subjects.sort((a, b) =>
        a.subjectCode.localeCompare(b.subjectCode),
      );
    }
    groups.sort((a, b) => {
      const aHome = a.deptId && a.deptId === deptId ? 0 : 1;
      const bHome = b.deptId && b.deptId === deptId ? 0 : 1;
      if (aHome !== bHome) return aHome - bHome;
      return `${a.lastName} ${a.firstName}`.localeCompare(
        `${b.lastName} ${b.firstName}`,
      );
    });
    return groups;
  }, [qualifiedPairs, rowsBySubject, deptId]);

  const sortedFaculty = useMemo(() => {
    return [...qualified].sort((a, b) => {
      const aHome = a.deptId && a.deptId === deptId ? 0 : 1;
      const bHome = b.deptId && b.deptId === deptId ? 0 : 1;
      if (aHome !== bHome) return aHome - bHome;
      return `${a.lastName} ${a.firstName}`.localeCompare(
        `${b.lastName} ${b.firstName}`,
      );
    });
  }, [qualified, deptId]);

  const presetFaculty = useMemo(() => {
    if (!preset?.facultyId) return null;
    return (
      qualified.find((f) => f.facultyId === preset.facultyId) ??
      facultyGroups.find((f) => f.facultyId === preset.facultyId) ??
      null
    );
  }, [preset?.facultyId, qualified, facultyGroups]);

  const modalFaculty = useMemo<FacultyOption[]>(() => {
    const options: FacultyOption[] = sortedFaculty.map((f) => ({
      facultyId: f.facultyId,
      firstName: f.firstName,
      lastName: f.lastName,
      deptId: f.deptId,
    }));
    // The subject's qualified list may still be loading when a faculty-first
    // card is dropped. Keep the chosen teacher selectable regardless.
    if (
      presetFaculty &&
      !options.some((f) => f.facultyId === presetFaculty.facultyId)
    ) {
      options.push({
        facultyId: presetFaculty.facultyId,
        firstName: presetFaculty.firstName,
        lastName: presetFaculty.lastName,
        deptId: presetFaculty.deptId,
      });
    }
    return options;
  }, [sortedFaculty, presetFaculty]);

  // Escape closes, and the overlay owns the page scroll while open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const openForRecord = (record: UnscheduledRecord, facultyId?: string) => {
    const resolvedFacultyId =
      facultyId ??
      (armed && armed.subjectId === record.subjectId
        ? armed.facultyId
        : undefined);
    setSelectedSubjectId(record.subjectId);
    if (facultyId) {
      setArmed({ subjectId: record.subjectId, facultyId });
    }
    setPreset({
      subjectId: record.subjectId,
      section: record.sectionCode,
      loadType: record.kind === 'lab' ? 'laboratory' : 'lecture',
      facultyId: resolvedFacultyId,
    });
  };

  const handleSessionDragStart = (
    event: DragEvent<HTMLDivElement>,
    record: UnscheduledRecord,
    facultyId?: string,
  ) => {
    if (moving) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(PLOT_DRAG_MIME, JSON.stringify(payloadFor(record)));
    event.dataTransfer.effectAllowed = 'copy';
    setSelectedSubjectId(record.subjectId);
    if (facultyId) {
      setArmed({ subjectId: record.subjectId, facultyId });
    }
  };

  const handleExternalDrop = (
    day: string,
    startTime: string,
    payload: ExternalPlotDragPayload,
  ) => {
    if (moving) return;
    setSelectedSubjectId(payload.subjectId);
    setPreset({
      subjectId: payload.subjectId,
      section: payload.sectionCode,
      loadType: payload.kind === 'lab' ? 'laboratory' : 'lecture',
      dayOfWeek: DAY_ABBR_TO_FULL[day] ?? day,
      startTime,
      facultyId:
        armed && armed.subjectId === payload.subjectId
          ? armed.facultyId
          : undefined,
    });
  };

  const closePlot = () => {
    setPreset(null);
    void qc.invalidateQueries({ queryKey: ['unscheduled'] });
  };

  const handleEntryMove = async (
    entryId: string,
    day: string,
    startTime: string,
  ) => {
    if (!onEntryMove || moving) return;
    setMoving(true);
    try {
      await onEntryMove(entryId, day, startTime);
    } finally {
      setMoving(false);
    }
  };

  const armedFaculty =
    armed && armed.subjectId === selectedSubjectId
      ? (sortedFaculty.find((f) => f.facultyId === armed.facultyId) ??
        facultyGroups.find((f) => f.facultyId === armed.facultyId) ??
        null)
      : null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background text-on-background">
      {/* ── Header ── */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-outline-variant bg-surface px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center border border-primary/30 bg-primary/10 text-primary">
            <Icon name="grid_view" size={20} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm font-black tracking-tight text-on-surface">
                Plotting focus mode
              </h1>
              <span className="inline-flex items-center gap-1 border border-outline-variant bg-surface-container-low px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                <Icon name="calendar_today" size={11} />
                {termLabel}
              </span>
              {deptName && (
                <span className="text-[11px] text-on-surface-variant">
                  {deptName}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-on-surface-variant">
              Drag a session onto the timetable, or pick a subject and press
              Plot. Only qualified faculty are offered.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {moving && (
            <span
              className="inline-flex items-center gap-1.5 border border-primary/30 bg-surface-container-low px-2.5 py-1.5 text-[11px] font-semibold text-primary"
              role="status"
              aria-live="polite"
            >
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              Checking conflicts…
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 border border-outline-variant bg-surface-container-low px-2.5 py-1.5 text-[11px] font-semibold text-on-surface">
            <span className="h-1.5 w-1.5 bg-amber-500" aria-hidden="true" />
            {unscheduled.length} to plot
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 border border-outline-variant px-3 py-1.5 text-xs font-bold text-on-surface transition hover:bg-surface-container-low"
          >
            <Icon name="close" size={16} />
            Exit focus
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ── Palette ── */}
        <aside className="flex max-h-[38vh] w-full shrink-0 flex-col border-b border-outline-variant bg-surface lg:max-h-none lg:w-[20rem] lg:border-b-0 lg:border-r">
          <div className="border-b border-outline-variant px-3 py-2">
            <div className="relative">
              <Icon
                name="search"
                size={15}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find subject or section…"
                className="w-full border border-outline-variant bg-surface py-1.5 pl-7 pr-2 text-xs text-on-surface outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="flex border-b border-outline-variant">
            {(['subject', 'faculty'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPaletteMode(mode)}
                className={clsx(
                  'flex-1 border-b-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition',
                  paletteMode === mode
                    ? 'border-b-primary bg-primary/5 text-primary'
                    : 'border-b-transparent text-on-surface-variant hover:bg-surface-container-low',
                )}
              >
                {mode === 'subject' ? 'By subject' : 'By faculty'}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2, 3].map((key) => (
                  <div
                    key={key}
                    className="h-16 animate-pulse bg-surface-container-low"
                  />
                ))}
              </div>
            ) : grouped.length === 0 ? (
              search.trim() ? (
                <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                  <Icon
                    name="search_off"
                    size={28}
                    className="text-on-surface-variant"
                  />
                  <p className="text-sm font-semibold text-on-surface">
                    No matching sessions
                  </p>
                  <p className="max-w-[15rem] text-xs text-on-surface-variant">
                    Clear the search to see the full plotting backlog.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                  <Icon
                    name="task_alt"
                    size={28}
                    className="text-emerald-600 dark:text-emerald-300"
                  />
                  <p className="text-sm font-semibold text-on-surface">
                    Everything is plotted
                  </p>
                  <p className="max-w-[15rem] text-xs text-on-surface-variant">
                    No unscheduled sessions remain for this department and term.
                  </p>
                </div>
              )
            ) : paletteMode === 'faculty' ? (
              facultyViewLoading ? (
                <div className="space-y-2 p-3">
                  {[0, 1, 2, 3].map((key) => (
                    <div
                      key={key}
                      className="h-16 animate-pulse bg-surface-container-low"
                    />
                  ))}
                </div>
              ) : facultyGroups.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                  <Icon
                    name="person_search"
                    size={28}
                    className="text-on-surface-variant"
                  />
                  <p className="text-sm font-semibold text-on-surface">
                    No qualified teacher found
                  </p>
                  <p className="max-w-[15rem] text-xs text-on-surface-variant">
                    None of the remaining sessions have a qualified faculty
                    member on record. Add a qualification or plot it manually.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-outline-variant/60">
                  {facultyGroups.map((group) => {
                    const isCrossDept =
                      !!group.deptId && group.deptId !== deptId;
                    const sessionCount = group.subjects.reduce(
                      (total, subject) => total + subject.rows.length,
                      0,
                    );
                    return (
                      <li key={group.facultyId} className="px-2 py-2">
                        <div className="flex items-start justify-between gap-2 border border-outline-variant/70 bg-surface px-2.5 py-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-xs font-black text-on-surface">
                                {group.lastName}, {group.firstName}
                              </span>
                              {isCrossDept && (
                                <span className="border border-sky-300 bg-sky-50 px-1 text-[9px] font-bold uppercase tracking-wide text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                                  {group.deptCode ?? 'Other dept'}
                                </span>
                              )}
                            </div>
                            <span className="mt-0.5 block truncate text-[10px] text-on-surface-variant">
                              {group.subjects.length} qualified subject
                              {group.subjects.length === 1 ? '' : 's'} ·{' '}
                              {group.classification.replace('_', ' ')}
                            </span>
                          </div>
                          <span className="shrink-0 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                            {sessionCount}
                          </span>
                        </div>

                        <ul className="mt-1.5 space-y-1.5">
                          {group.subjects.map((subject) => {
                            const active =
                              selectedSubjectId === subject.subjectId;
                            return (
                              <li
                                key={subject.subjectId}
                                className={clsx(
                                  'border px-2 py-1.5',
                                  active
                                    ? 'border-primary/40 bg-primary/5'
                                    : 'border-outline-variant/70',
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedSubjectId(subject.subjectId);
                                    setArmed({
                                      subjectId: subject.subjectId,
                                      facultyId: group.facultyId,
                                    });
                                  }}
                                  className="flex w-full items-start justify-between gap-2 text-left"
                                >
                                  <span className="min-w-0">
                                    <span className="text-[11px] font-black text-on-surface">
                                      {subject.subjectCode}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[10px] text-on-surface-variant">
                                      {subject.subjectTitle}
                                    </span>
                                  </span>
                                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-on-surface-variant">
                                    {subject.rows.length} session
                                    {subject.rows.length === 1 ? '' : 's'}
                                  </span>
                                </button>
                                <div className="mt-1 space-y-1">
                                  {subject.rows.map((record) => (
                                    <SessionRow
                                      key={record.unscheduledId}
                                      record={record}
                                      armedHere={
                                        armed?.subjectId === record.subjectId &&
                                        armed.facultyId === group.facultyId
                                      }
                                      moving={moving}
                                      onDragStart={(event, row) =>
                                        handleSessionDragStart(
                                          event,
                                          row,
                                          group.facultyId,
                                        )
                                      }
                                      onPlot={(row) =>
                                        openForRecord(row, group.facultyId)
                                      }
                                    />
                                  ))}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
              <ul className="divide-y divide-outline-variant/60">
                {grouped.map((group) => {
                  const active = selectedSubjectId === group.subjectId;
                  return (
                    <li key={group.key} className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSubjectId(group.subjectId);
                          setArmed((prev) =>
                            prev?.subjectId === group.subjectId ? prev : null,
                          );
                        }}
                        className={clsx(
                          'flex w-full items-start justify-between gap-2 border px-2.5 py-2 text-left transition',
                          active
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-outline-variant/70 bg-surface hover:bg-surface-container-low/70',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-on-surface">
                              {group.code}
                            </span>
                            {group.rows.length > 1 && (
                              <span className="bg-primary/10 px-1 text-[9px] font-bold uppercase tracking-wide text-primary">
                                {group.rows.length} sessions
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-on-surface-variant">
                            {group.title}
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                          {group.rows[0]?.sectionCode}
                        </span>
                      </button>

                      <ul className="mt-1.5 space-y-1">
                        {group.rows.map((record) => (
                          <SessionRow
                            key={record.unscheduledId}
                            record={record}
                            armedHere={armed?.subjectId === record.subjectId}
                            moving={moving}
                            onDragStart={(event, row) =>
                              handleSessionDragStart(event, row)
                            }
                            onPlot={(row) => openForRecord(row)}
                          />
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-outline-variant bg-surface-container-low/50 px-3 py-2 text-[10px] leading-relaxed text-on-surface-variant">
            Tip: switch to <strong>By faculty</strong> to see the subjects each
            teacher is qualified for, then drag a session. The drop pre-fills
            the slot and the teacher.
          </div>
        </aside>

        {/* ── Grid ── */}
        <main className="min-h-0 flex-1 overflow-auto bg-background p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
              <Icon name="ads_click" size={14} />
              Drop a session on a day and time. Existing blocks can still be
              dragged.
            </div>
            {armedFaculty && (
              <span className="inline-flex items-center gap-1.5 border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Icon name="person_check" size={12} />
                Plotting with {armedFaculty.firstName} {armedFaculty.lastName}
                <button
                  type="button"
                  onClick={() => setArmed(null)}
                  className="ml-1 text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"
                  aria-label="Clear selected faculty"
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            )}
          </div>
          <TimetableGrid
            entries={entries}
            density="fit"
            fitToContainer
            onEntryMove={handleEntryMove}
            onEntryClick={onEntryClick}
            readOnlyEntryIds={readOnlyEntryIds}
            onExternalDrop={handleExternalDrop}
            busy={moving}
          />
        </main>

        {/* ── Qualified faculty ── */}
        <aside className="hidden w-[19rem] shrink-0 flex-col border-l border-outline-variant bg-surface lg:flex">
          <div className="border-b border-outline-variant px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Qualified faculty
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold text-on-surface">
              {selectedSubject
                ? `${selectedSubject.subjectCode} · ${selectedSubject.title}`
                : 'Select a subject'}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!selectedSubjectId ? (
              <p className="px-3 py-6 text-center text-xs text-on-surface-variant">
                Pick a subject in the palette to see who is qualified to teach
                it.
              </p>
            ) : qualifiedLoading ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2].map((key) => (
                  <div
                    key={key}
                    className="h-12 animate-pulse bg-surface-container-low"
                  />
                ))}
              </div>
            ) : sortedFaculty.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <Icon
                  name="person_off"
                  size={24}
                  className="mx-auto text-on-surface-variant"
                />
                <p className="mt-2 text-xs font-semibold text-on-surface">
                  No qualified faculty
                </p>
                <p className="mt-1 text-[11px] text-on-surface-variant">
                  Add a qualification first, or use an external faculty name in
                  the plot dialog.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-outline-variant/60">
                {sortedFaculty.map((member) => {
                  const isCrossDept =
                    !!member.deptId && member.deptId !== deptId;
                  const isArmed =
                    armed?.subjectId === selectedSubjectId &&
                    armed.facultyId === member.facultyId;
                  return (
                    <li key={member.qualId}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedSubjectId) return;
                          setArmed(
                            isArmed
                              ? null
                              : {
                                  subjectId: selectedSubjectId,
                                  facultyId: member.facultyId,
                                },
                          );
                        }}
                        className={clsx(
                          'flex w-full items-start gap-2 px-3 py-2.5 text-left transition',
                          isArmed
                            ? 'bg-emerald-50/70 dark:bg-emerald-500/10'
                            : 'hover:bg-surface-container-low/70',
                        )}
                      >
                        <span
                          className={clsx(
                            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border text-[10px] font-black',
                            isArmed
                              ? 'border-emerald-400 bg-emerald-500 text-white'
                              : 'border-outline-variant bg-surface-container-low text-on-surface-variant',
                          )}
                        >
                          {isArmed ? (
                            <Icon name="check" size={14} />
                          ) : (
                            member.lastName.slice(0, 1).toUpperCase()
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1">
                            <span className="truncate text-xs font-bold text-on-surface">
                              {member.lastName}, {member.firstName}
                            </span>
                            {isCrossDept && (
                              <span className="border border-sky-300 bg-sky-50 px-1 text-[9px] font-bold uppercase tracking-wide text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                                {member.deptCode ?? 'Other dept'}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-on-surface-variant">
                            {member.deptName ?? 'Unassigned department'} ·{' '}
                            {member.classification.replace('_', ' ')}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-outline-variant bg-surface-container-low/50 px-3 py-2 text-[10px] leading-relaxed text-on-surface-variant">
            <Icon name="info" size={12} className="mr-1 inline" />
            Cross-department picks create a faculty approval request. The block
            stays pending until the other department head approves it.
          </div>
        </aside>
      </div>

      {preset && (
        <PlotSubjectModal
          open
          onClose={closePlot}
          termId={termId}
          subjects={subjects}
          faculty={modalFaculty}
          rooms={rooms}
          departments={departments}
          existingCounts={existingCounts}
          presetSubjectId={preset.subjectId}
          presetSection={preset.section}
          presetFacultyId={preset.facultyId}
          presetDayOfWeek={preset.dayOfWeek}
          presetStartTime={preset.startTime}
          presetEndTime={preset.endTime}
          presetLoadType={preset.loadType}
        />
      )}
    </div>
  );
}
