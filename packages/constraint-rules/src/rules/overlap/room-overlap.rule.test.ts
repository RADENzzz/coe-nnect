import { describe, it, expect } from 'vitest';
import { roomOverlapRule } from './room-overlap.rule';
import { baseContext } from '../../test-utils/base-context';
import type { ScheduleEntryContext } from '../../types/rule-context.type';

const row = (
  id: string,
  day: string,
  start: string,
  end: string,
  roomId = 'r1',
): ScheduleEntryContext => ({
  scheduleId: id,
  termId: 't1',
  subjectId: 'subj-x',
  facultyId: 'f1',
  roomId,
  section: '1A',
  loadType: 'lecture',
  dayOfWeek: day,
  startTime: start,
  endTime: end,
});

describe('H-2 room overlap', () => {
  it('passes when no room assigned', () => {
    const ctx = baseContext({ room: null });
    expect(roomOverlapRule.validate(ctx).status).toBe('pass');
  });

  it('passes when room has no other bookings', () => {
    const ctx = baseContext();
    expect(roomOverlapRule.validate(ctx).status).toBe('pass');
  });

  it('fails when room has an overlapping booking', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30' },
      existingSchedule: [row('e1', 'Monday', '10:00', '11:30')],
    });
    expect(roomOverlapRule.validate(ctx).status).toBe('fail');
  });

  it('passes when the other booking is in a different room', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30' },
      existingSchedule: [row('e1', 'Monday', '09:00', '10:30', 'r2')],
    });
    expect(roomOverlapRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the other booking is on a different day', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '09:00', endTime: '10:30' },
      existingSchedule: [row('e1', 'Monday', '09:00', '10:30')],
    });
    expect(roomOverlapRule.validate(ctx).status).toBe('pass');
  });

  it('ignores the row being edited', () => {
    const ctx = baseContext({
      excludeScheduleId: 'e1',
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30' },
      existingSchedule: [row('e1', 'Monday', '09:00', '10:30')],
    });
    expect(roomOverlapRule.validate(ctx).status).toBe('pass');
  });
});