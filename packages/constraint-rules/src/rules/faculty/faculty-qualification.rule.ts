import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

/**
 * F-5: A faculty member can only be assigned to a subject they are
 * qualified for (per faculty_qualification). If the faculty has no
 * qualification list loaded, we treat this rule as advisory — pass —
 * so it doesn't block plotting on an incomplete dataset during setup.
 */
export const facultyQualificationRule: ConstraintRule = {
  id: 'F-5',
  name: 'Faculty Qualification',
  description:
    'A faculty member can only be assigned to a subject they are qualified for.',
  type: 'hard',
  category: 'faculty',

  validate(ctx: RuleContext): RuleResult {
    const { faculty, subject } = ctx;

    if (!faculty) return { status: 'pass' };

    // No qualification data loaded yet => don't block.
    if (!faculty.qualifiedSubjectIds) return { status: 'pass' };

    if (faculty.qualifiedSubjectIds.includes(subject.subjectId)) {
      return { status: 'pass' };
    }

    return {
      status: 'fail',
      reason: `${faculty.lastName}, ${faculty.firstName} is not qualified to teach ${subject.subjectCode} (${subject.title}).`,
      metadata: {
        facultyId: faculty.facultyId,
        subjectId: subject.subjectId,
      },
    };
  },
};