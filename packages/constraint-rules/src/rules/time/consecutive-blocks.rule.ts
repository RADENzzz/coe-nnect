import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { toMinutes } from '../../utils/time.util';

/**
 * H-4: No faculty member or section may have more than N consecutive
 * class blocks (default N=2, per config.maxConsecutiveHours = 3
 * which corresponds to two 1.5h blocks back-to-back = 3 hours).
 *
 * Implementation: we build the day's timeline (existing + candidate),
 * sort by start time, and walk. A "block" is any scheduled entry.
 * Two entries are consecutive if entry[i+1].start <= entry[i].end +
 * minBreakMinutes (i.e. no qualifying break between them).
 *
 * If at any point we see N consecutive blocks with no qualifying
 * break, we return fail.
 */
export const consecutiveBlocksRule: ConstraintRule = {
  id: 'H-4',
  name: 'Max Consecutive Blocks',
  description:
    'A faculty member or section cannot have more than two consecutive class blocks without a break.',
  type: 'hard',
  category: 'time',

  validate(ctx: RuleContext): RuleResult {
    const { faculty, section, timeSlot, existingSchedule, excludeScheduleId, config } = ctx;

    // Compute max blocks: maxConsecutiveHours (3) / typical block (1.5) = 2.
    // We treat the rule as a maximum count of consecutive blocks.
    const maxBlocks = Math.max(2, Math.floor(config.maxConsecutiveHours / 1.5));
    const minBreak = config.minBreakMinutes;

    // Build timeline for the faculty, if any.
    if (faculty) {
      const fail = walk(
        timeSlot,
        existingSchedule,
        excludeScheduleId,
        (row) => row.facultyId === faculty.facultyId,
        maxBlocks,
        minBreak,
      );
      if (fail) return fail;
    }

    // Build timeline for the section, if any.
    if (section.sectionCode) {
      const fail = walk(
        timeSlot,
        existingSchedule,
        excludeScheduleId,
        (row) => row.section === section.sectionCode,
        maxBlocks,
        minBreak,
      );
      if (fail) return fail;
    }

    return { status: 'pass' };
  },
};

/**
 * Walks a day's timeline for one subject-identity (faculty or section)
 * and returns a fail result if the count of consecutive blocks
 * exceeds `maxBlocks`.
 */
function walk(
  candidate: RuleContext['timeSlot'],
  existing: RuleContext['existingSchedule'],
  excludeScheduleId: string | undefined,
  matches: (row: RuleContext['existingSchedule'][number]) => boolean,
  maxBlocks: number,
  minBreakMinutes: number,
): RuleResult | null {
  // Collect rows on the same day that belong to this identity.
  const rows = existing
    .filter((r) => !(excludeScheduleId && r.scheduleId === excludeScheduleId))
    .filter((r) => r.dayOfWeek === candidate.dayOfWeek)
    .filter(matches)
    .map((r) => ({
      start: toMinutes(r.startTime),
      end: toMinutes(r.endTime),
      label: `${r.startTime}-${r.endTime}`,
    }));

  // Add the candidate.
  rows.push({
    start: toMinutes(candidate.startTime),
    end: toMinutes(candidate.endTime),
    label: `${candidate.startTime}-${candidate.endTime} (candidate)`,
  });

  // Sort by start.
  rows.sort((a, b) => a.start - b.start);

  // Walk: count consecutive entries where the gap between them is
  // less than minBreakMinutes.
  let streak = 1;
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].start - rows[i - 1].end;
    if (gap < minBreakMinutes) {
      streak += 1;
      if (streak > maxBlocks) {
        return {
          status: 'fail',
          reason: `Consecutive block limit exceeded on ${candidate.dayOfWeek}: ${streak} blocks in a row (max ${maxBlocks}).`,
          metadata: { streak, maxBlocks, minBreakMinutes },
        };
      }
    } else {
      streak = 1;
    }
  }

  return null;
}