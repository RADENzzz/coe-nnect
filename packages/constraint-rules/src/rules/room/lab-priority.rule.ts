import type { ConstraintRule } from '../../types/rule.interface';
import type { RuleContext } from '../../types/rule-context.type';
import type { RuleResult } from '../../types/rule-result.type';

const LAB_ROOM_TYPES = ['laboratory', 'computer_lab'];

/**
 * S-5: A subject with a laboratory component should be plotted into a
 * laboratory or computer_lab. Fires only for laboratory sessions.
 *
 * This is a soft complement to R-1: R-1 fails hard when the subject
 * has `required_room_type` set and the room type doesn't match. S-5
 * warns even when R-1 wouldn't — as long as the session is a lab and
 * the room isn't lab-ish.
 *
 * Source: PM's taxonomy, Warning flag "Lab subjects should be
 * prioritized for lab rooms."
 */
export const labPriorityRule: ConstraintRule = {
  id: 'S-5',
  name: 'Lab Priority for Lab Rooms',
  description:
    'Lab subjects should be scheduled in laboratory or computer lab rooms when possible.',
  type: 'soft',
  category: 'room',

  validate(ctx: RuleContext): RuleResult {
    const { subject, room, loadType } = ctx;

    // Only applies to lab sessions with a room assigned.
    if (loadType !== 'laboratory') return { status: 'pass' };
    if (!room) return { status: 'pass' };
    if (subject.labUnits <= 0) return { status: 'pass' };

    if (LAB_ROOM_TYPES.includes(room.roomType)) {
      return { status: 'pass' };
    }

    return {
      status: 'warn',
      reason: `${subject.subjectCode} is a laboratory session but room ${room.roomNumber} is a ${room.roomType.replace('_', ' ')}. Lab rooms are preferred.`,
      metadata: {
        subjectId: subject.subjectId,
        roomId: room.roomId,
        roomType: room.roomType,
      },
    };
  },
};