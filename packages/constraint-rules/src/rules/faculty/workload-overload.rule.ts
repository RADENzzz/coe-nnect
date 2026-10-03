import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

/**
 * F-3: Faculty cannot exceed their required weekly teaching hours.
 * Overload is a soft warning, not a hard fail — the PDF explicitly
 * allows overload with warnings.
 *
 * Required hours come from `faculty.requiredHours`, which the builder
 * derives as: 18 for regular, 15 for Dept Head, 12 for TWG (release
 * time subtracted from 18 in multiples of 3).
 *
 * Contact hours for the candidate:
 *   - lecture sessions: lecture_units × 1
 *   - lab sessions:     lab_units × 3
 * The same math is applied to already-assigned hours (faculty.assignedHours).
 *
 * Source: WMSU analysis PDF §1 ("Faculty Workload & Designation Release Time").
 */
export const workloadOverloadRule: ConstraintRule = {
  id: 'F-3',
  name: 'Faculty Workload Overload',
  description:
    'Faculty cannot exceed their required weekly teaching hours without a warning.',
  type: 'soft',
  category: 'workload',

  validate(ctx: RuleContext): RuleResult {
    const { faculty, subject, loadType } = ctx;

    if (!faculty) return { status: 'pass' };
    if (faculty.requiredHours == null) return { status: 'pass' };
    if (faculty.assignedHours == null) return { status: 'pass' };

    const candidateHours = candidateContactHours(
      subject.lectureUnits,
      subject.labUnits,
      loadType,
    );

    const prospective = faculty.assignedHours + candidateHours;

    if (prospective <= faculty.requiredHours) {
      return { status: 'pass' };
    }

    const overload = prospective - faculty.requiredHours;

    return {
      status: 'warn',
      reason: `${faculty.lastName}, ${faculty.firstName} would be at ${prospective.toFixed(1)}h vs a ${faculty.requiredHours}h required load (${overload.toFixed(1)}h overload).`,
      metadata: {
        facultyId: faculty.facultyId,
        requiredHours: faculty.requiredHours,
        assignedHours: faculty.assignedHours,
        candidateHours,
        prospectiveHours: prospective,
        overloadHours: overload,
      },
    };
  },
};

/**
 * Contact hours for a single plot, per the PDF's unit → hours ratios:
 *  - lecture: 1 unit = 1 hour/week
 *  - lab:     1 unit = 3 hours/week
 *
 * When loadType is specified, only the matching component counts.
 * When it's null (older callers), use the subject's totals.
 */
function candidateContactHours(
  lectureUnits: number,
  labUnits: number,
  loadType: 'lecture' | 'laboratory' | 'other' | null | undefined,
): number {
  if (loadType === 'lecture') return lectureUnits * 1;
  if (loadType === 'laboratory') return labUnits * 3;
  if (loadType === 'other') return 0;
  // Unknown — total contact hours across both components.
  return lectureUnits * 1 + labUnits * 3;
}