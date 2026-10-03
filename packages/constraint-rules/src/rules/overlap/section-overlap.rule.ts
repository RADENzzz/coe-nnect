import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { timesOverlap, toMinutes } from '../../utils/time.util';

/**
 * H-3: A section (student cohort) cannot have two classes whose time
 * ranges overlap on the same day. Silent when `section.sectionCode`
 * is null (unassigned plots).
 */
export const sectionOverlapRule: ConstraintRule = {
  id: 'H-3',
  name: 'Section Overlap',
  description:
    'A section cannot be assigned to two overlapping classes on the same day.',
  type: 'hard',
  category: 'time',

  validate(ctx: RuleContext): RuleResult {
    const { section, timeSlot, existingSchedule, excludeScheduleId } = ctx;

    if (!section.sectionCode) return { status: 'pass' };

    const candidateStart = toMinutes(timeSlot.startTime);
    const candidateEnd = toMinutes(timeSlot.endTime);

    for (const row of existingSchedule) {
      if (excludeScheduleId && row.scheduleId === excludeScheduleId) continue;
      if (row.section !== section.sectionCode) continue;
      if (row.dayOfWeek !== timeSlot.dayOfWeek) continue;

      const rowStart = toMinutes(row.startTime);
      const rowEnd = toMinutes(row.endTime);

      if (timesOverlap(candidateStart, candidateEnd, rowStart, rowEnd)) {
        return {
          status: 'fail',
          reason: `Section ${section.sectionCode} already has a class on ${timeSlot.dayOfWeek} from ${row.startTime} to ${row.endTime}.`,
          metadata: {
            conflictingScheduleId: row.scheduleId,
            section: section.sectionCode,
          },
        };
      }
    }

    return { status: 'pass' };
  },
};