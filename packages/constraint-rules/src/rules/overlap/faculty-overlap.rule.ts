import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { timesOverlap, toMinutes } from '../../utils/time.util';

/**
 * H-1: A faculty member cannot be scheduled into two classes whose
 * time ranges overlap on the same day.
 *
 * We compare against `existingSchedule`, ignoring the row being edited
 * (`excludeScheduleId`) if present.
 */
export const facultyOverlapRule: ConstraintRule = {
  id: 'H-1',
  name: 'Faculty Overlap',
  description:
    'A faculty member cannot teach two overlapping classes on the same day.',
  type: 'hard',
  category: 'time',

  validate(ctx: RuleContext): RuleResult {
    const { faculty, timeSlot, existingSchedule, excludeScheduleId } = ctx;

    if (!faculty) return { status: 'pass' };

    const candidateStart = toMinutes(timeSlot.startTime);
    const candidateEnd = toMinutes(timeSlot.endTime);

    for (const row of existingSchedule) {
      if (excludeScheduleId && row.scheduleId === excludeScheduleId) continue;
      if (row.facultyId !== faculty.facultyId) continue;
      if (row.dayOfWeek !== timeSlot.dayOfWeek) continue;

      const rowStart = toMinutes(row.startTime);
      const rowEnd = toMinutes(row.endTime);

      if (timesOverlap(candidateStart, candidateEnd, rowStart, rowEnd)) {
        return {
          status: 'fail',
          reason: `${faculty.lastName}, ${faculty.firstName} is already teaching another class on ${timeSlot.dayOfWeek} from ${row.startTime} to ${row.endTime}.`,
          metadata: {
            conflictingScheduleId: row.scheduleId,
            facultyId: faculty.facultyId,
          },
        };
      }
    }

    return { status: 'pass' };
  },
};