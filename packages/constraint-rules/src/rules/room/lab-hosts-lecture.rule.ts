import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

const LAB_ROOM_TYPES = ['laboratory', 'computer_lab'];

/**
 * R-4: A lab room may host a lecture when no better option exists.
 * Per the PDF, Room 205 is "designed primarily for laboratory sessions,
 * though lectures may be held here if room availability requires it."
 *
 * This rule allows the plot (never blocks) but emits a soft warning so
 * the scheduler knows they're using a lab room for a lecture.
 *
 * Only fires when the room is a lab type AND the session is a lecture.
 */
export const labHostsLectureRule: ConstraintRule = {
  id: 'R-4',
  name: 'Lab Room Hosts Lecture',
  description:
    'A lab room may host a lecture if needed, but lecture rooms are preferred.',
  type: 'soft',
  category: 'room',

  validate(ctx: RuleContext): RuleResult {
    const { subject, room, loadType } = ctx;

    if (loadType !== 'lecture') return { status: 'pass' };
    if (!room) return { status: 'pass' };
    if (!LAB_ROOM_TYPES.includes(room.roomType)) return { status: 'pass' };

    return {
      status: 'warn',
      reason: `${subject.subjectCode} is a lecture session but room ${room.roomNumber} is a ${room.roomType.replace('_', ' ')}. Lecture rooms are preferred.`,
      metadata: {
        subjectId: subject.subjectId,
        roomId: room.roomId,
        roomType: room.roomType,
      },
    };
  },
};