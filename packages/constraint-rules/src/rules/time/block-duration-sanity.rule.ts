import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { toMinutes } from '../../utils/time.util';

// TEMP DEBUG — remove after diagnosing H-11
declare const console: {
  log: (...args: unknown[]) => void;
};

/**
 * H-11: Every plot must be a "legitimate" duration for its load type.
 *
 * - Lecture blocks must be exactly `config.lectureBlockMinutes`
 *   (default 90 min). A single 3-hour lecture block is permitted
 *   (per the PDF) but flagged as a soft warning.
 *
 * - Lab blocks must be exactly `config.labSplitHours * 60`
 *   (default 180 min). This is a fallback for labs with lab_units
 *   outside {1, 2}, which H-9 and H-10 don't cover.
 *
 * - Subjects with no lecture or lab units are not constrained.
 *
 * Source: WMSU analysis PDF, section 5 ("Day Pairing & Block Splitting Rules").
 */
export const blockDurationSanityRule: ConstraintRule = {
  id: 'H-11',
  name: 'Block Duration Sanity',
  description:
    'Every plot must match the expected block duration for its load type (90 min lecture, 3 hr lab).',
  type: 'hard',
  category: 'time',

  validate(ctx: RuleContext): RuleResult {
    const { subject, timeSlot, config, loadType } = ctx;

    // TEMP DEBUG — remove after diagnosing H-11
    console.log('[H-11] invoked', {
      loadType,
      lectureUnits: subject.lectureUnits,
      labUnits: subject.labUnits,
      lectureBlockMinutes: config.lectureBlockMinutes,
      start: timeSlot.startTime,
      end: timeSlot.endTime,
      duration: toMinutes(timeSlot.endTime) - toMinutes(timeSlot.startTime),
    });

    const start = toMinutes(timeSlot.startTime);
    const end = toMinutes(timeSlot.endTime);
    const duration = end - start;

    const isLabSession = loadType === 'laboratory';
    const isLectureSession = loadType === 'lecture';
    const unknownLoadType = loadType == null;

    if (!isLabSession && !isLectureSession && !unknownLoadType) {
      // 'other' — no duration constraint.
      return { status: 'pass' };
    }

    // ── Lab sessions ──
    if (isLabSession || (unknownLoadType && subject.labUnits > 0)) {
      if (subject.labUnits === 1 || subject.labUnits === 2) {
        return { status: 'pass' };
      }

      const expected = config.labSplitHours * 60;
      if (duration === expected) return { status: 'pass' };
      return {
        status: 'fail',
        reason: `Lab subject ${subject.subjectCode} must be scheduled as a ${config.labSplitHours}-hour block (got ${duration} min).`,
        metadata: {
          subjectId: subject.subjectId,
          expectedMinutes: expected,
          actualMinutes: duration,
          loadType: 'laboratory',
        },
      };
    }

    // ── Lecture sessions ──
    if (isLectureSession || (unknownLoadType && subject.lectureUnits > 0)) {
      const expected = config.lectureBlockMinutes;
      if (duration === expected) return { status: 'pass' };

      if (duration === expected * 2) {
        return {
          status: 'warn',
          reason: `Lecture subject ${subject.subjectCode} is plotted as a single ${duration}-minute block. The PDF recommends splitting it into two ${expected}-minute blocks across paired days.`,
          metadata: {
            subjectId: subject.subjectId,
            expectedMinutes: expected,
            actualMinutes: duration,
            loadType: 'lecture',
          },
        };
      }

      return {
        status: 'fail',
        reason: `Lecture subject ${subject.subjectCode} must be scheduled as a ${expected}-minute block (got ${duration} min).`,
        metadata: {
          subjectId: subject.subjectId,
          expectedMinutes: expected,
          actualMinutes: duration,
          loadType: 'lecture',
        },
      };
    }

    // Nothing to constrain.
    return { status: 'pass' };
  },
};