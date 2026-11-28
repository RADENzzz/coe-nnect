import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  clearAutoDrafts,
  deleteSchedule,
  updateScheduleStatus,
} from '../../../api/schedule.api';
import { createPublishRequest } from '../../../api/schedule-publish-request.api';
import { createChangeRequest } from '../../../api/schedule-change-request.api';
import { createUnfinalizeRequest } from '../../../api/schedule-unfinalize.api';
import { useFeedback } from '../../../components/ui/FeedbackToast';
import { extractApiError } from '../../../lib/api-error';
import type { ScheduleEntry } from '../types';
import {
  getBulkActionEligibleIds,
  type BulkRowAction,
} from '../utils/bulk-actions.util';

export type BulkScheduleAction = BulkRowAction | 'clear-auto-drafts';

export interface BulkActionResult {
  pendingAction: BulkScheduleAction | null;
  runBulkAction: (action: BulkScheduleAction, note?: string) => Promise<void>;
}

interface UseBulkScheduleActionsOptions {
  termId: string | undefined;
  deptId: string;
  entries: ScheduleEntry[];
  selectedIds: Set<string>;
  onSucceeded: (ids: string[]) => void;
}

const DEPENDENT_QUERY_KEYS = [
  ['schedules'],
  ['faculty-requests'],
  ['flagged'],
  ['unplotted-minors'],
  ['schedule-versions'],
  ['coverage'],
  ['schedule-unfinalize-requests'],
  ['schedule-publish-requests'],
  ['schedule-change-requests'],
];

/**
 * Runs a multi-select action by fanning out over the existing single-row APIs.
 * Publication and IDP handoff stay out of scope: this only requests review,
 * finalization, or a publish request for Dean approval.
 */
export function useBulkScheduleActions({
  termId,
  deptId,
  entries,
  selectedIds,
  onSucceeded,
}: UseBulkScheduleActionsOptions): BulkActionResult {
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] =
    useState<BulkScheduleAction | null>(null);
  const runningRef = useRef(false);

  const refreshDependentQueries = useCallback(
    async (affectedIds: string[] = []) => {
      await Promise.all([
        ...DEPENDENT_QUERY_KEYS.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
        ...affectedIds.flatMap((id) => [
          queryClient.invalidateQueries({
            queryKey: ['schedule-unfinalize-request', id],
          }),
          queryClient.invalidateQueries({
            queryKey: ['schedule-publish-request', id],
          }),
          queryClient.invalidateQueries({
            queryKey: ['schedule-change-request', id],
          }),
        ]),
      ]);
    },
    [queryClient],
  );

  const runBulkAction = useCallback(
    async (action: BulkScheduleAction, note?: string): Promise<void> => {
      if (runningRef.current) {
        feedback.error('Another bulk action is already running.');
        return;
      }
      runningRef.current = true;
      setPendingAction(action);
      try {
        if (action === 'clear-auto-drafts') {
          if (!termId || !deptId) {
            feedback.error('No active term or department is available.');
            return;
          }
          try {
            const { deleted } = await clearAutoDrafts(termId, deptId);
            await refreshDependentQueries();
            feedback.success(
              deleted === 0
                ? 'No auto-drafts to clear.'
                : `Cleared ${deleted} auto-draft${deleted === 1 ? '' : 's'}.`,
            );
          } catch (error) {
            feedback.failed(extractApiError(error, 'Could not clear auto-drafts.'));
          }
          return;
        }

        const ids = getBulkActionEligibleIds(action, entries, selectedIds);
        if (ids.length === 0) {
          feedback.error('No selected row is eligible for this action.');
          return;
        }
        const skipped = selectedIds.size - ids.length;

        const results = await Promise.allSettled(
          ids.map((id) => {
            switch (action) {
              case 'delete':
                return deleteSchedule(id);
              case 'review':
                return updateScheduleStatus(id, 'review');
              case 'finalize':
                return updateScheduleStatus(id, 'finalized');
              case 'request-publish':
                return createPublishRequest(id, note);
              case 'cancel-finalization':
                return updateScheduleStatus(id, 'draft');
              case 'request-change':
                return createChangeRequest(id, note ?? '');
              case 'request-unfinalize':
                return createUnfinalizeRequest(id, note ?? '');
            }
          }),
        );
        const succeededIds = results.flatMap((result, index) =>
          result.status === 'fulfilled' ? [ids[index]] : [],
        );
        const failures = results.filter(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        const skippedSuffix = skipped > 0 ? ` ${skipped} skipped.` : '';
        await refreshDependentQueries(ids);
        if (failures.length === 0) {
          feedback.success(
            `Updated ${succeededIds.length} selected row${succeededIds.length === 1 ? '' : 's'}.${skippedSuffix}`,
          );
        } else {
          feedback.failed(
            `${succeededIds.length} succeeded, ${failures.length} failed.${skippedSuffix} ${extractApiError(failures[0].reason, 'Bulk action failed.')}`,
          );
        }
        // Only fulfilled rows leave the selection; failed rows stay selected.
        if (succeededIds.length > 0) {
          onSucceeded(succeededIds);
        }
      } finally {
        runningRef.current = false;
        setPendingAction(null);
      }
    },
    [
      deptId,
      entries,
      feedback,
      onSucceeded,
      refreshDependentQueries,
      selectedIds,
      termId,
    ],
  );

  return { pendingAction, runBulkAction };
}
