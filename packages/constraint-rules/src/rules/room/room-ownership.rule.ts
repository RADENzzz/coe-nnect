import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

/**
 * S-10: A room owned by a specific department should be prioritized
 * for that department's subjects. Rooms with `dept_id = null` are
 * shared and this rule does not fire.
 *
 * Soft warning only — the hard blocking of cross-department room
 * usage would require an approval workflow, which is a separate
 * feature (FR 5.1.8 cross-department faculty request).
 *
 * Source: PM's taxonomy, Warning flag "Room ownership should guide
 * scheduling priority."
 */
export const roomOwnershipRule: ConstraintRule = {
  id: 'S-10',
  name: 'Room Ownership Priority',
  description:
    'A room owned by one department should be prioritized for that department.',
  type: 'soft',
  category: 'room',

  validate(ctx: RuleContext): RuleResult {
    const { room, subject } = ctx;

    if (!room) return { status: 'pass' };
    // Shared room (no owner) — no priority to violate.
    if (!room.deptId) return { status: 'pass' };

    // Same department — perfect.
    if (room.deptId === subject.deptId) return { status: 'pass' };

    return {
      status: 'warn',
      reason: `Room ${room.roomNumber} is owned by another department, but ${subject.subjectCode} is from a different department. Room ownership should guide priority.`,
      metadata: {
        roomId: room.roomId,
        roomDeptId: room.deptId,
        subjectDeptId: subject.deptId,
      },
    };
  },
};