import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { toMinutes } from '../../utils/time.util';

/**
 * S-7: A plot that overlaps the standard lunch window
 * (12:00–13:00 by default) should be discouraged, unless the
 * overlap is small enough to leave a qualifying break.
 *
 * The PDF's exact wording: the system applies a shortened
 * (30-minute) lunch break when a teaching assignment overlaps
 * the standard lunch period. This rule flags sessions whose
 * lunch overlap exceeds `lunchBreakOverlapMinutes` (default 30).
 *
 * Soft warning only.
 */
export const lunchBreakRule: ConstraintRule = {
  id: 'S-7',
  name: 'Lunch Break',
  description:
    'A plot should not eat into the standard lunch window without leaving a break.',
  type: 'soft',
  category: 'time',

  validate(ctx: RuleContext): RuleResult {
    const { timeSlot, config } = ctx;

    const lunchStart = toMinutes(config.lunchStart);
    const lunchEnd = toMinutes(config.lunchEnd);
    const overlapLimit = config.lunchBreakOverlapMinutes;

    const start = toMinutes(timeSlot.startTime);
    const end = toMinutes(timeSlot.endTime);

    // No intersection with lunch at all → pass.
    const overlapStart = Math.max(start, lunchStart);
    const overlapEnd = Math.min(end, lunchEnd);
    const overlapMinutes = Math.max(0, overlapEnd - overlapStart);

    if (overlapMinutes === 0) return { status: 'pass' };
    if (overlapMinutes < overlapLimit) return { status: 'pass' };

    return {
      status: 'warn',
      reason: `This session overlaps the lunch window (${config.lunchStart}\u2013${config.lunchEnd}) by ${overlapMinutes} minutes, leaving less than the required ${overlapLimit}-minute break.`,
      metadata: {
        lunchStart: config.lunchStart,
        lunchEnd: config.lunchEnd,
        overlapMinutes,
        overlapLimit,
      },
    };
  },
};