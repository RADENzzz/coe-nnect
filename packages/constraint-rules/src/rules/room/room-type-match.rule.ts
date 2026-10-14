import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

/**
 * R-1: Room Type Match
 *
 * Room assignment depends on the subject's `required_room_type` and
 * the kind of block being plotted (lecture vs lab):
 *
 *   - required_room_type === 'any' (mixed lec+lab subjects):
 *       lab block     → laboratory OR computer_lab
 *       lecture block → lecture_room, drafting_room,
 *                       computer_lab, or laboratory
 *
 *   - required_room_type === null/'' (unset):
 *       Same behavior as 'any' — kind decides.
 *
 *   - required_room_type set (pure subject):
 *       Strict equality match.
 *       - Pure lecture: e.g. 'lecture_room'
 *       - Pure lab: e.g. 'laboratory' / 'computer_lab'
 *
 * When no room is selected, H-2 (Room Overlap) and other rules handle
 * the missing-room case — this rule is silent.
 */
export const roomTypeMatchRule: ConstraintRule = {
  id: 'R-1',
  name: 'Room Type Match',
  description:
    'Room type must match the subject\u2019s required room type, ' +
    'or be compatible with the block kind for mixed subjects.',
  type: 'hard',
  category: 'room',

  validate(ctx: RuleContext): RuleResult {
    const { subject, room, loadType } = ctx;

    // No room selected → other rules handle the missing-room case.
    if (!room) return { status: 'pass' };

    const required = (subject.requiredRoomType ?? '').trim().toLowerCase();

    // ── Mixed subject, or unset → block kind decides ──
    if (required === '' || required === 'any') {
      const isLab = loadType === 'laboratory';

      if (isLab) {
        if (
          room.roomType === 'laboratory' ||
          room.roomType === 'computer_lab'
        ) {
          return { status: 'pass' };
        }
        return {
          status: 'fail',
          reason: `Subject ${subject.subjectCode} has a lab block but room ${room.roomNumber} is a "${room.roomType}". Lab blocks need a laboratory or computer lab.`,
          metadata: {
            required: 'laboratory or computer_lab',
            actual: room.roomType,
            roomId: room.roomId,
            loadType,
          },
        };
      }

      // Lecture block for a mixed / unset subject
      if (
        room.roomType === 'lecture_room' ||
        room.roomType === 'drafting_room' ||
        room.roomType === 'computer_lab' ||
        room.roomType === 'laboratory'
      ) {
        return { status: 'pass' };
      }
      return {
        status: 'fail',
        reason: `Subject ${subject.subjectCode} has a lecture block but room ${room.roomNumber} is a "${room.roomType}". Lecture blocks need a lecture room, drafting room, or a lab used for lectures.`,
        metadata: {
          required: 'lecture_room or compatible',
          actual: room.roomType,
          roomId: room.roomId,
          loadType,
        },
      };
    }

    // ── Pure subject → strict match ──
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
        loadType,
      },
    };
  },
};