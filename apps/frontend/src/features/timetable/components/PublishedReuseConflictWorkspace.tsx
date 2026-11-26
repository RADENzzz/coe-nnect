import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';

import { lockBodyScroll } from '../../../lib/body-scroll-lock';
import { isAnyModalOpen } from '../../../components/ui/Modal';
import { useFeedback } from '../../../components/ui/FeedbackToast';
import Icon from '../../../components/ui/Icon';
import {
  plotSubject,
  updateSchedule,
  validatePlot,
  type ReuseConflict,
} from '../../../api/schedule.api';
import TimetableGrid from './TimetableGrid';
import {
  PLOT_DRAG_MIME,
  type ExternalPlotDragPayload,
  type ScheduleEntry,
} from '../types';
import { minutesToTime, timeToMinutes } from '../utils/time.util';

interface Props {
  open: boolean;
  onClose: () => void;
  termId: string;
  termLabel: string;
  deptId: string;
  deptName: string;
  entries: ScheduleEntry[];
  readOnlyEntryIds: Set<string>;
  conflicts: ReuseConflict[];
}

type LoadType = 'lecture' | 'laboratory' | 'other';

type ConflictItem = {
  key: string;
  conflict: ReuseConflict;
};

/** Backend conflicts carry the live target id; the shared API type omits it. */
type ConflictWithTarget = ReuseConflict & { targetScheduleId?: string | null };

const DAY_ABBR_TO_FULL: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

const DAY_FULL_TO_ABBR: Record<string, string> = {
  Monday: 'MON',
  Tuesday: 'TUE',
  Wednesday: 'WED',
  Thursday: 'THU',
  Friday: 'FRI',
  Saturday: 'SAT',
  Sunday: 'SUN',
};

function loadTypeFor(value: string | null): LoadType {
  return value === 'lecture' || value === 'laboratory' || value === 'other'
    ? value
    : 'lecture';
}

function kindFor(value: string | null): ExternalPlotDragPayload['kind'] {
  return value === 'laboratory' ? 'lab' : 'lecture';
}

function timePart(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function conflictKey(conflict: ReuseConflict): string {
  const e = conflict.entry;
  return [
    e.subject_id,
    e.section_id ?? '',
    e.load_type ?? '',
    e.session_index,
    conflict.reason,
  ].join('|');
}

function conflictTitle(conflict: ReuseConflict): string {
  const e = conflict.entry;
  return `${e.subject_code ?? 'Unknown subject'} · ${e.section_code ?? '—'}`;
}

function payloadFor(conflict: ReuseConflict, key: string): ExternalPlotDragPayload {
  const e = conflict.entry;
  return {
    unscheduledId: key,
    subjectId: e.subject_id,
    subjectCode: e.subject_code ?? '',
    subjectTitle: e.subject_title ?? '',
    sectionId: e.section_id,
    sectionCode: e.section_code ?? '',
    kind: kindFor(e.load_type),
    sessionIndex: e.session_index,
  };
}

/**
 * Full-screen workspace for conflicts left after a reuse apply. Cards use the
 * same native drag payload as PlotFocusMode and land on TimetableGrid drop
 * cells. A drop is revalidated first and only ever writes a draft row — never
 * a protected row and never a status change.
 */
export default function PublishedReuseConflictWorkspace({
  open,
  onClose,
  termId,
  termLabel,
  deptId,
  deptName,
  entries,
  readOnlyEntryIds,
  conflicts,
}: Props) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const rootRef = useRef<HTMLDivElement>(null);
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setResolvedKeys(new Set());
  }, [conflicts]);

  useEffect(() => {
    if (!open) return;
    const releaseBodyLock = lockBodyScroll();
    rootRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !busy &&
        !isAnyModalOpen()
      ) {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseBodyLock();
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, busy]);

  const items = useMemo<ConflictItem[]>(
    () =>
      conflicts.map((conflict, index) => ({
        key: `${index}:${conflictKey(conflict)}`,
        conflict,
      })),
    [conflicts],
  );
  const unresolved = useMemo(
    () => items.filter((item) => !resolvedKeys.has(item.key)),
    [items, resolvedKeys],
  );

  const saveConflict = useCallback(
    async (item: ConflictItem, day: string, startTime: string) => {
      if (busy) return;
      const e = item.conflict.entry;
      // The backend always sends targetScheduleId. Fall back to the snapshot
      // id only for older payloads that omit the key entirely.
      const withTarget = item.conflict as ConflictWithTarget;
      const targetId =
        'targetScheduleId' in withTarget
          ? withTarget.targetScheduleId
          : e.schedule_id;
      const target = targetId
        ? entries.find((entry) => entry.id === targetId) ?? null
        : null;

      // Never resolve into a protected row, even if the backend sent an id.
      if (target && (readOnlyEntryIds.has(target.id) || target.status !== 'draft')) {
        feedback.error(
          'That row is protected and cannot be overwritten by reuse.',
        );
        return;
      }

      const sourceStart = timePart(e.start_time, '07:00');
      const sourceEnd = timePart(e.end_time, '08:00');
      const elapsed = timeToMinutes(sourceEnd) - timeToMinutes(sourceStart);
      const duration = elapsed > 0 ? elapsed : 60;
      const placement = {
        dayOfWeek: DAY_ABBR_TO_FULL[day] ?? day,
        startTime,
        endTime: minutesToTime(timeToMinutes(startTime) + duration),
        facultyId: e.faculty_id ?? undefined,
        externalFacultyName: e.external_faculty_name ?? undefined,
        roomId: e.room_id ?? undefined,
        externalRoomName: e.external_room_name ?? undefined,
        section: e.section_code ?? undefined,
        loadType: loadTypeFor(e.load_type),
      };

      setBusy(true);
      try {
        const validation = await validatePlot({
          termId,
          subjectId: e.subject_id,
          ...placement,
          ...(target ? { excludeId: target.id } : {}),
        });
        if (validation.hardConflicts.length > 0) {
          const reasons = validation.hardConflicts
            .map((c) => `${c.ruleId}: ${c.reason}`)
            .join('; ');
          feedback.error(`Not saved — validation failed: ${reasons}`);
          return;
        }

        if (target) {
          await updateSchedule(target.id, {
            ...placement,
            sectionId: e.section_id ?? undefined,
          });
        } else {
          await plotSubject({
            termId,
            subjectId: e.subject_id,
            ...placement,
          });
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['schedules', termId] }),
          queryClient.invalidateQueries({ queryKey: ['unscheduled', termId, deptId] }),
          queryClient.invalidateQueries({ queryKey: ['faculty-requests'] }),
        ]);
        setResolvedKeys((previous) => new Set(previous).add(item.key));
        const warningNote =
          validation.softWarnings.length > 0
            ? ` with ${validation.softWarnings.length} warning(s)`
            : '';
        feedback.success(
          `${conflictTitle(item.conflict)} saved as a draft${warningNote}.`,
        );
      } catch (err) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ??
          (err as Error)?.message ??
          'Failed to save the resolved conflict.';
        feedback.error(message);
      } finally {
        setBusy(false);
      }
    },
    [busy, deptId, entries, feedback, queryClient, readOnlyEntryIds, termId],
  );

  const handleDragStart = (
    event: DragEvent<HTMLDivElement>,
    item: ConflictItem,
  ) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(
      PLOT_DRAG_MIME,
      JSON.stringify(payloadFor(item.conflict, item.key)),
    );
    event.dataTransfer.effectAllowed = 'copy';
  };

  const handleExternalDrop = (
    day: string,
    startTime: string,
    payload: ExternalPlotDragPayload,
  ) => {
    const item = items.find((candidate) => candidate.key === payload.unscheduledId);
    if (!item || busy) return;
    void saveConflict(item, day, startTime);
  };

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Reuse conflict workspace"
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex flex-col bg-background text-on-background outline-none"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-outline-variant bg-surface px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center border border-primary/30 bg-primary/10 text-primary">
            <Icon name="grid_view" size={20} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm font-black tracking-tight text-on-surface">
                Reuse conflicts
              </h1>
              <span className="border border-outline-variant bg-surface-container-low px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                {termLabel}
              </span>
              {deptName && (
                <span className="text-[11px] text-on-surface-variant">
                  {deptName}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-on-surface-variant">
              Revalidate each conflict, then drop it on a slot. Writes are drafts
              only; protected rows cannot be changed.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {busy && (
            <span
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1.5 border border-primary/30 bg-surface-container-low px-2.5 py-1.5 text-[11px] font-semibold text-primary"
            >
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              Checking conflicts…
            </span>
          )}
          <span className="border border-outline-variant bg-surface-container-low px-2.5 py-1.5 text-[11px] font-semibold text-on-surface">
            {unresolved.length} unresolved
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center gap-2 border border-outline-variant px-3 py-1.5 text-xs font-bold text-on-surface transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="close" size={16} />
            Exit workspace
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex max-h-[38vh] w-full shrink-0 flex-col border-b border-outline-variant bg-surface lg:max-h-none lg:w-[20rem] lg:border-b-0 lg:border-r">
          <div className="border-b border-outline-variant px-3 py-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Conflicts to resolve
            </h2>
            <p className="mt-1 text-[11px] text-on-surface-variant">
              Drag a card onto the grid, or use its button to validate and save
              at the source slot.
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {unresolved.length === 0 && (
              <p className="py-6 text-center text-xs text-on-surface-variant">
                All conflicts have been resolved.
              </p>
            )}
            {unresolved.map((item) => {
              const e = item.conflict.entry;
              const sourceDay =
                DAY_FULL_TO_ABBR[e.day_of_week ?? ''] ??
                (e.day_of_week ?? 'MON');
              const sourceStart = timePart(e.start_time, '07:00');
              return (
                <div
                  key={item.key}
                  draggable={!busy}
                  onDragStart={(event) => handleDragStart(event, item)}
                  className={clsx(
                    'border border-dashed px-2 py-2 text-xs transition',
                    busy
                      ? 'cursor-not-allowed opacity-60'
                      : 'cursor-grab active:cursor-grabbing',
                    'border-rose-300/70 bg-rose-50/50 hover:border-primary/40',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon
                      name="drag_indicator"
                      size={14}
                      className="shrink-0 text-on-surface-variant"
                    />
                    <span className="min-w-0 flex-1 font-semibold text-on-surface">
                      {conflictTitle(item.conflict)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-on-surface-variant">
                    Session {(e.session_index ?? 0) + 1} · {sourceDay}{' '}
                    {sourceStart}
                  </p>
                  <p className="mt-1 text-[11px] text-rose-800">
                    {item.conflict.reason}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void saveConflict(item, sourceDay, sourceStart)
                    }
                    className="mt-2 border border-outline-variant bg-surface px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Validate and save at source slot
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
          <p className="mb-2 text-[11px] text-on-surface-variant">
            Existing blocks stay in place. Protected rows are locked; a drop is
            validated before any draft write.
          </p>
          <div className="min-h-0 flex-1">
            <TimetableGrid
              entries={entries}
              density="fit"
              fitToContainer
              readOnlyEntryIds={readOnlyEntryIds}
              onExternalDrop={handleExternalDrop}
              busy={busy}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
