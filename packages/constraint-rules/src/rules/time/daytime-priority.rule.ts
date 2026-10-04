import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { toMinutes } from '../../utils/time.util';

/**
 * S-9: The system should prioritize daytime slots over evening slots.
 * The PDF defines evening as 5:30 PM – 7:00 PM.
 *
 * Soft warning: a session that starts after the configured daytime
 * end hour is flagged. Sessions entirely inside the daytime window
 * pass silently.
 */
export const daytimePriorityRule: ConstraintRule = {
  id: 'S-9',
  name: 'Daytime Priority',
  description:
    'Sessions should be scheduled during the day when possible; evening slots are discouraged.',
  type: 'soft',
  category: 'time',

  validate(ctx: RuleContext): RuleResult {
    const { timeSlot, config } = ctx;

    const daytimeEnd = toMinutes(config.daytimePriorityEndHour);
    const start = toMinutes(timeSlot.startTime);

    if (start < daytimeEnd) return { status: 'pass' };

    return {
      status: 'warn',
      reason: `This session starts at ${timeSlot.startTime}, after the daytime window (ends ${config.daytimePriorityEndHour}). Evening slots are discouraged.`,
      metadata: {
        daytimeEnd: config.daytimePriorityEndHour,
        candidateStart: timeSlot.startTime,
      },
    };
  },
};