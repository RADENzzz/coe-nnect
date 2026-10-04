import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

/**
 * S-2: Split lecture blocks should follow the standard paired-day
 * patterns: Monday/Thursday, Tuesday/Friday, Wednesday/Saturday.
 *
 * This is a soft warning — the PDF says straight blocks and off-pattern
 * pairings are "discouraged but permitted for special requests."
 *
 * The rule only fires when it can identify a prior session of the
 * SAME subject + section on a DIFFERENT day, and that day isn't the
 * expected pair of the candidate's day.
 */
const PAIRS: Record<string, string> = {
  Monday: 'Thursday',
  Thursday: 'Monday',
  Tuesday: 'Friday',
  Friday: 'Tuesday',
  Wednesday: 'Saturday',
  Saturday: 'Wednesday',
};

export const dayPairingRule: ConstraintRule = {
  id: 'S-2',
  name: 'Day Pairing',
  description:
    'Split blocks should follow standard paired-day patterns (M/Th, T/F, W/S).',
  type: 'soft',
  category: 'time',

  validate(ctx: RuleContext): RuleResult {
    const { subject, section, timeSlot, existingSchedule, excludeScheduleId } =
      ctx;

    // Need a section to identify the sibling block.
    if (!section.sectionCode) return { status: 'pass' };

    const expectedPair = PAIRS[timeSlot.dayOfWeek];
    if (!expectedPair) return { status: 'pass' };

    // Find a prior session of the same subject + section on a different day.
    const sibling = existingSchedule.find((row) => {
      if (excludeScheduleId && row.scheduleId === excludeScheduleId)
        return false;
      if (row.section !== section.sectionCode) return false;
      if (row.subjectId !== subject.subjectId) return false;
      if (row.dayOfWeek === timeSlot.dayOfWeek) return false;
      return true;
    });

    if (!sibling) return { status: 'pass' };

    if (sibling.dayOfWeek === expectedPair) {
      return { status: 'pass' };
    }

    return {
      status: 'warn',
      reason: `${subject.subjectCode} is split across ${sibling.dayOfWeek} and ${timeSlot.dayOfWeek}. The standard pair for ${timeSlot.dayOfWeek} is ${expectedPair}.`,
      metadata: {
        siblingDay: sibling.dayOfWeek,
        candidateDay: timeSlot.dayOfWeek,
        expectedPair,
      },
    };
  },
};