import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { toMinutes } from '../../utils/time.util';

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

    const start = toMinutes(timeSlot.startTime);
    const end = toMinutes(timeSlot.endTime);
    const duration = end - start;

    // If loadType is set, trust it. Fall back to unit inference only
    // when loadType is null (older callers, tests without the field set).
    const isLabSession = loadType === 'laboratory';
    const isLectureSession = loadType === 'lecture';
    const unknownLoadType = loadType == null;


    
    if (!isLabSession && !isLectureSession && !unknownLoadType) {
      // 'other' — no duration constraint.
      return { status: 'pass' };
    }

    // ── Lab sessions ──
    if (isLabSession || (unknownLoadType && subject.labUnits > 0)) {
      // H-9 and H-10 cover lab_units 1 and 2 respectively. H-11 is the
      // fallback for everything else, to keep messages from stacking.
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

      // 3-hour single-block lectures are permitted as a soft warning.
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