import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

/**
 * R-3: Room 206 (CpE lecture room) must NEVER host a laboratory
 * session. This is an explicit rule from the analysis document.
 *
 * We check by room number + building is not enforced here because the
 * rule refers specifically to the CpE-owned Room 206.
 */
const FORBIDDEN_LAB_ROOMS: string[] = ['206'];

export const roomNoLabRule: ConstraintRule = {
  id: 'R-3',
  name: 'Room 206 Never Hosts Labs',
  description:
    'Room 206 is a lecture-only room and must never host a laboratory session.',
  type: 'hard',
  category: 'room',

  validate(ctx: RuleContext): RuleResult {
    const { room, subject } = ctx;

    if (!room) return { status: 'pass' };
    if (subject.labUnits <= 0) return { status: 'pass' };
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