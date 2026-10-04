import type { ScheduleEntry } from '../types';
import { timeToMinutes } from './time.util';

export interface LaneInfo {
  /** 0-indexed lane within the day column. */
  lane: number;
  /** Total number of lanes this entry's time window overlaps. */
  laneCount: number;
}

/**
 * Compute lane assignments for a set of entries.
 *
 * For each entry, this returns:
 *   - `lane`: which column it should occupy within its day (0-indexed)
 *   - `laneCount`: how many lanes overlap its time window — the divisor
 *     used to compute the block's pixel width
 *
 * Algorithm:
 *   1. Group entries by day.
 *   2. Sort each day's entries by start time. Ties: longer duration
 *      first so wide blocks anchor on the left.
 *   3. Greedy lane assignment: place each entry in the lowest-indexed
 *      lane whose last entry ends at or before this entry's start.
 *   4. For each entry, count how many other entries overlap its
 *      [start, end) window — that's the width divisor.
 *
 * Same-day overlaps are guaranteed to be mutually exclusive in the
 * engine (H-1, H-2, H-3), but a master view can still contain multiple
 * classes at the same time in different rooms/faculty/sections. That's
 * the case this util is designed to lay out side by side.
 */
export function computeLanes(
  entries: ScheduleEntry[],
): Map<string, LaneInfo> {
  const result = new Map<string, LaneInfo>();

  // ── 1. Group by day ──
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day)!.push(e);
  }

  // ── 2. Process each day independently ──
  for (const dayEntries of byDay.values()) {
    // Sort: earlier start first; for ties, longer duration first
    const sorted = [...dayEntries].sort((a, b) => {
      const aStart = timeToMinutes(a.startTime);
      const bStart = timeToMinutes(b.startTime);
      if (aStart !== bStart) return aStart - bStart;

      const aDur = timeToMinutes(a.endTime) - aStart;
      const bDur = timeToMinutes(b.endTime) - bStart;
      return bDur - aDur;
    });

    // ── 3. Greedy lane assignment ──
    const lanes: ScheduleEntry[][] = [];
    const laneOf = new Map<string, number>();

    for (const entry of sorted) {
      const start = timeToMinutes(entry.startTime);
      let placed = false;

      for (let i = 0; i < lanes.length; i++) {
        const last = lanes[i][lanes[i].length - 1];
        const lastEnd = timeToMinutes(last.endTime);
        if (lastEnd <= start) {
          lanes[i].push(entry);
          laneOf.set(entry.id, i);
          placed = true;
          break;
        }
      }

      if (!placed) {
        lanes.push([entry]);
        laneOf.set(entry.id, lanes.length - 1);
      }
    }

    // ── 4. Compute laneCount per entry ──
    // For each entry, count how many entries (including itself)
    // overlap its [start, end) window.
    for (const entry of sorted) {
      const start = timeToMinutes(entry.startTime);
      const end = timeToMinutes(entry.endTime);

      let overlapCount = 0;
      for (const other of sorted) {
        const oStart = timeToMinutes(other.startTime);
        const oEnd = timeToMinutes(other.endTime);
        if (oStart < end && start < oEnd) overlapCount++;
      }

      const lane = laneOf.get(entry.id) ?? 0;

      result.set(entry.id, {
        lane,
        laneCount: Math.max(overlapCount, lane + 1, 1),
      });
    }
  }

  return result;
}