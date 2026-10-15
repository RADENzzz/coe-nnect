import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';
import { timesOverlap, toMinutes } from '../../utils/time.util';

export const roomOverlapRule: ConstraintRule = {
  id: 'H-2',
  name: 'Room Overlap',
  description:
    'A room cannot host two overlapping classes on the same day.',
  type: 'hard',
  category: 'time',

  validate(ctx: RuleContext): RuleResult {
    const { room, timeSlot, existingSchedule, excludeScheduleId } = ctx;

    // Candidate has an external room → no internal room to collide with.
    if (ctx.externalRoomName) return { status: 'pass' };

    if (!room) return { status: 'pass' };

    const candidateStart = toMinutes(timeSlot.startTime);
    const candidateEnd = toMinutes(timeSlot.endTime);

    for (const row of existingSchedule) {
      if (excludeScheduleId && row.scheduleId === excludeScheduleId) continue;

      // Existing row has no internal room → cannot collide.
      if (!row.roomId) continue;
      if (row.externalRoomName) continue;

      if (row.roomId !== room.roomId) continue;
      if (row.dayOfWeek !== timeSlot.dayOfWeek) continue;

      const rowStart = toMinutes(row.startTime);
      const rowEnd = toMinutes(row.endTime);

      if (timesOverlap(candidateStart, candidateEnd, rowStart, rowEnd)) {
        return {
          status: 'fail',
          reason: `Room ${room.roomNumber} is already booked on ${timeSlot.dayOfWeek} from ${row.startTime} to ${row.endTime}.`,
          metadata: { conflictingScheduleId: row.scheduleId, roomId: room.roomId },
        };
      }
    }

    return { status: 'pass' };
  },
};