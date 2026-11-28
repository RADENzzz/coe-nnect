import type { ScheduleEntry } from '../types.ts';

export type SelectionStatus = NonNullable<ScheduleEntry['status']>;

export function normalizeEntryStatus(entry: ScheduleEntry): SelectionStatus {
  return entry.status ?? 'draft';
}

export function getSelectableScheduleIds(
  entries: ScheduleEntry[],
  foreignEntryIds: Set<string>,
  writable: boolean,
  lockedStatus: SelectionStatus | null,
): Set<string> {
  if (!writable) return new Set<string>();

  const selectable = new Set<string>();
  for (const entry of entries) {
    if (foreignEntryIds.has(entry.id)) continue;
    if (lockedStatus !== null && normalizeEntryStatus(entry) !== lockedStatus) {
      continue;
    }
    selectable.add(entry.id);
  }
  return selectable;
}
