import { describe, it, expect } from 'vitest';
import { minorScheduleBlockRule } from './minor-schedule-block.rule';
import { baseContext } from '../../test-utils/base-context';

describe('H-12 minor subject blocks plot', () => {
  it('passes when there are no minor blocks', () => {
    const ctx = baseContext({ minorBlocks: [] });
    expect(minorScheduleBlockRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the minor block is on a different day', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
      minorBlocks: [
        { dayOfWeek: 'Tuesday', startTime: '08:00', endTime: '09:30' },
      ],
    });
    expect(minorScheduleBlockRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the minor block does not overlap (before)', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '10:00', endTime: '11:30' },
      minorBlocks: [
        { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
      ],
    });
    expect(minorScheduleBlockRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the minor block does not overlap (after)', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
      minorBlocks: [
        { dayOfWeek: 'Monday', startTime: '10:00', endTime: '11:30' },
      ],
    });
    expect(minorScheduleBlockRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the candidate ends exactly when the minor block starts (adjacent, no overlap)', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
      minorBlocks: [
        { dayOfWeek: 'Monday', startTime: '09:30', endTime: '11:00' },
      ],
    });
    expect(minorScheduleBlockRule.validate(ctx).status).toBe('pass');
  });

  it('fails when the candidate fully overlaps the minor block', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '10:00' },
      minorBlocks: [
        { dayOfWeek: 'Monday', startTime: '08:30', endTime: '09:30' },
      ],
    });
    expect(minorScheduleBlockRule.validate(ctx).status).toBe('fail');
  });

  it('fails when the candidate partially overlaps the minor block', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30' },
      minorBlocks: [
        { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
      ],
    });
    expect(minorScheduleBlockRule.validate(ctx).status).toBe('fail');
  });

  it('fails when the candidate is fully inside the minor block', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:30', endTime: '09:00' },
      minorBlocks: [
        { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
      ],
    });
    expect(minorScheduleBlockRule.validate(ctx).status).toBe('fail');
  });

  it('includes the minor subject code and source in the reason', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '10:00' },
      minorBlocks: [
        {
          dayOfWeek: 'Monday',
          startTime: '08:30',
          endTime: '09:30',
          subjectCode: 'GE 101',
          sourceDept: 'CAS',
        },
      ],
    });
    const result = minorScheduleBlockRule.validate(ctx);
    expect(result.status).toBe('fail');
    if (result.status === 'fail') {
      expect(result.reason).toContain('GE 101');
      expect(result.reason).toContain('CAS');
      expect(result.reason).toContain('08:30');
      expect(result.reason).toContain('09:30');
    }
  });
});