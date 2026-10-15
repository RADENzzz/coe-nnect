import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

const LAB_ROOM_TYPES = ['laboratory', 'computer_lab'];

export const labPriorityRule: ConstraintRule = {
  id: 'S-5',
  name: 'Lab Priority for Lab Rooms',
  description:
    'Lab subjects should be scheduled in laboratory or computer lab rooms when possible.',
  type: 'soft',
  category: 'room',

  validate(ctx: RuleContext): RuleResult {
    // External room → no priority opinion.
    if (ctx.externalRoomName) return { status: 'pass' };

    const { subject, room, loadType } = ctx;
    if (loadType !== 'laboratory') return { status: 'pass' };
    if (!room) return { status: 'pass' };
    if (subject.labUnits <= 0) return { status: 'pass' };

    if (LAB_ROOM_TYPES.includes(room.roomType)) {
      return { status: 'pass' };
    }

    return {
      status: 'warn',
      reason: `${subject.subjectCode} is a laboratory session but room ${room.roomNumber} is a ${room.roomType.replace('_', ' ')}. Lab rooms are preferred.`,
      metadata: { subjectId: subject.subjectId, roomId: room.roomId, roomType: room.roomType },
    };
  },
};