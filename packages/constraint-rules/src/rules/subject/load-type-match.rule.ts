import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

/**
 * H-13: The selected `loadType` must match the subject's component
 * composition. A pure lecture subject (lab_units = 0) cannot be
 * plotted as a laboratory session, and a pure lab subject
 * (lecture_units = 0) cannot be plotted as a lecture.
 *
 * This is a safety net: the modal should ideally filter load types
 * by subject, but the engine guarantees correctness regardless.
 *
 * Silent when loadType is null or 'other', or when the subject has
 * both components (combined subjects are valid in either mode).
 */
export const loadTypeMatchRule: ConstraintRule = {
  id: 'H-13',
  name: 'Load Type Matches Subject',
  description:
    'The selected load type must match the subject\u2019s lecture/lab composition.',
  type: 'hard',
  category: 'subject',

  validate(ctx: RuleContext): RuleResult {
    const { subject, loadType } = ctx;

    // Only enforce for explicitly-chosen lecture/laboratory sessions.
    if (loadType !== 'lecture' && loadType !== 'laboratory') {
      return { status: 'pass' };
    }

    if (loadType === 'laboratory' && subject.labUnits <= 0) {
      return {
        status: 'fail',
        reason: `${subject.subjectCode} has no laboratory component and cannot be plotted as a lab session.`,
        metadata: {
          subjectId: subject.subjectId,
          lectureUnits: subject.lectureUnits,
          labUnits: subject.labUnits,
          loadType,
        },
      };
    }

    if (loadType === 'lecture' && subject.lectureUnits <= 0) {
      return {
        status: 'fail',
        reason: `${subject.subjectCode} has no lecture component and cannot be plotted as a lecture session.`,
        metadata: {
          subjectId: subject.subjectId,
          lectureUnits: subject.lectureUnits,
          labUnits: subject.labUnits,
          loadType,
        },
      };
    }

    return { status: 'pass' };
  },
};