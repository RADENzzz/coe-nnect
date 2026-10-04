import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

/**
 * S-8: Large cohorts that exceed the room's seating capacity should be
 * split into overflow sections.
 *
 * The PDF (section 4, "Cohort Splitting & Overflow") says:
 *   "For large student cohorts (e.g., 40+ students in 1st year
 *   Laboratory classes), the system must generate overflow/split
 *   laboratory sections to fit room capacities and prevent overcrowding."
 *
 * Scope:
 *   - Only fires for laboratory sessions (lectures can be larger).
 *   - Only fires when both studentCount and room.capacity are known.
 *   - Silent when either is missing — the rule never blocks, only warns.
 *
 * TODO: `section.studentCount` is currently `undefined` on all
 * production calls because RuleContextBuilder doesn't yet load it.
 * It will start firing once the `section` table is added and the
 * builder is extended to populate the field. Until then, this rule
 * is verified only by unit tests.
 *
 * Source: PM's taxonomy, Warning flag "Large cohort should trigger
 * overflow section splitting."
 */
export const cohortOverflowRule: ConstraintRule = {
  id: 'S-8',
  name: 'Cohort Overflow',
  description:
    'Large lab cohorts that exceed room capacity should be split into overflow sections.',
  type: 'soft',
  category: 'room',

  validate(ctx: RuleContext): RuleResult {
    const { section, room, loadType, subject } = ctx;

    // Only labs are affected.
    if (loadType !== 'laboratory') return { status: 'pass' };

    // Both data points are required.
    if (!room || room.capacity == null) return { status: 'pass' };
    if (section.studentCount == null) return { status: 'pass' };

    if (section.studentCount <= room.capacity) {
      return { status: 'pass' };
    }

    const overflow = section.studentCount - room.capacity;

    return {
      status: 'warn',
      reason: `Section ${section.sectionCode ?? '(unassigned)'} has ${section.studentCount} students but Room ${room.roomNumber} only seats ${room.capacity}. Consider splitting into an overflow section (${overflow} over capacity).`,
      metadata: {
        subjectId: subject.subjectId,
        roomId: room.roomId,
        sectionCode: section.sectionCode,
        studentCount: section.studentCount,
        roomCapacity: room.capacity,
        overflow,
      },
    };
  },
};