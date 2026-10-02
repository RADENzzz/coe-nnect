import { describe, it, expect } from 'vitest';
import { consecutiveBlocksRule } from './consecutive-blocks.rule';
import { baseContext } from '../../test-utils/base-context';
import type { ScheduleEntryContext } from '../../types/rule-context.type';

const row = (
  id: string,
  day: string,
  start: string,
  end: string,
  facultyId = 'f1',
): ScheduleEntryContext => ({
  scheduleId: id,
  termId: 't1',
  subjectId: 'subj-x',
  facultyId,
  roomId: 'r1',
  section: '1A',
  loadType: 'lecture',
  dayOfWeek: day,
  startTime: start,
  endTime: end,
});

describe('H-4 consecutive blocks', () => {
  it('passes with only the candidate', () => {
    const ctx = baseContext();
    expect(consecutiveBlocksRule.validate(ctx).status).toBe('pass');
  });

  it('passes with 2 blocks back to back', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:30', endTime: '11:00' },
      existingSchedule: [row('e1', 'Monday', '08:00', '09:30')],
    });
    expect(consecutiveBlocksRule.validate(ctx).status).toBe('pass');
  });

  it('fails with 3 blocks back to back', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '11:00', endTime: '12:30' },
      existingSchedule: [
        row('e1', 'Monday', '08:00', '09:30'),
        row('e2', 'Monday', '09:30', '11:00'),
      ],
    });
    expect(consecutiveBlocksRule.validate(ctx).status).toBe('fail');
  });

  it('passes with 3 blocks when a break is inserted', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '11:30', endTime: '13:00' },
      existingSchedule: [
        row('e1', 'Monday', '08:00', '09:30'),
        row('e2', 'Monday', '09:30', '11:00'),
        // 30-minute break between e2 (ends 11:00) and candidate (starts 11:30)
      ],
    });
    expect(consecutiveBlocksRule.validate(ctx).status).toBe('pass');
  });
});