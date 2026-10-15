import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

const SHARED_LAB_ROOMS = ['203', '204'];

export const servicingPriorityRule: ConstraintRule = {
  id: 'S-6',
  name: 'Servicing Priority for Shared Labs',
  description:
    'Rooms 203 and 204 are prioritized for servicing subjects from other departments.',
  type: 'soft',
  category: 'room',

  validate(ctx: RuleContext): RuleResult {
    // External room → no shared-lab priority to consider.
    if (ctx.externalRoomName) return { status: 'pass' };

    const { room, subject } = ctx;
    if (!room) return { status: 'pass' };
    if (!SHARED_LAB_ROOMS.includes(room.roomNumber)) {
      return { status: 'pass' };
    }
    if (!room.deptId) return { status: 'pass' };
    if (subject.deptId !== room.deptId) return { status: 'pass' };

    return {
      status: 'warn',
      reason: `Room ${room.roomNumber} is a shared servicing lab. In-department subjects may be deprioritized for this room.`,
      metadata: { roomId: room.roomId, roomNumber: room.roomNumber, subjectDeptId: subject.deptId },
    };
  },
};