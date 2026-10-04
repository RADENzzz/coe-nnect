import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

/**
 * Rooms 203 and 204 are shared engineering computer labs whose priority
 * plotting belongs to servicing courses (Fundamentals of Computer
 * Programming, Living in the Non-IT Era, AutoCAD / CAD subjects).
 *
 * "Servicing" is determined by the subject's department differing from
 * the room's owning department — that pattern matches the general
 * concept in the PDF without needing an explicit flag in the schema.
 */
const SHARED_LAB_ROOMS = ['203', '204'];

export const servicingPriorityRule: ConstraintRule = {
  id: 'S-6',
  name: 'Servicing Priority for Shared Labs',
  description:
    'Rooms 203 and 204 are prioritized for servicing subjects from other departments.',
  type: 'soft',
  category: 'room',

  validate(ctx: RuleContext): RuleResult {
    const { room, subject } = ctx;

    if (!room) return { status: 'pass' };
    if (!SHARED_LAB_ROOMS.includes(room.roomNumber)) {
      return { status: 'pass' };
    }

    // Consider "servicing" as: the subject is NOT from the same department
    // as the room's owner. If the room has no owner (deptId null), treat
    // any subject as potentially servicing, so no warning.
    if (!room.deptId) return { status: 'pass' };
    if (subject.deptId !== room.deptId) return { status: 'pass' };

    return {
      status: 'warn',
      reason: `Room ${room.roomNumber} is a shared servicing lab. In-department subjects may be deprioritized for this room.`,
      metadata: {
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        subjectDeptId: subject.deptId,
      },
    };
  },
};