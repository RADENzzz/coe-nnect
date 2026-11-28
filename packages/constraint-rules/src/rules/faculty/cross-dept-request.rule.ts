import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

/**
 * F-8: A faculty member from another department can only be assigned
 * to a subject if there is an approved cross-department faculty request
 * covering (faculty, subject, term).
 *
 * Silent when:
 *   - no faculty is assigned
 *   - the faculty belongs to the department receiving the schedule
 *     (`scheduleDeptId`, defaulting to the subject's catalog owner)
 *   - a matching approved request exists
 *
 * Hard fail when the faculty is foreign to the receiving department and
 * no approved request exists.
 *
 * Source: SRS FR 5.1.8 (Request Faculty from Another Department),
 *         PM's taxonomy, Required flag "Cross-department faculty
 *         assignment requires approved request."
 */
export const crossDeptRequestRule: ConstraintRule = {
  id: 'F-8',
  name: 'Cross-Department Request',
  description:
    'A faculty member from another department requires an approved request to be assigned.',
  type: 'hard',
  category: 'faculty',

  validate(ctx: RuleContext): RuleResult {
    const { faculty, subject, termId, approvedFacultyRequests } = ctx;
    const targetDeptId = ctx.scheduleDeptId ?? subject.deptId;

    if (!faculty) return { status: 'pass' };
    if (!faculty.deptId) return { status: 'pass' };

    // Same department — no request needed. A catalog-owned minor can be
    // scheduled by the department running the term/prospectus, so compare
    // against the receiving department when it is known.
    if (faculty.deptId === targetDeptId) {
      return { status: 'pass' };
    }

    // Cross-department: check for an approved request.
    const approved = (approvedFacultyRequests ?? []).some(
      (r) =>
        r.facultyId === faculty.facultyId &&
        r.subjectId === subject.subjectId &&
        r.termId === termId,
    );

    if (approved) return { status: 'pass' };

    return {
      status: 'fail',
      reason: `${faculty.lastName}, ${faculty.firstName} is from another department and has no approved cross-department request for ${subject.subjectCode}.`,
      metadata: {
        facultyId: faculty.facultyId,
        facultyDeptId: faculty.deptId,
        subjectDeptId: subject.deptId,
        scheduleDeptId: ctx.scheduleDeptId ?? null,
        subjectId: subject.subjectId,
        termId,
      },
    };
  },
};