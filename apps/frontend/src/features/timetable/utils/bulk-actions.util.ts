import type { ScheduleEntry } from '../types.ts';

export type BulkRowAction = 'delete' | 'review' | 'finalize' | 'request-publish';

type RowStatus = NonNullable<ScheduleEntry['status']>;

const ELIGIBLE_STATUSES: Record<BulkRowAction, ReadonlySet<RowStatus>> = {
  delete: new Set(['draft', 'review']),
  review: new Set(['draft']),
  finalize: new Set(['draft', 'review']),
  'request-publish': new Set(['finalized']),
};

/** Ids of selected rows whose status permits the requested bulk action. */
export function getBulkActionEligibleIds(
  action: BulkRowAction,
  entries: ScheduleEntry[],
  selectedIds: Set<string>,
): string[] {
  const allowedStatuses = ELIGIBLE_STATUSES[action];
  return entries
    .filter(
      (entry) =>
        selectedIds.has(entry.id) && allowedStatuses.has(entry.status ?? 'draft'),
    )
    .map((entry) => entry.id);
}
