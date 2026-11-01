import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

export const roomTypeMatchRule: ConstraintRule = {
  id: 'R-1',
  name: 'Room Type Match',
  description:
    'Room type must match the subject\u2019s required room type, ' +
    'or be compatible with the block kind for mixed subjects. A strictly-typed ' +
    'subject\u2019s lecture block may additionally use a lecture room ' +
    '(mirrors solver.py room_accepts_block; labs stay strict).',
  type: 'hard',
  category: 'room',

  validate(ctx: RuleContext): RuleResult {
    // External room → no internal type to match.
    if (ctx.externalRoomName) return { status: 'pass' };

    const { subject, room, loadType } = ctx;
    if (!room) return { status: 'pass' };

    const required = (subject.requiredRoomType ?? '').trim().toLowerCase();

    if (required === '' || required === 'any') {
      const isLab = loadType === 'laboratory';
      if (isLab) {
        if (room.roomType === 'laboratory' || room.roomType === 'computer_lab') {
          return { status: 'pass' };
        }
        return {
          status: 'fail',
          reason: `Subject ${subject.subjectCode} has a lab block but room ${room.roomNumber} is a "${room.roomType}". Lab blocks need a laboratory or computer lab.`,
          metadata: { required: 'laboratory or computer_lab', actual: room.roomType, roomId: room.roomId, loadType },
        };
      }
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
        metadata: { required: 'lecture_room or compatible', actual: room.roomType, roomId: room.roomId, loadType },
      };
    }

    // ── Strict match, with the same lecture-block relaxation the solver
    // applies (room_accepts_block in solver.py, 2026-11-01). The LAB
    // block of a strictly-typed subject stays strict; its LECTURE block
    // may also use a lecture room. Forcing a 'laboratory'-typed
    // subject's lecture into its lab starved the schedule (2026-11-01:
    // GE 111/311/411 lectures+labs put 60h/week on a single GE-LAB1;
    // CPE 213/313 lectures had no usable room at all). Both halves of
    // the rule must change together or the solver's output will be
    // rejected by this validator.
    if (loadType === 'laboratory' && room.roomType !== subject.requiredRoomType) {
      return {
        status: 'fail',
        reason: `Subject ${subject.subjectCode} requires a "${subject.requiredRoomType}" but room ${room.roomNumber} is a "${room.roomType}".`,
        metadata: { required: subject.requiredRoomType, actual: room.roomType, roomId: room.roomId, loadType },
      };
    }

    if (
      room.roomType === subject.requiredRoomType ||
      room.roomType === 'lecture_room'
    ) {
      return { status: 'pass' };
    }

    return {
      status: 'fail',
      reason: `Subject ${subject.subjectCode} requires a "${subject.requiredRoomType}" but room ${room.roomNumber} is a "${room.roomType}".`,
      metadata: { required: subject.requiredRoomType, actual: room.roomType, roomId: room.roomId, loadType },
    };
  },
};