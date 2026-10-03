import { describe, it, expect } from 'vitest';
import { facultyOverlapRule } from './faculty-overlap.rule';
import { baseContext } from '../../test-utils/base-context';

describe('H-1 faculty overlap', () => {
  it('passes when no faculty assigned', () => {
    const ctx = baseContext({ faculty: null });
    expect(facultyOverlapRule.validate(ctx).status).toBe('pass');
  });

  it('passes when faculty has no other classes', () => {
    const ctx = baseContext();
    expect(facultyOverlapRule.validate(ctx).status).toBe('pass');
  });

  it('fails when faculty has an overlapping class', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30' },
      existingSchedule: [
        {
          scheduleId: 'existing-1',
          termId: 't1',
          subjectId: 'other',
          facultyId: 'f1',
          roomId: 'r1',
          section: null,
          loadType: 'lecture',
          dayOfWeek: 'Monday',
          startTime: '10:00',
          endTime: '11:30',
        },
      ],
    });
    expect(facultyOverlapRule.validate(ctx).status).toBe('fail');
  });

  it('passes when the only other class is on a different day', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '09:00', endTime: '10:30' },
      existingSchedule: [
        {
          scheduleId: 'existing-1',
          termId: 't1',
          subjectId: 'other',
          facultyId: 'f1',
          roomId: 'r1',
          section: null,
          loadType: 'lecture',
          dayOfWeek: 'Monday',
          startTime: '09:00',
          endTime: '10:30',
        },
      ],
    });
    expect(facultyOverlapRule.validate(ctx).status).toBe('pass');
  });

  it('ignores the row being edited', () => {
    const ctx = baseContext({
      excludeScheduleId: 'existing-1',
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30' },
      existingSchedule: [
        {
          scheduleId: 'existing-1',
          termId: 't1',
          subjectId: 'other',
          facultyId: 'f1',
          roomId: 'r1',
          section: null,
          loadType: 'lecture',
          dayOfWeek: 'Monday',
          startTime: '09:00',
          endTime: '10:30',
        },
      ],
    });
    expect(facultyOverlapRule.validate(ctx).status).toBe('pass');
  });
});