import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { toMinutes } from '../../utils/time.util';

/**
 * F-7: Faculty time preferences are soft constraints. If a faculty
 * member has expressed preferences, a plot that doesn't fall within
 * any of them is flagged as a warning.
 *
 * Preference semantics:
 *   - Each preference is a (day, start_time, end_time) window.
 *   - A candidate plot is "preferred" if its day matches a preference
 *     AND its start/end are fully contained within that preference's
 *     window.
 *   - If the faculty has NO preferences, this rule is silent.
 *   - If the faculty has preferences but the plot doesn't match any,
 *     a soft warning fires.
 *
 * Source: SRS FR 3.1.6 (Record Personal Time Preference);
 *         PM's taxonomy, Optional flag "Faculty time preference may
 *         be enforced as hard or ignored."
 */
export const facultyPreferenceRule: ConstraintRule = {
  id: 'F-7',
  name: 'Faculty Time Preference',
  description:
    'Faculty time preferences are soft constraints and should be honored when possible.',
  type: 'soft',
  category: 'faculty',

  validate(ctx: RuleContext): RuleResult {
    const { faculty, timeSlot } = ctx;

    if (!faculty) return { status: 'pass' };
    if (!faculty.preferences || faculty.preferences.length === 0) {
      return { status: 'pass' };
    }

    const candidateStart = toMinutes(timeSlot.startTime);
    const candidateEnd = toMinutes(timeSlot.endTime);

    const matches = faculty.preferences.some((pref) => {
      if (pref.preferredDay !== timeSlot.dayOfWeek) return false;
      const prefStart = toMinutes(pref.preferredStartTime);
      const prefEnd = toMinutes(pref.preferredEndTime);
      return candidateStart >= prefStart && candidateEnd <= prefEnd;
    });

    if (matches) return { status: 'pass' };

    const summary = faculty.preferences
      .map(
        (p) => `${p.preferredDay} ${p.preferredStartTime}\u2013${p.preferredEndTime}`,
      )
      .join('; ');

    return {
      status: 'warn',
      reason: `${faculty.lastName}, ${faculty.firstName} has preferred times that don't include ${timeSlot.dayOfWeek} ${timeSlot.startTime}\u2013${timeSlot.endTime}. Preferences: ${summary}.`,
      metadata: {
        facultyId: faculty.facultyId,
        candidateDay: timeSlot.dayOfWeek,
        candidateStart: timeSlot.startTime,
        candidateEnd: timeSlot.endTime,
      },
    };
  },
};