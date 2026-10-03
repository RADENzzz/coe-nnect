import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { toMinutes } from '../../utils/time.util';

/**
 * H-10: A 2-unit lab (6 total contact hours) cannot be plotted as a
 * single >= 4.5-hour block. Every plot of a 2-unit lab must be exactly
 * `config.labSplitHours` hours (typically 3), so it must be split into
 * two sessions across paired days.
 *
 * The "paired days" part is a soft preference (rule S-2, Phase C).
 * This rule enforces only the hard structural check: each plot of a
 * 2-unit lab must be `labSplitHours` long.
 *
 * Source: WMSU analysis PDF, section 5 ("Laboratory Splitting Rules").
 */
export const splittable2UnitLabRule: ConstraintRule = {
  id: 'H-10',
  name: '2-Unit Lab Must Split into 3-Hour Blocks',
  description:
    'A 2-unit lab must be scheduled as two 3-hour blocks, not a single long session.',
  type: 'hard',
  category: 'subject',

  validate(ctx: RuleContext): RuleResult {
    const { subject, timeSlot, config } = ctx;

    // Only 2-unit labs are affected.
    if (subject.labUnits !== 2) return { status: 'pass' };

    const start = toMinutes(timeSlot.startTime);
    const end = toMinutes(timeSlot.endTime);
    const duration = end - start;

    const expectedMinutes = config.labSplitHours * 60;

    if (duration === expectedMinutes) {
      return { status: 'pass' };
    }

    return {
      status: 'fail',
      reason: `Subject ${subject.subjectCode} is a 2-unit lab and must be split into ${config.labSplitHours}-hour blocks (got ${duration} min).`,
      metadata: {
        subjectId: subject.subjectId,
        labUnits: subject.labUnits,
        expectedMinutes,
        actualMinutes: duration,
      },
    };
  },
};