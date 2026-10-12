import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { toMinutes } from '../../utils/time.util';

/**
 * H-14: A faculty member cannot be scheduled during a window they've
 * declared as unavailable.
 *
 * Unavailability semantics:
 *   - Each block is a (day, start_time, end_time) window.
 *   - A candidate plot is blocked if its day matches AND its time range
 *     overlaps the block.
 *   - If the faculty has NO unavailability blocks, this rule is silent.
 *   - Blocks with `termId = null` apply to all terms.
 *
 * This is a HARD constraint (contrast with F-7, which is soft).
 *
 * Source: Panel recommendation (2026-10); supersedes "personal time
 *         preference" for the blocking use case. FR 3.1.6 / 3.1.7
 *         currently cover the preference semantics; this rule extends
 *         the SRS intent to make faculty-declared off-limits windows
 *         non-negotiable.
 */
export const unavailabilityRule: ConstraintRule = {
  id: 'H-14',
  name: 'Faculty Unavailability',
  description:
    'Faculty cannot be scheduled during a declared unavailability window.',
  type: 'hard',
  category: 'faculty',

  validate(ctx: RuleContext): RuleResult {
    const { faculty, timeSlot } = ctx;

    if (!faculty) return { status: 'pass' };
    if (!faculty.unavailability || faculty.unavailability.length === 0) {
      return { status: 'pass' };
    }

    const candidateStart = toMinutes(timeSlot.startTime);
    const candidateEnd = toMinutes(timeSlot.endTime);

    const blocking = faculty.unavailability.filter((block) => {
      if (block.dayOfWeek !== timeSlot.dayOfWeek) return false;
      const bStart = toMinutes(block.startTime);
      const bEnd = toMinutes(block.endTime);
      // Overlap test — half-open intervals [start, end)
      return candidateStart < bEnd && bStart < candidateEnd;
    });

    if (blocking.length === 0) {
      return { status: 'pass' };
    }

    // Compose a human-readable reason listing each blocking window.
    const summary = blocking
      .map(
        (b) =>
          `${b.dayOfWeek} ${b.startTime}\u2013${b.endTime}` +
          (b.reason ? ` (${b.reason})` : ''),
      )
      .join('; ');

    return {
      status: 'fail',
      reason: `${faculty.lastName}, ${faculty.firstName} is unavailable on ${summary}.`,
      metadata: {
        facultyId: faculty.facultyId,
        candidateDay: timeSlot.dayOfWeek,
        candidateStart: timeSlot.startTime,
        candidateEnd: timeSlot.endTime,
        blockingBlocks: blocking.map((b) => ({
          unavailabilityId: b.unavailabilityId,
          startTime: b.startTime,
          endTime: b.endTime,
          reason: b.reason,
        })),
      },
    };
  },
};