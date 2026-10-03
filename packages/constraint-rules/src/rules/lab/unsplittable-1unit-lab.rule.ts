import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { toMinutes } from '../../utils/time.util';

/**
 * H-9: A 1-unit lab (3 total contact hours) must be scheduled as a
 * single, unsplit block of exactly `config.labSplitHours` hours.
 *
 * Any attempt to plot a 1-unit lab as a shorter block (e.g. 1.5h or 1h)
 * is rejected, because 1-unit labs cannot be split across days.
 *
 * Source: WMSU analysis PDF, section 5 ("Laboratory Splitting Rules").
 */
export const unsplittable1UnitLabRule: ConstraintRule = {
  id: 'H-9',
  name: '1-Unit Lab Is Unsplittable',
  description:
    'A 1-unit lab must be scheduled as a single 3-hour block and cannot be split.',
  type: 'hard',
  category: 'subject',

  validate(ctx: RuleContext): RuleResult {
    const { subject, timeSlot, config } = ctx;

    // Only 1-unit labs are affected.
    if (subject.labUnits !== 1) return { status: 'pass' };

    const start = toMinutes(timeSlot.startTime);
    const end = toMinutes(timeSlot.endTime);
    const duration = end - start;

    const expectedMinutes = config.labSplitHours * 60;

    if (duration === expectedMinutes) {
      return { status: 'pass' };
    }

    return {
      status: 'fail',
      reason: `Subject ${subject.subjectCode} is a 1-unit lab and must be scheduled as a single ${config.labSplitHours}-hour block (got ${duration} min).`,
      metadata: {
        subjectId: subject.subjectId,
        labUnits: subject.labUnits,
        expectedMinutes,
        actualMinutes: duration,
      },
    };
  },
};