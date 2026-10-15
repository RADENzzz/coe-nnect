import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

export const cohortOverflowRule: ConstraintRule = {
  id: 'S-8',
  name: 'Cohort Overflow',
  description:
    'Large lab cohorts that exceed room capacity should be split into overflow sections.',
  type: 'soft',
  category: 'room',

  validate(ctx: RuleContext): RuleResult {
    // External room → we don't know the capacity, skip.
    if (ctx.externalRoomName) return { status: 'pass' };

    const { section, room, loadType, subject } = ctx;
    if (loadType !== 'laboratory') return { status: 'pass' };
    if (!room || room.capacity == null) return { status: 'pass' };
    if (section.studentCount == null) return { status: 'pass' };
    if (section.studentCount <= room.capacity) return { status: 'pass' };

    const overflow = section.studentCount - room.capacity;
    return {
      status: 'warn',
      reason: `Section ${section.sectionCode ?? '(unassigned)'} has ${section.studentCount} students but Room ${room.roomNumber} only seats ${room.capacity}. Consider splitting into an overflow section (${overflow} over capacity).`,
      metadata: { subjectId: subject.subjectId, roomId: room.roomId, sectionCode: section.sectionCode, studentCount: section.studentCount, roomCapacity: room.capacity, overflow },
    };
  },
};