import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

/**
 * R-1: A subject that requires a specific room type must be plotted
 * into a room of that type. Lab subjects require a laboratory or
 * computer_lab; lecture subjects require a lecture_room or drafting_room.
 */
export const roomTypeMatchRule: ConstraintRule = {
  id: 'R-1',
  name: 'Room Type Match',
  description:
    'Room type must match the subject\u2019s required room type.',
  type: 'hard',
  category: 'room',

  validate(ctx: RuleContext): RuleResult {
    const { subject, room } = ctx;

    // If no room type is required, nothing to enforce.
    if (!subject.requiredRoomType) return { status: 'pass' };

    // If no room is selected, H-2/R-5 handle that; this rule is silent.
    if (!room) return { status: 'pass' };

    if (room.roomType === subject.requiredRoomType) {
      return { status: 'pass' };
    }

    return {
      status: 'fail',
      reason: `Subject ${subject.subjectCode} requires a "${subject.requiredRoomType}" but room ${room.roomNumber} is a "${room.roomType}".`,
      metadata: {
        required: subject.requiredRoomType,
        actual: room.roomType,
        roomId: room.roomId,
      },
    };
  },
};