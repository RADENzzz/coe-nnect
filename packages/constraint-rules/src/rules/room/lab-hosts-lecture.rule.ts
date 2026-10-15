import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

const LAB_ROOM_TYPES = ['laboratory', 'computer_lab'];

export const labHostsLectureRule: ConstraintRule = {
  id: 'R-4',
  name: 'Lab Room Hosts Lecture',
  description:
    'A lab room may host a lecture if needed, but lecture rooms are preferred.',
  type: 'soft',
  category: 'room',

  validate(ctx: RuleContext): RuleResult {
    // External room → not a lab room we own, skip.
    if (ctx.externalRoomName) return { status: 'pass' };

    const { subject, room, loadType } = ctx;
    if (loadType !== 'lecture') return { status: 'pass' };
    if (!room) return { status: 'pass' };
    if (!LAB_ROOM_TYPES.includes(room.roomType)) return { status: 'pass' };

    return {
      status: 'warn',
      reason: `${subject.subjectCode} is a lecture session but room ${room.roomNumber} is a ${room.roomType.replace('_', ' ')}. Lecture rooms are preferred.`,
      metadata: { subjectId: subject.subjectId, roomId: room.roomId, roomType: room.roomType },
    };
  },
};