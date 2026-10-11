import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { toMinutes } from '../../utils/time.util';

/**
 * H-4: Warn when a faculty member or section has more than N
 * consecutive class blocks.
 *
 * Updated per PM feedback (2026-10):
 *   - 2 consecutive blocks → PASS (silent, no warning)
 *   - 3+ consecutive blocks → WARN (allowed, but flagged for review)
 *   - Never hard-blocks
 *
 * The rule is now classified as 'soft' — it produces a warning but
 * does not prevent the schedule entry from being created.
 */
export const consecutiveBlocksRule: ConstraintRule = {
  id: 'H-4',
  name: 'Max Consecutive Blocks',
  description:
    'A faculty member or section should not have more than two consecutive class blocks without a break. Three or more blocks in a row are allowed but will be flagged as a warning.',
  type: 'soft',
  category: 'time',

  validate(ctx: RuleContext): RuleResult {
    const { faculty, section, timeSlot, existingSchedule, excludeScheduleId, config } = ctx;

    const maxBlocks = Math.max(2, Math.floor(config.maxConsecutiveHours / 1.5));
    const minBreak = config.minBreakMinutes;

    if (faculty) {
      const warn = walk(
        timeSlot,
        existingSchedule,
        excludeScheduleId,
        (row) => row.facultyId === faculty.facultyId,
        maxBlocks,
        minBreak,
      );
      if (warn) return warn;
    }

    if (section.sectionCode) {
      const warn = walk(
        timeSlot,
        existingSchedule,
        excludeScheduleId,
        (row) => row.section === section.sectionCode,
        maxBlocks,
        minBreak,
      );
      if (warn) return warn;
    }

    return { status: 'pass' };
  },
};

/**
 * Walks a day's timeline for one identity (faculty or section) and
 * returns a warn result if the count of consecutive blocks exceeds
 * `maxBlocks`. Never fails.
 */
function walk(
  candidate: RuleContext['timeSlot'],
  existing: RuleContext['existingSchedule'],
  excludeScheduleId: string | undefined,
  matches: (row: RuleContext['existingSchedule'][number]) => boolean,
  maxBlocks: number,
  minBreakMinutes: number,
): RuleResult | null {
  const rows = existing
    .filter((r) => !(excludeScheduleId && r.scheduleId === excludeScheduleId))
    .filter((r) => r.dayOfWeek === candidate.dayOfWeek)
    .filter(matches)
    .map((r) => ({
      start: toMinutes(r.startTime),
      end: toMinutes(r.endTime),
      label: `${r.startTime}-${r.endTime}`,
    }));

  rows.push({
    start: toMinutes(candidate.startTime),
    end: toMinutes(candidate.endTime),
    label: `${candidate.startTime}-${candidate.endTime} (candidate)`,
  });

  rows.sort((a, b) => a.start - b.start);

  let streak = 1;
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].start - rows[i - 1].end;
    if (gap < minBreakMinutes) {
      streak += 1;
      if (streak > maxBlocks) {
        return {
          status: 'warn',
          reason: `${streak} consecutive blocks on ${candidate.dayOfWeek} (recommended max: ${maxBlocks}). Consider inserting a break.`,
          metadata: { streak, maxBlocks, minBreakMinutes },
        };
      }
    } else {
      streak = 1;
    }
  }

  return null;
}