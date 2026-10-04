import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { toMinutes, timesOverlap } from '../../utils/time.util';

/**
 * H-12: External minor subject schedules (imported from other colleges)
 * are fixed constraints. Any candidate plot whose time range overlaps
 * a minor block on the same day is rejected.
 *
 * Minor blocks come from the `minor_subject_schedule` table, loaded
 * into `ctx.minorBlocks` by the RuleContextBuilder. The rule is silent
 * when there are none.
 *
 * Source: WMSU analysis PDF §4 ("Minor Subject Priority Plotting");
 * PM's taxonomy, Required flag "External minor subject schedules must
 * block conflicting plots".
 */
export const minorScheduleBlockRule: ConstraintRule = {
  id: 'H-12',
  name: 'Minor Subject Blocks Plot',
  description:
    'External minor subject schedules must block conflicting plots.',
  type: 'hard',
  category: 'time',

  validate(ctx: RuleContext): RuleResult {
    const { minorBlocks, timeSlot } = ctx;

    if (!minorBlocks || minorBlocks.length === 0) {
      return { status: 'pass' };
    }

    const candidateStart = toMinutes(timeSlot.startTime);
    const candidateEnd = toMinutes(timeSlot.endTime);

    for (const block of minorBlocks) {
      if (block.dayOfWeek !== timeSlot.dayOfWeek) continue;

      const blockStart = toMinutes(block.startTime);
      const blockEnd = toMinutes(block.endTime);

      if (
        timesOverlap(candidateStart, candidateEnd, blockStart, blockEnd)
      ) {
        const label = block.subjectCode ?? 'a minor subject';
        const source = block.sourceDept ? ` (from ${block.sourceDept})` : '';
        return {
          status: 'fail',
          reason: `Conflicts with the fixed schedule of ${label}${source} on ${timeSlot.dayOfWeek} from ${block.startTime} to ${block.endTime}.`,
          metadata: {
            minorBlockStart: block.startTime,
            minorBlockEnd: block.endTime,
            minorSubjectCode: block.subjectCode,
            minorSourceDept: block.sourceDept,
          },
        };
      }
    }

    return { status: 'pass' };
  },
};