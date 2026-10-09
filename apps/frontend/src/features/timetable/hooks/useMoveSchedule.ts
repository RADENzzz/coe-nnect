import { useCallback, useState } from 'react';
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

export interface SoftWarning {
  ruleId: string;
  ruleName: string;
  reason: string;
}

export interface PendingMoveConfirmation {
  entryId: string;
  fromDay: string;
  toDay: string;
  fromTime: string;
  toTime: string;
  warnings: SoftWarning[];
  /** Resolve with true to proceed, false to cancel */
  resolve: (confirmed: boolean) => void;
}

interface UseMoveScheduleOptions {
  termId: string | undefined;
  allEntries: ScheduleEntry[];
  onSuccess?: () => void;
  /** Skip the soft-warning confirmation entirely */
  confirmSoftWarnings?: boolean;
  /** Called when the move fails for a reason other than soft warnings */
  onError?: (message: string) => void;
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
  onError,
}: UseMoveScheduleOptions) {
  const queryClient = useQueryClient();
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingMoveConfirmation | null>(null);

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
      const message =
        err?.response?.data?.message ??
        err?.message ??
        'Failed to move schedule entry';
      onError?.(message);
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
      const newDayOfWeek = DAY_MAP_REVERSE[newDay as Day] ?? 'Monday';

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
        const msg = 'Failed to validate the move.';
        onError?.(msg);
        return { ok: false, reason: msg };
      }

      if (validation.hardConflicts.length > 0) {
        const lines = validation.hardConflicts
          .map((c) => `• ${c.ruleId}: ${c.reason}`)
          .join('\n');
        const msg = `Move rejected:\n\n${lines}`;
        onError?.(msg);
        return { ok: false, reason: msg };
      }

      // ── Soft warnings → delegate to caller's modal ──
      if (confirmSoftWarnings && validation.softWarnings.length > 0) {
        const confirmed = await new Promise<boolean>((resolve) => {
          setPendingConfirmation({
            entryId,
            fromDay: existing.day,
            toDay: newDay,
            fromTime: existing.startTime,
            toTime: newStartTime,
            warnings: validation.softWarnings,
            resolve: (c) => {
              setPendingConfirmation(null);
              resolve(c);
            },
          });
        });

        if (!confirmed) {
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
    [allEntries, termId, mutation, queryClient, confirmSoftWarnings, onSuccess, onError],
  );

  return {
    moveEntry,
    isPending: mutation.isPending,
    /** Non-null while we're waiting for the user to confirm a soft-warning move */
    pendingConfirmation,
  };
}