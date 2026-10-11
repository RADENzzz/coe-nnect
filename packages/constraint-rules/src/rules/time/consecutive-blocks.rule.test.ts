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

  it('warns with 3 blocks back to back', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '11:00', endTime: '12:30' },
      existingSchedule: [
        row('e1', 'Monday', '08:00', '09:30'),
        row('e2', 'Monday', '09:30', '11:00'),
      ],
    });
    const result = consecutiveBlocksRule.validate(ctx);
    expect(result.status).toBe('warn');
    if (result.status === 'warn') {
      expect(result.metadata?.streak).toBe(3);
      expect(result.metadata?.maxBlocks).toBe(2);
    }
  });

  it('passes with 3 blocks when a break is inserted', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '11:30', endTime: '13:00' },
      existingSchedule: [
        row('e1', 'Monday', '08:00', '09:30'),
        row('e2', 'Monday', '09:30', '11:00'),
      ],
    });
    expect(consecutiveBlocksRule.validate(ctx).status).toBe('pass');
  });

  it('warns at the first streak that exceeds max (3), even with 4 blocks', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '12:30', endTime: '14:00' },
      existingSchedule: [
        row('e1', 'Monday', '08:00', '09:30'),
        row('e2', 'Monday', '09:30', '11:00'),
        row('e3', 'Monday', '11:00', '12:30'),
      ],
    });
    const result = consecutiveBlocksRule.validate(ctx);
    expect(result.status).toBe('warn');
    if (result.status === 'warn') {
      // Rule returns at the FIRST streak > max, so this is 3, not 4.
      expect(result.metadata?.streak).toBe(3);
      expect(result.metadata?.maxBlocks).toBe(2);
    }
  });
});