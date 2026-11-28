import type { SchedulePublishRequest } from '../../api/schedule-publish-request.api';
import type { ScheduleUnfinalizeRequest } from '../../api/schedule-unfinalize.api';
import type { ScheduleChangeRequest } from '../../api/schedule-change-request.api';

export type RequestStatusFilter =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'all';

export type RequestDecision = 'approve' | 'reject';

export type RequestRow =
  | { kind: 'publish'; request: SchedulePublishRequest }
  | { kind: 'unfinalize'; request: ScheduleUnfinalizeRequest }
  | { kind: 'change'; request: ScheduleChangeRequest };

export const REQUEST_KIND_LABELS: Record<RequestRow['kind'], string> = {
  publish: 'Publish',
  unfinalize: 'Unfinalize',
  change: 'Change',
};

export function requestSelectionKey(row: RequestRow): string {
  return `${row.kind}:${row.request.requestId}`;
}

export function isPendingRequest(row: RequestRow): boolean {
  return row.request.status === 'pending';
}

export function selectedPendingRequestRows(
  rows: RequestRow[],
  selectedKeys: Set<string>,
): RequestRow[] {
  return rows.filter(
    (row) =>
      isPendingRequest(row) && selectedKeys.has(requestSelectionKey(row)),
  );
}

export interface RequestDecisionResponders {
  publish: (
    requestId: string,
    decision: RequestDecision,
    remarks?: string,
  ) => Promise<unknown>;
  unfinalize: (
    requestId: string,
    decision: RequestDecision,
    remarks?: string,
  ) => Promise<unknown>;
  change: (
    requestId: string,
    decision: RequestDecision,
    remarks?: string,
  ) => Promise<unknown>;
}

export interface RequestDecisionFailure {
  key: string;
  reason: unknown;
}

export interface RequestDecisionOutcome {
  succeededKeys: string[];
  failures: RequestDecisionFailure[];
}

export async function runRequestDecisions(
  rows: RequestRow[],
  decision: RequestDecision,
  responders: RequestDecisionResponders,
  remarks?: string,
): Promise<RequestDecisionOutcome> {
  const results = await Promise.allSettled(
    rows.map((row) =>
      responders[row.kind](row.request.requestId, decision, remarks).then(() =>
        requestSelectionKey(row),
      ),
    ),
  );

  const succeededKeys: string[] = [];
  const failures: RequestDecisionFailure[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      succeededKeys.push(result.value);
    } else {
      failures.push({
        key: requestSelectionKey(rows[index]),
        reason: result.reason,
      });
    }
  });

  return { succeededKeys, failures };
}

export function filterRequestRows<T extends RequestRow>(
  rows: T[],
  status: RequestStatusFilter,
  query: string,
  deptFilter: string,
): T[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (status !== 'all' && row.request.status !== status) return false;
    if (q) {
      const code = (
        row.request.schedule?.subject?.subjectCode ?? ''
      ).toLowerCase();
      const title = (row.request.schedule?.subject?.title ?? '').toLowerCase();
      if (!code.includes(q) && !title.includes(q)) return false;
    }
    if (
      deptFilter &&
      (row.request.deptId ?? row.request.schedule?.deptId) !== deptFilter
    ) {
      return false;
    }
    return true;
  });
}

export function requestKindBreakdown(rows: RequestRow[]): string {
  const counts: Record<RequestRow['kind'], number> = {
    publish: 0,
    unfinalize: 0,
    change: 0,
  };
  for (const row of rows) counts[row.kind] += 1;
  return (Object.keys(REQUEST_KIND_LABELS) as RequestRow['kind'][])
    .filter((kind) => counts[kind] > 0)
    .map((kind) => `${counts[kind]} ${REQUEST_KIND_LABELS[kind]}`)
    .join(', ');
}

export function requestDecisionResultMessage(
  decision: RequestDecision,
  succeeded: number,
  failures: number,
  error?: string,
): string {
  if (failures === 0) {
    const action = decision === 'approve' ? 'Approved' : 'Rejected';
    return `${action} ${succeeded} request${succeeded === 1 ? '' : 's'}.`;
  }
  return `${succeeded} succeeded, ${failures} failed. ${error ?? ''}`.trim();
}
