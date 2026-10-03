import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

/**
 * F-6: A visiting lecturer's total assigned units in the term must not
 * exceed `config.visitingLecturerMaxHours` (default 24).
 *
 * Units are used here, not contact hours, matching the PDF's phrasing
 * ("maximum allowable teaching units for faculty classified as
 * Visiting Lecturers"). Only fires for classification === 'visiting_lecturer'.
 *
 * Source: WMSU analysis PDF / SRS FR 7.1.5.
 */
export const visitingLecturerCapRule: ConstraintRule = {
  id: 'F-6',
  name: 'Visiting Lecturer Cap',
  description:
    'A visiting lecturer cannot exceed the configured maximum unit cap.',
  type: 'hard',
  category: 'faculty',

  validate(ctx: RuleContext): RuleResult {
    const { faculty, subject, loadType, config } = ctx;

    if (!faculty) return { status: 'pass' };
    if (faculty.classification !== 'visiting_lecturer') {
      return { status: 'pass' };
    }
    if (faculty.assignedUnits == null) return { status: 'pass' };

    const candidateUnits = candidateUnitsFor(subject.lectureUnits, subject.labUnits, loadType);
    const prospective = faculty.assignedUnits + candidateUnits;
    const cap = config.visitingLecturerMaxHours;

    if (prospective <= cap) {
      return { status: 'pass' };
    }

    return {
      status: 'fail',
      reason: `${faculty.lastName}, ${faculty.firstName} (visiting lecturer) would be at ${prospective} units, exceeding the ${cap}-unit cap.`,
      metadata: {
        facultyId: faculty.facultyId,
        cap,
        assignedUnits: faculty.assignedUnits,
        candidateUnits,
        prospectiveUnits: prospective,
      },
    };
  },
};

function candidateUnitsFor(
  lectureUnits: number,
  labUnits: number,
  loadType: 'lecture' | 'laboratory' | 'other' | null | undefined,
): number {
  if (loadType === 'lecture') return lectureUnits;
  if (loadType === 'laboratory') return labUnits;
  if (loadType === 'other') return 0;
  return lectureUnits + labUnits;
}