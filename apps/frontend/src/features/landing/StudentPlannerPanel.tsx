import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react';

import type {
  PublicScheduleEntry,
  PublicSchedules,
} from '../../api/public.api';
import Icon from '../../components/ui/Icon';
import Modal, { isAnyModalOpen } from '../../components/ui/Modal';
import { lockBodyScroll } from '../../lib/body-scroll-lock';
import {
  ALL_DAYS,
  DAY_ORDER,
  formatTimeRange,
  minutesToTime,
  scheduleFaculty,
  scheduleRoom,
  timeToMinutes,
  yearLabel,
} from './schedule-utils';
import {
  PLANNER_COLORS,
  blankPlannerEntry,
  computePlannerLanes,
  findPlannerConflicts,
  plannerConflictLabel,
  plannerDayColumns,
  plannerEntryFromSchedule,
  plannerSubjectLoad,
  plannerTimeRange,
  plannerTotalUnits,
  plannerUnitsLabel,
  readPlannerPlans,
  writePlannerPlans,
} from './planner/planner-utils';
import type { PlannerEntry, PlannerPlans } from './planner/types';

const HOUR_HEIGHT = 56;

const FIELD_CLASS =
  'h-10 w-full rounded-lg border border-outline-variant bg-surface px-3 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50';
const SELECT_CLASS = `${FIELD_CLASS} font-medium`;
const SECONDARY_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50';
const PRIMARY_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

interface CatalogSubjectGroup {
  key: string;
  subjectCode: string;
  subjectTitle: string;
  units: number | null;
  entries: PublicScheduleEntry[];
  missingCount: number;
}

interface CatalogSectionGroup {
  code: string;
  yearLevel: number | null;
  entries: PublicScheduleEntry[];
  missingCount: number;
  subjects: CatalogSubjectGroup[];
}

type PlannerEditorState =
  | { mode: 'add' }
  | { mode: 'edit'; entry: PlannerEntry }
  | null;

function plannerHourLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12} ${period}`;
}

function compareMeetings(
  a: PublicScheduleEntry,
  b: PublicScheduleEntry,
): number {
  const dayDiff =
    (DAY_ORDER[a.dayOfWeek] ?? 99) - (DAY_ORDER[b.dayOfWeek] ?? 99);
  if (dayDiff !== 0) return dayDiff;
  return a.startTime.localeCompare(b.startTime);
}

function buildCatalogGroups(
  entries: PublicScheduleEntry[],
  addedScheduleIds: Set<string>,
): CatalogSectionGroup[] {
  const sections = new Map<string, PublicScheduleEntry[]>();

  for (const entry of entries) {
    const code = entry.sectionCode ?? 'No section';
    const sectionEntries = sections.get(code);
    if (sectionEntries) sectionEntries.push(entry);
    else sections.set(code, [entry]);
  }

  return Array.from(sections, ([code, sectionEntries]) => {
    const subjects = new Map<string, PublicScheduleEntry[]>();
    for (const entry of sectionEntries) {
      const key = entry.subjectCode ?? 'No subject';
      const subjectEntries = subjects.get(key);
      if (subjectEntries) subjectEntries.push(entry);
      else subjects.set(key, [entry]);
    }

    const subjectGroups = Array.from(
      subjects,
      ([key, subjectEntries]) => {
        const first = subjectEntries[0];
        const units =
          subjectEntries.find((entry) => entry.units != null)?.units ?? null;
        return {
          key,
          subjectCode: first.subjectCode ?? '—',
          subjectTitle: first.subjectTitle ?? 'Untitled subject',
          units,
          entries: [...subjectEntries].sort(compareMeetings),
          missingCount: subjectEntries.filter(
            (entry) => !addedScheduleIds.has(entry.scheduleId),
          ).length,
        };
      },
    ).sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));

    const yearLevel =
      sectionEntries.find((entry) => entry.yearLevel != null)?.yearLevel ??
      null;

    return {
      code,
      yearLevel,
      entries: [...sectionEntries].sort(compareMeetings),
      missingCount: sectionEntries.filter(
        (entry) => !addedScheduleIds.has(entry.scheduleId),
      ).length,
      subjects: subjectGroups,
    };
  }).sort((a, b) => {
    if (a.yearLevel != null && b.yearLevel != null) {
      if (a.yearLevel !== b.yearLevel) return a.yearLevel - b.yearLevel;
    } else if (a.yearLevel == null && b.yearLevel != null) {
      return 1;
    } else if (a.yearLevel != null && b.yearLevel == null) {
      return -1;
    }
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });
}

function PlannerMessage({
  icon,
  title,
  hint,
  actionLabel,
  onAction,
}: {
  icon: string;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Icon name={icon} size={26} className="text-on-surface-variant" />
      <p className="text-sm font-semibold text-on-surface">{title}</p>
      {hint && (
        <p className="max-w-xs text-xs leading-relaxed text-on-surface-variant">
          {hint}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-1 rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-xs font-semibold text-on-surface transition hover:bg-surface-container"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function PlannerBlock({
  entry,
  top,
  height,
  left,
  width,
  conflict,
  onClick,
}: {
  entry: PlannerEntry;
  top: number;
  height: number;
  left: string;
  width: string;
  conflict: boolean;
  onClick: () => void;
}) {
  const { ref, isDragging } = useDraggable({
    id: entry.id,
    data: { entry },
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      title={`${entry.subjectCode} · ${entry.subjectTitle} · ${formatTimeRange(
        entry.startTime,
        entry.endTime,
      )} · Click to edit, drag to move`}
      className={`absolute z-10 cursor-grab select-none overflow-hidden rounded-md border px-1.5 py-1 text-left text-white shadow-sm transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
        conflict
          ? 'border-red-300 ring-2 ring-red-400'
          : entry.source === 'personal'
            ? 'border-dashed border-white/60'
            : 'border-white/20'
      } ${isDragging ? 'cursor-grabbing opacity-40 shadow-2xl' : ''}`}
      style={{
        top,
        height,
        left,
        width,
        backgroundColor: entry.color,
      }}
    >
      <span className="block truncate text-[11px] font-bold leading-tight">
        {entry.subjectCode}
      </span>
      {height >= 38 && entry.sectionCode && (
        <span className="block truncate text-[10px] leading-tight text-white/85">
          {entry.sectionCode}
        </span>
      )}
      {height >= 38 && (
        <span className="block truncate font-mono text-[10px] leading-tight text-white/90">
          {formatTimeRange(entry.startTime, entry.endTime)}
        </span>
      )}
      {height >= 62 && entry.room && (
        <span className="block truncate text-[10px] leading-tight text-white/80">
          {entry.room}
        </span>
      )}
    </div>
  );
}

function PlannerDropCell({
  day,
  startMinutes,
  top,
  height,
}: {
  day: string;
  startMinutes: number;
  top: number;
  height: number;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: `planner-drop-${day}-${startMinutes}`,
    data: { day, startMinutes },
  });

  return (
    <div
      ref={ref}
      aria-hidden
      className={`absolute inset-x-0 z-0 transition-colors ${
        isDropTarget
          ? 'bg-primary/10 ring-1 ring-inset ring-primary/30'
          : ''
      }`}
      style={{ top, height }}
    />
  );
}

function PlannerEditorModal({
  state,
  publishedEntry,
  onClose,
  onSave,
  onDelete,
}: {
  state: Exclude<PlannerEditorState, null>;
  publishedEntry: PublicScheduleEntry | null;
  onClose: () => void;
  onSave: (entry: PlannerEntry) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<PlannerEntry>(() =>
    state.mode === 'edit' ? state.entry : blankPlannerEntry(),
  );
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = <K extends keyof PlannerEntry>(
    key: K,
    value: PlannerEntry[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError('');
  };

  const restorePublished = () => {
    if (!publishedEntry) return;
    setDraft((current) =>
      plannerEntryFromSchedule(publishedEntry, current.id),
    );
    setError('');
    setConfirmDelete(false);
  };

  const submit = () => {
    const subjectCode = draft.subjectCode.trim();
    if (!subjectCode) {
      setError('Enter a subject code.');
      return;
    }
    if (!draft.startTime || !draft.endTime) {
      setError('Choose a start and end time.');
      return;
    }
    const start = timeToMinutes(draft.startTime);
    const end = timeToMinutes(draft.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      setError('Choose a valid start and end time.');
      return;
    }
    if (end <= start) {
      setError('The end time must be after the start time.');
      return;
    }

    onSave({
      ...draft,
      subjectCode,
      subjectTitle: draft.subjectTitle.trim() || 'Untitled subject',
      units:
        draft.units != null &&
        Number.isFinite(draft.units) &&
        draft.units >= 0
          ? draft.units
          : null,
      sectionCode: draft.sectionCode.trim(),
      facultyName: draft.facultyName.trim() || 'Unassigned',
      room: draft.room.trim() || '—',
      building: draft.building.trim(),
    });
  };

  const isPublishedCopy =
    state.mode === 'edit' && state.entry.source === 'published';

  return (
    <Modal
      open
      onClose={onClose}
      title={
        state.mode === 'edit' ? 'Edit class block' : 'Add a personal block'
      }
      description={
        isPublishedCopy
          ? 'You are editing your personal copy. The published schedule is not changed.'
          : 'Use this for consultations, study time, org meetings, or any class not in the published catalog.'
      }
      size="lg"
      footer={
        <>
          {state.mode === 'edit' &&
            (confirmDelete ? (
              <div className="mr-auto flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-red-700">
                  Remove this block?
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(draft.id)}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
              >
                <Icon name="delete" size={14} />
                Remove
              </button>
            ))}
          <button
            type="button"
            onClick={onClose}
            className={SECONDARY_BUTTON_CLASS}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className={PRIMARY_BUTTON_CLASS}
          >
            <Icon name="check" size={14} />
            Save block
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {isPublishedCopy && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-[11px] text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <Icon name="content_copy" size={14} className="text-primary" />
              Personal copy of a published class.
            </span>
            {publishedEntry && (
              <button
                type="button"
                onClick={restorePublished}
                className="font-semibold text-primary hover:underline"
              >
                Restore published values
              </button>
            )}
          </div>
        )}

        <section>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            Class details
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-on-surface-variant">
                Subject code *
              </span>
              <input
                value={draft.subjectCode}
                onChange={(event) =>
                  update('subjectCode', event.target.value)
                }
                placeholder="e.g. CS 101"
                className={FIELD_CLASS}
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-on-surface-variant">
                Subject title
              </span>
              <input
                value={draft.subjectTitle}
                onChange={(event) =>
                  update('subjectTitle', event.target.value)
                }
                placeholder="e.g. Introduction to Computing"
                className={FIELD_CLASS}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-on-surface-variant">
                Section
              </span>
              <input
                value={draft.sectionCode}
                onChange={(event) =>
                  update('sectionCode', event.target.value)
                }
                placeholder="e.g. BSCS-1A"
                className={FIELD_CLASS}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-on-surface-variant">
                Units
              </span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={draft.units ?? ''}
                onChange={(event) => {
                  const raw = event.target.value;
                  const parsed = Number(raw);
                  update(
                    'units',
                    raw === '' || !Number.isFinite(parsed) || parsed < 0
                      ? null
                      : parsed,
                  );
                }}
                placeholder="e.g. 3"
                className={FIELD_CLASS}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-on-surface-variant">
                Load type
              </span>
              <select
                value={draft.loadType ?? 'other'}
                onChange={(event) =>
                  update('loadType', event.target.value)
                }
                className={SELECT_CLASS}
              >
                <option value="lecture">Lecture</option>
                <option value="laboratory">Laboratory</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            Schedule
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-on-surface-variant">
                Day
              </span>
              <select
                value={draft.dayOfWeek}
                onChange={(event) =>
                  update('dayOfWeek', event.target.value)
                }
                className={SELECT_CLASS}
              >
                {ALL_DAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-on-surface-variant">
                Start time
              </span>
              <input
                type="time"
                step={300}
                value={draft.startTime}
                onChange={(event) =>
                  update('startTime', event.target.value)
                }
                className={FIELD_CLASS}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-on-surface-variant">
                End time
              </span>
              <input
                type="time"
                step={300}
                value={draft.endTime}
                onChange={(event) =>
                  update('endTime', event.target.value)
                }
                className={FIELD_CLASS}
              />
            </label>
          </div>
        </section>

        <section>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            Location and instructor
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-on-surface-variant">
                Faculty
              </span>
              <input
                value={draft.facultyName}
                onChange={(event) =>
                  update('facultyName', event.target.value)
                }
                placeholder="Unassigned"
                className={FIELD_CLASS}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-on-surface-variant">
                Room
              </span>
              <input
                value={draft.room}
                onChange={(event) => update('room', event.target.value)}
                placeholder="e.g. CE 201"
                className={FIELD_CLASS}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-on-surface-variant">
                Building
              </span>
              <input
                value={draft.building}
                onChange={(event) =>
                  update('building', event.target.value)
                }
                placeholder="e.g. Engineering Building"
                className={FIELD_CLASS}
              />
            </label>
          </div>
        </section>

        <section>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            Block color
          </p>
          <div className="flex flex-wrap gap-2">
            {PLANNER_COLORS.map((color) => {
              const selected = draft.color === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => update('color', color)}
                  aria-label={`Use block color ${color}`}
                  aria-pressed={selected}
                  className={`h-7 w-7 rounded-full border-2 transition ${
                    selected
                      ? 'border-on-surface'
                      : 'border-transparent hover:scale-110'
                  }`}
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </div>
        </section>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export default function StudentPlannerPanel({
  data,
  isLoading,
  isError,
  onRetry,
  selectedTermId,
  onTermChange,
}: {
  data: PublicSchedules | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  selectedTermId: string;
  onTermChange: (termId: string) => void;
}) {
  const [plans, setPlans] = useState<PlannerPlans>(() =>
    readPlannerPlans(),
  );
  const [department, setDepartment] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(),
  );
  const [editorState, setEditorState] =
    useState<PlannerEditorState>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const lastScopeRef = useRef('');

  useEffect(() => {
    writePlannerPlans(plans);
  }, [plans]);

  // Focus mode reuses this same panel in a full-screen shell. Use the shared,
  // reference-counted scroll lock so the editor / clear-confirm modals cannot
  // restore a stale `hidden` value and leave the landing page with no
  // scrollbar after focus mode exits.
  useEffect(() => {
    if (!focusMode) return;
    const releaseBodyLock = lockBodyScroll();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // A shared Modal handles its own Escape — close that first.
      if (isAnyModalOpen()) return;
      setFocusMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseBodyLock();
      window.removeEventListener('keydown', onKey);
    };
  }, [focusMode]);

  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);

  const departments = useMemo(() => {
    const codes = new Set<string>();
    for (const entry of entries) {
      if (entry.departmentCode) codes.add(entry.departmentCode);
    }
    return Array.from(codes).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const departmentEntries = useMemo(() => {
    if (!department) return [];
    return entries.filter(
      (entry) => entry.departmentCode === department,
    );
  }, [department, entries]);

  const yearOptions = useMemo(() => {
    const values = new Set<number | null>();
    for (const entry of departmentEntries) {
      values.add(entry.yearLevel);
    }
    return Array.from(values).sort((a, b) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return a - b;
    });
  }, [departmentEntries]);

  const yearEntries = useMemo(() => {
    if (!yearFilter) return departmentEntries;
    if (yearFilter === 'none') {
      return departmentEntries.filter((entry) => entry.yearLevel == null);
    }
    const year = Number(yearFilter);
    return departmentEntries.filter((entry) => entry.yearLevel === year);
  }, [departmentEntries, yearFilter]);

  const sectionOptions = useMemo(() => {
    const options = new Map<string, number | null>();
    for (const entry of yearEntries) {
      const code = entry.sectionCode ?? 'No section';
      if (!options.has(code)) options.set(code, entry.yearLevel);
    }
    return Array.from(options, ([code, yearLevel]) => ({
      code,
      yearLevel,
    })).sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true }),
    );
  }, [yearEntries]);

  useEffect(() => {
    if (department && !departments.includes(department)) {
      setDepartment('');
      setYearFilter('');
      setSectionFilter('');
      setSearch('');
      setExpandedSections(new Set());
    }
  }, [department, departments]);

  useEffect(() => {
    if (!yearFilter) return;
    const exists =
      yearFilter === 'none'
        ? yearOptions.includes(null)
        : yearOptions.some(
            (year) => year != null && String(year) === yearFilter,
          );
    if (!exists) setYearFilter('');
  }, [yearFilter, yearOptions]);

  useEffect(() => {
    if (
      sectionFilter &&
      !sectionOptions.some((section) => section.code === sectionFilter)
    ) {
      setSectionFilter('');
    }
  }, [sectionFilter, sectionOptions]);

  useEffect(() => {
    const scope = `${department}|${yearFilter}`;
    if (lastScopeRef.current === scope) return;
    lastScopeRef.current = scope;
    setExpandedSections(
      new Set(
        sectionOptions.length > 0 ? [sectionOptions[0].code] : [],
      ),
    );
  }, [department, sectionOptions, yearFilter]);

  const planEntries = useMemo(
    () => (selectedTermId ? plans[selectedTermId] ?? [] : []),
    [plans, selectedTermId],
  );

  const addedScheduleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of planEntries) {
      if (entry.scheduleId) ids.add(entry.scheduleId);
    }
    return ids;
  }, [planEntries]);

  const catalogScopeEntries = useMemo(() => {
    if (!department) return [];
    if (!sectionFilter) return yearEntries;
    return yearEntries.filter(
      (entry) => (entry.sectionCode ?? 'No section') === sectionFilter,
    );
  }, [department, sectionFilter, yearEntries]);

  const catalogEntries = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return catalogScopeEntries;

    const matchingSubjects = new Set<string>();
    for (const entry of catalogScopeEntries) {
      const haystack = [
        entry.subjectCode,
        entry.subjectTitle,
        entry.sectionCode,
        scheduleFaculty(entry),
        scheduleRoom(entry),
        entry.building,
        entry.dayOfWeek,
        entry.loadType,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (haystack.includes(needle)) {
        matchingSubjects.add(
          `${entry.sectionCode ?? ''}|${entry.subjectCode ?? ''}`,
        );
      }
    }

    return catalogScopeEntries.filter((entry) =>
      matchingSubjects.has(
        `${entry.sectionCode ?? ''}|${entry.subjectCode ?? ''}`,
      ),
    );
  }, [catalogScopeEntries, search]);

  const catalogGroups = useMemo(
    () => buildCatalogGroups(catalogEntries, addedScheduleIds),
    [addedScheduleIds, catalogEntries],
  );

  const conflicts = useMemo(
    () => findPlannerConflicts(planEntries),
    [planEntries],
  );

  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    for (const conflict of conflicts) {
      ids.add(conflict.first.id);
      ids.add(conflict.second.id);
    }
    return ids;
  }, [conflicts]);

  const dayColumns = useMemo(
    () => plannerDayColumns(planEntries),
    [planEntries],
  );

  const { startMinutes, endMinutes } = useMemo(
    () => plannerTimeRange(planEntries),
    [planEntries],
  );

  const lanes = useMemo(
    () => computePlannerLanes(planEntries),
    [planEntries],
  );

  const entriesByDay = useMemo(() => {
    const byDay = new Map<string, PlannerEntry[]>();
    for (const day of dayColumns) byDay.set(day, []);
    for (const entry of planEntries) {
      const dayEntries = byDay.get(entry.dayOfWeek);
      if (dayEntries) dayEntries.push(entry);
      else byDay.set(entry.dayOfWeek, [entry]);
    }
    return byDay;
  }, [dayColumns, planEntries]);

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let minutes = startMinutes; minutes <= endMinutes; minutes += 60) {
      marks.push(minutes);
    }
    return marks;
  }, [endMinutes, startMinutes]);

  const halfHourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let minutes = startMinutes; minutes <= endMinutes; minutes += 30) {
      marks.push(minutes);
    }
    return marks;
  }, [endMinutes, startMinutes]);

  const legend = useMemo(() => {
    const items = new Map<
      string,
      { key: string; code: string; color: string; personal: boolean }
    >();
    for (const entry of planEntries) {
      const key = `${entry.subjectCode}|${entry.sectionCode}|${entry.color}`;
      if (!items.has(key)) {
        items.set(key, {
          key,
          code: entry.subjectCode,
          color: entry.color,
          personal: entry.source === 'personal',
        });
      }
    }
    return Array.from(items.values()).sort((a, b) =>
      a.code.localeCompare(b.code),
    );
  }, [planEntries]);

  const totalMinutes = planEntries.reduce((total, entry) => {
    const start = timeToMinutes(entry.startTime);
    const end = timeToMinutes(entry.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return total;
    return total + Math.max(0, end - start);
  }, 0);
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const subjectLoad = useMemo(
    () => plannerSubjectLoad(planEntries),
    [planEntries],
  );
  const totalUnits = useMemo(
    () => plannerTotalUnits(planEntries),
    [planEntries],
  );
  const subjectsWithoutUnits = subjectLoad.filter(
    (subject) => subject.units == null,
  ).length;
  const subjectCount = new Set(
    planEntries.map(
      (entry) => `${entry.subjectCode}|${entry.sectionCode}`,
    ),
  ).size;

  const termLabel =
    data?.term?.termCode ?? data?.term?.termName ?? 'Current term';
  const hasActiveFilters = Boolean(
    yearFilter || sectionFilter || search.trim(),
  );

  const editorPublishedEntry = useMemo(() => {
    if (!editorState || editorState.mode !== 'edit') return null;
    const { entry } = editorState;
    if (entry.source !== 'published' || !entry.scheduleId) return null;
    return (
      entries.find(
        (published) => published.scheduleId === entry.scheduleId,
      ) ?? null
    );
  }, [editorState, entries]);

  const bodyHeight = ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT;

  const resetFilters = () => {
    setYearFilter('');
    setSectionFilter('');
    setSearch('');
    setExpandedSections(new Set());
  };

  const handleDepartmentChange = (value: string) => {
    setDepartment(value);
    setYearFilter('');
    setSectionFilter('');
    setSearch('');
    setExpandedSections(new Set());
  };

  const handleYearChange = (value: string) => {
    setYearFilter(value);
    setSectionFilter('');
    setExpandedSections(new Set());
  };

  const handleSectionChange = (value: string) => {
    setSectionFilter(value);
    if (value) {
      setExpandedSections((current) => new Set(current).add(value));
    }
  };

  const toggleSection = (code: string) => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedSections(new Set(catalogGroups.map((group) => group.code)));
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  const addPublishedEntries = (sourceEntries: PublicScheduleEntry[]) => {
    if (!selectedTermId) return;
    setPlans((current) => {
      const existing = current[selectedTermId] ?? [];
      const existingScheduleIds = new Set(
        existing
          .map((entry) => entry.scheduleId)
          .filter((id): id is string => Boolean(id)),
      );
      const additions = sourceEntries
        .filter((entry) => !existingScheduleIds.has(entry.scheduleId))
        .map((entry) => plannerEntryFromSchedule(entry));
      if (additions.length === 0) return current;
      return {
        ...current,
        [selectedTermId]: [...existing, ...additions],
      };
    });
  };

  const savePlannerEntry = (entry: PlannerEntry) => {
    if (!selectedTermId) return;
    setPlans((current) => {
      const existing = current[selectedTermId] ?? [];
      const found = existing.some((item) => item.id === entry.id);
      return {
        ...current,
        [selectedTermId]: found
          ? existing.map((item) => (item.id === entry.id ? entry : item))
          : [...existing, entry],
      };
    });
    setEditorState(null);
  };

  const deletePlannerEntry = (id: string) => {
    if (!selectedTermId) return;
    setPlans((current) => ({
      ...current,
      [selectedTermId]: (current[selectedTermId] ?? []).filter(
        (entry) => entry.id !== id,
      ),
    }));
    setEditorState(null);
  };

  const clearPlan = () => {
    if (!selectedTermId) return;
    setPlans((current) => ({ ...current, [selectedTermId]: [] }));
    setClearOpen(false);
  };

  const exportPlanner = async (format: 'pdf' | 'png') => {
    if (!selectedTermId || planEntries.length === 0 || exporting) return;
    setExporting(format);
    setExportError(null);

    try {
      const { downloadStudentPlannerPdf, downloadStudentPlannerPng } =
        await import('./planner/exportStudentPlanner');
      const props = { entries: planEntries, termLabel };
      const fileBase = `student-planner-${termLabel}-${new Date()
        .toISOString()
        .slice(0, 10)}`;

      if (format === 'pdf') {
        await downloadStudentPlannerPdf(props, `${fileBase}.pdf`);
      } else {
        await downloadStudentPlannerPng(props, `${fileBase}.png`);
      }
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : 'Export failed. Please try again.',
      );
    } finally {
      setExporting(null);
    }
  };

  const handlePlannerDragEnd = (event: any) => {
    const source = event.operation?.source;
    const target = event.operation?.target;
    if (!source || !target || !selectedTermId) return;

    const entry = source.data?.entry as PlannerEntry | undefined;
    const cell = target.data as
      | { day?: unknown; startMinutes?: unknown }
      | undefined;

    if (
      !entry ||
      !cell ||
      typeof cell.day !== 'string' ||
      typeof cell.startMinutes !== 'number'
    ) {
      return;
    }

    const day = cell.day;
    const startMinutes = cell.startMinutes;
    const duration =
      timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime);
    if (!Number.isFinite(duration) || duration <= 0) return;

    const endMinutes = startMinutes + duration;
    if (startMinutes < 0 || endMinutes > 24 * 60) return;

    setPlans((current) => ({
      ...current,
      [selectedTermId]: (current[selectedTermId] ?? []).map((item) =>
        item.id === entry.id
          ? {
              ...item,
              dayOfWeek: day,
              startTime: minutesToTime(startMinutes),
              endTime: minutesToTime(endMinutes),
            }
          : item,
      ),
    }));
  };

  const canPlan = Boolean(selectedTermId);

  return (
    <div
      className={
        focusMode
          ? 'fixed inset-0 z-[100] space-y-5 overflow-y-auto bg-background p-4 sm:p-6'
          : 'mt-5 space-y-5'
      }
    >
      {focusMode && (
        <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-outline-variant bg-surface/95 px-4 py-2.5 shadow-sm backdrop-blur-sm sm:-mx-6 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Icon name="calendar_month" size={18} className="text-primary" />
            <span className="truncate text-sm font-bold text-on-surface">
              Student planner · focus mode
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFocusMode(false)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-bold text-on-surface transition hover:bg-surface-container-low"
          >
            <Icon name="close" size={16} />
            Exit focus
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-on-surface">
              Build your weekly schedule
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-on-surface-variant">
              Pick a published department, year level, and section, then add
              the classes you are taking. You can also create personal blocks
              for consultations, study time, or org meetings. Your plan is
              saved in this browser for each term.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFocusMode(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition hover:opacity-90"
            >
              <Icon name="fullscreen" size={15} />
              Focus mode
            </button>
            <button
              type="button"
              onClick={() => setEditorState({ mode: 'add' })}
              disabled={!canPlan}
              className={SECONDARY_BUTTON_CLASS}
            >
              <Icon name="add" size={15} />
              Personal block
            </button>
            <button
              type="button"
              onClick={() => setClearOpen(true)}
              disabled={!canPlan || planEntries.length === 0}
              className={SECONDARY_BUTTON_CLASS}
            >
              <Icon name="delete_sweep" size={15} />
              Clear plan
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Academic term
            </span>
            <select
              value={selectedTermId}
              onChange={(event) => onTermChange(event.target.value)}
              disabled={!data?.terms.length}
              className={SELECT_CLASS}
            >
              {(data?.terms ?? []).map((term) => (
                <option key={term.termId} value={term.termId}>
                  {term.termCode ?? term.termName} ({term.publishedCount})
                </option>
              ))}
              {!data?.terms.length && (
                <option value="">No published terms</option>
              )}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Department
            </span>
            <select
              value={department}
              onChange={(event) =>
                handleDepartmentChange(event.target.value)
              }
              disabled={!departments.length}
              className={SELECT_CLASS}
            >
              <option value="">
                {departments.length
                  ? 'Select a department…'
                  : 'No published departments'}
              </option>
              {departments.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Year level
            </span>
            <select
              value={yearFilter}
              onChange={(event) => handleYearChange(event.target.value)}
              disabled={!department}
              className={SELECT_CLASS}
            >
              <option value="">All year levels</option>
              {yearOptions.map((year) => (
                <option
                  key={year == null ? 'none' : String(year)}
                  value={year == null ? 'none' : String(year)}
                >
                  {yearLabel(year)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Section
            </span>
            <select
              value={sectionFilter}
              onChange={(event) =>
                handleSectionChange(event.target.value)
              }
              disabled={!department || !sectionOptions.length}
              className={SELECT_CLASS}
            >
              <option value="">All sections</option>
              {sectionOptions.map((section) => (
                <option key={section.code} value={section.code}>
                  {section.code}
                  {!yearFilter
                    ? ` · ${yearLabel(section.yearLevel)}`
                    : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-on-surface-variant">
            {department ? (
              <>
                Showing{' '}
                <strong className="text-on-surface">
                  {catalogEntries.length}
                </strong>{' '}
                of {departmentEntries.length} published meetings
                {yearFilter
                  ? ` · ${yearLabel(
                      yearFilter === 'none'
                        ? null
                        : Number(yearFilter),
                    )}`
                  : ''}
                {sectionFilter ? ` · ${sectionFilter}` : ''}
              </>
            ) : (
              'Choose a department to browse published classes.'
            )}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline"
            >
              <Icon name="restart_alt" size={14} />
              Reset filters
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
          <header className="border-b border-outline-variant p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-on-surface">
                  Published classes
                </h3>
                <p className="mt-0.5 text-[11px] text-on-surface-variant">
                  {department
                    ? `${department} · ${yearFilter ? yearLabel(
                        yearFilter === 'none'
                          ? null
                          : Number(yearFilter),
                      ) : 'All year levels'}`
                    : 'Catalog'}
                </p>
              </div>
              <span className="rounded-full border border-outline-variant bg-surface-container-low px-2.5 py-1 text-[10px] font-bold text-on-surface-variant">
                {catalogEntries.length} meetings
              </span>
            </div>

            <label className="relative mt-3 block">
              <span className="sr-only">
                Search published classes
              </span>
              <Icon
                name="search"
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                disabled={!department}
                placeholder="Search subject, section, faculty, room…"
                className={`${FIELD_CLASS} pl-9`}
              />
            </label>

            {catalogGroups.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  {catalogGroups.length} section
                  {catalogGroups.length === 1 ? '' : 's'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="text-[10px] font-semibold text-primary hover:underline"
                  >
                    Expand all
                  </button>
                  <span className="text-on-surface-variant/40">·</span>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="text-[10px] font-semibold text-primary hover:underline"
                  >
                    Collapse all
                  </button>
                </div>
              </div>
            )}
          </header>

          <div className="max-h-[70vh] flex-1 overflow-y-auto p-3">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-on-surface-variant">
                <Icon name="progress_activity" size={18} spin />
                Loading published classes…
              </div>
            ) : isError ? (
              <PlannerMessage
                icon="warning"
                title="Published classes are unavailable."
                hint="Please try again in a moment."
                actionLabel="Retry"
                onAction={onRetry}
              />
            ) : entries.length === 0 ? (
              <PlannerMessage
                icon="event_busy"
                title="No published classes yet."
                hint="Published class blocks will appear here once the college publishes them."
              />
            ) : !department ? (
              <PlannerMessage
                icon="account_balance"
                title="Choose a department"
                hint="Published schedules are organized by department. Pick one above, then narrow the catalog by year level and section."
              />
            ) : catalogEntries.length === 0 ? (
              <PlannerMessage
                icon="search_off"
                title="No classes match these filters."
                hint="Try another section, year level, or search term."
                actionLabel={hasActiveFilters ? 'Reset filters' : undefined}
                onAction={hasActiveFilters ? resetFilters : undefined}
              />
            ) : (
              <div>
                {catalogGroups.map((group) => {
                  const expanded = expandedSections.has(group.code);
                  return (
                    <div
                      key={group.code}
                      className="border-b border-outline-variant last:border-b-0"
                    >
                      <div className="flex items-center gap-2 px-2.5 py-2">
                        <button
                          type="button"
                          onClick={() => toggleSection(group.code)}
                          aria-expanded={expanded}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <Icon
                            name={expanded ? 'expand_less' : 'expand_more'}
                            size={17}
                            className="shrink-0 text-on-surface-variant"
                          />
                          <span className="truncate text-sm font-bold text-on-surface">
                            {group.code}
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                            {yearLabel(group.yearLevel)}
                          </span>
                          <span className="shrink-0 rounded-full bg-surface-container-low px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">
                            {group.entries.length}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => addPublishedEntries(group.entries)}
                          disabled={group.missingCount === 0 || !canPlan}
                          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold transition ${
                            group.missingCount === 0
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-primary/20 bg-primary/5 text-primary hover:bg-primary/10'
                          } disabled:cursor-default disabled:opacity-80`}
                        >
                          <Icon
                            name={
                              group.missingCount === 0 ? 'check' : 'add'
                            }
                            size={12}
                          />
                          {group.missingCount === 0
                            ? 'Added'
                            : 'Add section'}
                        </button>
                      </div>

                      {expanded && (
                        <div className="border-t border-outline-variant/60 bg-surface-container-low/20 p-2">
                          {group.subjects.map((subject) => (
                            <div
                              key={`${group.code}-${subject.key}`}
                              className="border-t border-outline-variant/50 first:border-t-0"
                            >
                              <div className="flex items-start justify-between gap-2 px-2.5 py-2">
                                <div className="min-w-0">
                                  <p className="flex items-center gap-1.5 text-xs font-bold text-on-surface">
                                    <span className="truncate">
                                      {subject.subjectCode}
                                    </span>
                                    <span
                                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                                        subject.units == null
                                          ? 'bg-amber-50 text-amber-800'
                                          : 'bg-surface-container-low text-on-surface-variant'
                                      }`}
                                      title={
                                        subject.units == null
                                          ? 'Units are not set for this subject'
                                          : `${subject.units} units`
                                      }
                                    >
                                      {plannerUnitsLabel(subject.units)}
                                    </span>
                                  </p>
                                  <p className="truncate text-[11px] text-on-surface-variant">
                                    {subject.subjectTitle}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    addPublishedEntries(subject.entries)
                                  }
                                  disabled={
                                    subject.missingCount === 0 || !canPlan
                                  }
                                  className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition ${
                                    subject.missingCount === 0
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                      : 'border-primary/20 bg-primary/5 text-primary hover:bg-primary/10'
                                  } disabled:cursor-default disabled:opacity-80`}
                                >
                                  <Icon
                                    name={
                                      subject.missingCount === 0
                                        ? 'check'
                                        : 'add'
                                    }
                                    size={11}
                                  />
                                  {subject.missingCount === 0
                                    ? 'Added'
                                    : 'Add subject'}
                                </button>
                              </div>

                              <ul className="divide-y divide-outline-variant/60 border-t border-outline-variant/60">
                                {subject.entries.map((entry) => {
                                  const added = addedScheduleIds.has(
                                    entry.scheduleId,
                                  );
                                  const room = scheduleRoom(entry);
                                  return (
                                    <li
                                      key={entry.scheduleId}
                                      className="flex items-start justify-between gap-2 px-2.5 py-1.5"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-[11px] font-semibold text-on-surface">
                                          {entry.dayOfWeek} ·{' '}
                                          {formatTimeRange(
                                            entry.startTime,
                                            entry.endTime,
                                          )}
                                        </p>
                                        <p className="truncate text-[10px] text-on-surface-variant">
                                          {room}
                                          {entry.building
                                            ? ` · ${entry.building}`
                                            : ''}{' '}
                                          · {scheduleFaculty(entry)}
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          addPublishedEntries([entry])
                                        }
                                        disabled={added || !canPlan}
                                        aria-label={
                                          added
                                            ? 'Already in your plan'
                                            : 'Add this meeting'
                                        }
                                        title={
                                          added
                                            ? 'Already in your plan'
                                            : 'Add this meeting'
                                        }
                                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition ${
                                          added
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                            : 'border-outline-variant bg-surface text-on-surface-variant hover:border-primary/30 hover:bg-primary/5 hover:text-primary'
                                        } disabled:cursor-default`}
                                      >
                                        <Icon
                                          name={added ? 'check' : 'add'}
                                          size={14}
                                        />
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm">
          <header className="border-b border-outline-variant p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-on-surface">
                  {termLabel}
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-low px-2.5 py-1 text-[10px] font-semibold text-on-surface-variant">
                    <Icon name="class" size={12} />
                    {planEntries.length} block
                    {planEntries.length === 1 ? '' : 's'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-low px-2.5 py-1 text-[10px] font-semibold text-on-surface-variant">
                    <Icon name="schedule" size={12} />
                    {totalHours} hr{totalHours === 1 ? '' : 's'} / week
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-low px-2.5 py-1 text-[10px] font-semibold text-on-surface-variant">
                    <Icon name="library_books" size={12} />
                    {subjectCount} subject
                    {subjectCount === 1 ? '' : 's'}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                      subjectsWithoutUnits > 0
                        ? 'border-amber-300/70 bg-amber-50 text-amber-900'
                        : 'border-outline-variant bg-surface-container-low text-on-surface-variant'
                    }`}
                    title={
                      subjectsWithoutUnits > 0
                        ? `${subjectsWithoutUnits} subject${
                            subjectsWithoutUnits === 1 ? ' has' : 's have'
                          } no units set`
                        : 'Total units in this plan'
                    }
                  >
                    <Icon name="calculate" size={12} />
                    {plannerUnitsLabel(totalUnits)} total
                    {subjectsWithoutUnits > 0
                      ? ` · ${subjectsWithoutUnits} missing`
                      : ''}
                  </span>
                  {conflicts.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-900">
                      <Icon name="warning" size={12} />
                      {conflicts.length} conflict
                      {conflicts.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void exportPlanner('pdf')}
                  disabled={planEntries.length === 0 || exporting !== null}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  <Icon
                    name={
                      exporting === 'pdf'
                        ? 'progress_activity'
                        : 'picture_as_pdf'
                    }
                    size={15}
                    spin={exporting === 'pdf'}
                  />
                  {exporting === 'pdf' ? 'Preparing…' : 'PDF'}
                </button>
                <button
                  type="button"
                  onClick={() => void exportPlanner('png')}
                  disabled={planEntries.length === 0 || exporting !== null}
                  className={PRIMARY_BUTTON_CLASS}
                >
                  <Icon
                    name={
                      exporting === 'png'
                        ? 'progress_activity'
                        : 'download'
                    }
                    size={15}
                    spin={exporting === 'png'}
                  />
                  {exporting === 'png' ? 'Rendering…' : 'PNG'}
                </button>
              </div>
            </div>

            {exportError && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
                <Icon
                  name="warning"
                  size={14}
                  className="mt-0.5 shrink-0"
                />
                <span>{exportError}</span>
              </div>
            )}

            {conflicts.length > 0 && (
              <div className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-amber-900">
                <p className="flex items-center gap-2 text-xs font-bold">
                  <Icon name="warning" size={15} />
                  {conflicts.length} time conflict
                  {conflicts.length === 1 ? '' : 's'} to review
                </p>
                <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed">
                  {conflicts.slice(0, 4).map((conflict) => (
                    <li
                      key={`${conflict.first.id}-${conflict.second.id}`}
                    >
                      {plannerConflictLabel(conflict)}
                    </li>
                  ))}
                </ul>
                {conflicts.length > 4 && (
                  <p className="mt-1 text-[10px] opacity-80">
                    +{conflicts.length - 4} more. Highlighted blocks show
                    the clashes.
                  </p>
                )}
              </div>
            )}
          </header>

          <div className="p-3 sm:p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant sm:hidden">
              <Icon name="swipe" size={14} />
              Swipe to see the full week
            </p>
            <DragDropProvider onDragEnd={handlePlannerDragEnd}>
            <div className="relative overflow-hidden rounded-xl border border-outline-variant">
              <div className="overflow-x-auto [scrollbar-width:thin]">
                <div className="min-w-[720px]">
                  <div className="flex border-b border-outline-variant bg-surface-container-low">
                    <div className="flex w-14 shrink-0 items-center justify-center border-r border-outline-variant px-1 py-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Time
                    </div>
                    <div
                      className="grid flex-1"
                      style={{
                        gridTemplateColumns: `repeat(${dayColumns.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {dayColumns.map((day) => (
                        <div
                          key={day}
                          className="border-l border-outline-variant px-1 py-2 text-center first:border-l-0"
                        >
                          <span className="inline-flex rounded-md border border-outline-variant bg-surface px-1.5 py-0.5 text-[10px] font-bold text-on-surface-variant">
                            {day}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex">
                    <div
                      className="relative w-14 shrink-0 border-r border-outline-variant bg-surface-container-low/40"
                      style={{ height: bodyHeight }}
                    >
                      {hourMarks.map((minutes) => {
                        const isFirst = minutes === startMinutes;
                        const isLast = minutes === endMinutes;
                        return (
                          <div
                            key={minutes}
                            className={`absolute right-1 text-[10px] font-medium text-on-surface-variant ${
                              isFirst
                                ? ''
                                : isLast
                                  ? '-translate-y-full'
                                  : '-translate-y-1/2'
                            }`}
                            style={{
                              top:
                                ((minutes - startMinutes) / 60) *
                                HOUR_HEIGHT,
                            }}
                          >
                            {plannerHourLabel(minutes)}
                          </div>
                        );
                      })}
                    </div>

                    <div
                      className="grid flex-1"
                      style={{
                        gridTemplateColumns: `repeat(${dayColumns.length}, minmax(0, 1fr))`,
                        height: bodyHeight,
                      }}
                    >
                      {dayColumns.map((day) => (
                        <div
                          key={day}
                          className="relative border-l border-outline-variant first:border-l-0"
                        >
                          {halfHourMarks.map((minutes) => {
                            const isHour = minutes % 60 === 0;
                            return (
                              <div
                                key={minutes}
                                className={`pointer-events-none absolute inset-x-0 border-t ${
                                  isHour
                                    ? 'border-outline-variant'
                                    : 'border-outline-variant/40'
                                }`}
                                style={{
                                  top:
                                    ((minutes - startMinutes) / 60) *
                                    HOUR_HEIGHT,
                                }}
                              />
                            );
                          })}

                          {halfHourMarks.map((minutes) => {
                            if (minutes >= endMinutes) return null;
                            return (
                              <PlannerDropCell
                                key={`drop-${minutes}`}
                                day={day}
                                startMinutes={minutes}
                                top={
                                  ((minutes - startMinutes) / 60) *
                                  HOUR_HEIGHT
                                }
                                height={
                                  (Math.min(30, endMinutes - minutes) / 60) *
                                  HOUR_HEIGHT
                                }
                              />
                            );
                          })}

                          {(entriesByDay.get(day) ?? []).map((entry) => {
                            const start = timeToMinutes(entry.startTime);
                            const end = timeToMinutes(entry.endTime);
                            const top =
                              ((start - startMinutes) / 60) * HOUR_HEIGHT;
                            const height = Math.max(
                              ((end - start) / 60) * HOUR_HEIGHT - 2,
                              18,
                            );
                            const laneInfo = lanes.get(entry.id);
                            const laneCount = laneInfo?.laneCount ?? 1;
                            const lane = laneInfo?.lane ?? 0;
                            const left = (lane / laneCount) * 100;
                            const width = (1 / laneCount) * 100;
                            const conflict = conflictIds.has(entry.id);

                            return (
                              <PlannerBlock
                                key={entry.id}
                                entry={entry}
                                top={top}
                                height={height}
                                left={`calc(${left}% + 2px)`}
                                width={`calc(${width}% - 4px)`}
                                conflict={conflict}
                                onClick={() =>
                                  setEditorState({
                                    mode: 'edit',
                                    entry,
                                  })
                                }
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {planEntries.length === 0 && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
                  <div className="rounded-xl border border-dashed border-outline-variant bg-surface/95 px-5 py-4 text-center shadow-sm">
                    <Icon
                      name="calendar_month"
                      size={24}
                      className="mx-auto text-on-surface-variant"
                    />
                    <p className="mt-2 text-sm font-semibold text-on-surface">
                      Your week is empty
                    </p>
                    <p className="mt-1 max-w-xs text-xs leading-relaxed text-on-surface-variant">
                      Add a published class from the catalog or create a
                      personal block to get started.
                    </p>
                  </div>
                </div>
              )}
            </div>
            </DragDropProvider>

            {legend.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-outline-variant pt-3">
                {legend.map((item) => (
                  <span
                    key={item.key}
                    className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-on-surface-variant"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.code}
                    {item.personal ? ' · personal' : ''}
                  </span>
                ))}
                <span className="ml-auto text-[10px] text-on-surface-variant/80">
                  Click any block to edit. Dashed blocks are personal.
                </span>
              </div>
            )}

            {subjectLoad.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-xl border border-outline-variant">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-low px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                    <Icon name="calculate" size={13} />
                    Subject load
                  </p>
                  <p className="text-[10px] text-on-surface-variant">
                    Units count once per subject and section.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-outline-variant text-[10px] uppercase tracking-wider text-on-surface-variant">
                        <th className="px-3 py-1.5 font-semibold">
                          Subject
                        </th>
                        <th className="px-2 py-1.5 font-semibold">
                          Section
                        </th>
                        <th className="px-2 py-1.5 text-right font-semibold">
                          Units
                        </th>
                        <th className="px-2 py-1.5 text-right font-semibold">
                          Hours / week
                        </th>
                        <th className="px-2 py-1.5 text-right font-semibold">
                          Meetings
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/60">
                      {subjectLoad.map((subject) => (
                        <tr key={subject.key}>
                          <td className="px-3 py-1.5">
                            <span className="font-semibold text-on-surface">
                              {subject.subjectCode}
                            </span>
                            <span className="block truncate text-[10px] text-on-surface-variant">
                              {subject.subjectTitle}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-on-surface-variant">
                            {subject.sectionCode || '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold text-on-surface">
                            {subject.units == null ? (
                              <span className="text-amber-800">
                                Not set
                              </span>
                            ) : (
                              Math.round(subject.units * 10) / 10
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right text-on-surface-variant">
                            {Math.round((subject.minutes / 60) * 10) / 10}
                          </td>
                          <td className="px-2 py-1.5 text-right text-on-surface-variant">
                            {subject.meetings}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-outline-variant bg-surface-container-low/60">
                      <tr className="font-bold text-on-surface">
                        <td className="px-3 py-1.5" colSpan={2}>
                          Total
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {plannerUnitsLabel(totalUnits)}
                          {subjectsWithoutUnits > 0 ? ' *' : ''}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {totalHours}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {planEntries.length}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {subjectsWithoutUnits > 0 && (
                  <p className="border-t border-outline-variant px-3 py-1.5 text-[10px] text-amber-800">
                    * {subjectsWithoutUnits} subject
                    {subjectsWithoutUnits === 1 ? ' has' : 's have'} no
                    units set, so the total may be incomplete.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {editorState && (
        <PlannerEditorModal
          key={
            editorState.mode === 'edit'
              ? editorState.entry.id
              : 'new-personal-block'
          }
          state={editorState}
          publishedEntry={editorPublishedEntry}
          onClose={() => setEditorState(null)}
          onSave={savePlannerEntry}
          onDelete={deletePlannerEntry}
        />
      )}

      <Modal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Clear this term's plan?"
        description="Your published schedule is not affected."
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setClearOpen(false)}
              className={SECONDARY_BUTTON_CLASS}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={clearPlan}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
            >
              <Icon name="delete_sweep" size={14} />
              Clear plan
            </button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-on-surface-variant">
          This removes all {planEntries.length} class block
          {planEntries.length === 1 ? '' : 's'} from your plan for{' '}
          <strong className="text-on-surface">{termLabel}</strong>. You can
          always add classes again from the published catalog.
        </p>
      </Modal>
    </div>
  );
}
