import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

const FORBIDDEN_LAB_ROOMS: string[] = ['206'];

export const roomNoLabRule: ConstraintRule = {
  id: 'R-3',
  name: 'Room 206 Never Hosts Labs',
  description:
    'Room 206 is a lecture-only room and must never host a laboratory session.',
  type: 'hard',
  category: 'room',

  validate(ctx: RuleContext): RuleResult {
    // External room → no internal room number to check.
    if (ctx.externalRoomName) return { status: 'pass' };

    const { room, subject, loadType } = ctx;
    if (!room) return { status: 'pass' };
    if (loadType !== 'laboratory') return { status: 'pass' };
    if (!FORBIDDEN_LAB_ROOMS.includes(room.roomNumber)) {
      return { status: 'pass' };
    }

    return {
      status: 'fail',
      reason: `Room ${room.roomNumber} is a lecture-only room and cannot host laboratory sessions (subject ${subject.subjectCode}).`,
      metadata: { roomId: room.roomId, roomNumber: room.roomNumber },
    };
  },
};