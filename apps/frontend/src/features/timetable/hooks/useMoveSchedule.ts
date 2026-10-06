import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  updateSchedule,
  validatePlot,
  type RawSchedule,
  type ValidateResult,
} from '../../../api/schedule.api';
import type { ScheduleEntry, Day } from '../types';
import { timeToMinutes, minutesToTime } from '../utils/time.util';

const DAY_MAP_REVERSE: Record<Day, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

interface UseMoveScheduleOptions {
  termId: string | undefined;
  /** Full list of entries in the current view — needed to look up the entry being moved. */
  allEntries: ScheduleEntry[];
  /** Called after a successful move. Useful for closing a modal. */
  onSuccess?: () => void;
  /** Whether to skip the confirmation prompt for soft warnings. */
  confirmSoftWarnings?: boolean;
}

export interface MoveResult {
  ok: boolean;
  reason?: string;
}

export function useMoveSchedule({
  termId,
  allEntries,
  onSuccess,
  confirmSoftWarnings = true,
}: UseMoveScheduleOptions) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (args: {
      id: string;
      dayOfWeek: string;
      startTime: string;
      endTime: string;
    }) =>
      updateSchedule(args.id, {
        dayOfWeek: args.dayOfWeek,
        startTime: args.startTime,
        endTime: args.endTime,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', termId] });
    },
    onError: (err: any) => {
      console.error('[Move] Failed:', err);
      alert(
        err?.response?.data?.message ??
          err?.message ??
          'Failed to move schedule entry',
      );
    },
  });

  const moveEntry = useCallback(
    async (
      entryId: string,
      newDay: string,
      newStartTime: string,
    ): Promise<MoveResult> => {
      const existing = allEntries.find((e) => e.id === entryId);
      if (!existing) return { ok: false, reason: 'Entry not found.' };
      if (!termId) return { ok: false, reason: 'No active term.' };

      const startMin = timeToMinutes(newStartTime);
      const duration =
        timeToMinutes(existing.endTime) - timeToMinutes(existing.startTime);
      const newEnd = minutesToTime(startMin + duration);
      const newDayOfWeek = DAY_MAP_REVERSE[newDay as Day] ?? 'Monday'

      // ── Validate ──
      let validation: ValidateResult;
      try {
        validation = await validatePlot({
          termId,
          subjectId: existing.subjectId,
          facultyId: existing.facultyId || undefined,
          roomId: existing.roomId || undefined,
          section: existing.sectionCode || undefined,
          dayOfWeek: newDayOfWeek,
          startTime: newStartTime,
          endTime: newEnd,
          loadType: existing.loadType,
          excludeId: entryId,
        });
      } catch (err) {
        console.error('[Move] validate failed:', err);
        return { ok: false, reason: 'Failed to validate the move.' };
      }

      if (validation.hardConflicts.length > 0) {
        const lines = validation.hardConflicts
          .map((c) => `• ${c.ruleId}: ${c.reason}`)
          .join('\n');
        return { ok: false, reason: `Move rejected:\n\n${lines}` };
      }

      if (confirmSoftWarnings && validation.softWarnings.length > 0) {
        const lines = validation.softWarnings
          .map((w) => `• ${w.ruleId}: ${w.reason}`)
          .join('\n');
        if (!window.confirm(`Move has warnings:\n\n${lines}\n\nProceed?`)) {
          return { ok: false, reason: 'Cancelled.' };
        }
      }

      // ── Optimistic update ──
      queryClient.setQueryData<RawSchedule[]>(['schedules', termId], (old) => {
        if (!old) return old;
        return old.map((raw) => {
          if (raw.scheduleId !== entryId) return raw;
          return {
            ...raw,
            dayOfWeek: newDayOfWeek,
            startTime: `${newStartTime}:00`,
            endTime: `${newEnd}:00`,
          };
        });
      });

      // ── Mutate ──
      mutation.mutate({
        id: entryId,
        dayOfWeek: newDayOfWeek,
        startTime: newStartTime,
        endTime: newEnd,
      });

      onSuccess?.();
      return { ok: true };
    },
    [allEntries, termId, mutation, queryClient, confirmSoftWarnings, onSuccess],
  );

  return {
    moveEntry,
    isPending: mutation.isPending,
  };
}