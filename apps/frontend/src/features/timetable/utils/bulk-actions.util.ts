import type { ScheduleEntry } from '../types.ts';

export type BulkRowAction =
  | 'delete'
  | 'review'
  | 'finalize'
  | 'request-publish'
  | 'cancel-finalization'
  | 'request-change'
  | 'request-unfinalize';

type RowStatus = NonNullable<ScheduleEntry['status']>;

const ELIGIBLE_STATUSES: Record<BulkRowAction, ReadonlySet<RowStatus>> = {
  delete: new Set(['draft', 'review']),
  review: new Set(['draft']),
  finalize: new Set(['draft', 'review']),
  'request-publish': new Set(['finalized']),
  'cancel-finalization': new Set(['finalized']),
  'request-change': new Set(['review', 'finalized']),
  'request-unfinalize': new Set(['published']),
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

export interface BulkStatusCounts {
  draft: number;
  review: number;
  finalized: number;
  published: number;
}

/** Counts selected rows by status. */
export function countSelectedStatuses(
  entries: ScheduleEntry[],
  selectedIds: Set<string>,
): BulkStatusCounts {
  const counts: BulkStatusCounts = {
    draft: 0,
    review: 0,
    finalized: 0,
    published: 0,
  };
  for (const entry of entries) {
    if (!selectedIds.has(entry.id)) continue;
    const status = entry.status ?? 'draft';
    counts[status] += 1;
  }
  return counts;
}
