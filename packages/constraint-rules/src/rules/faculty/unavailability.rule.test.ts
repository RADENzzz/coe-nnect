import { describe, it, expect } from 'vitest';
import { unavailabilityRule } from './unavailability.rule';
import { baseContext } from '../../test-utils/base-context';

const block = (
  start: string,
  end: string,
  day: string = 'Tuesday',
  reason: string | null = null,
) => ({
  unavailabilityId: 'u1',
  facultyId: 'f1',
  termId: null,
  dayOfWeek: day,
  startTime: start,
  endTime: end,
  reason,
});

describe('H-14 faculty unavailability', () => {
  it('passes with no faculty', () => {
    const ctx = baseContext({ faculty: null });
    expect(unavailabilityRule.validate(ctx).status).toBe('pass');
  });

  it('passes when faculty has no unavailability blocks', () => {
    const ctx = baseContext({
      faculty: { unavailability: [] },
    });
    expect(unavailabilityRule.validate(ctx).status).toBe('pass');
  });

  it('passes when faculty.unavailability is undefined', () => {
    const ctx = baseContext({
      faculty: { unavailability: undefined },
    });
    expect(unavailabilityRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the day does not match any block', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30' },
      faculty: {
        unavailability: [block('08:00', '12:00', 'Tuesday')],
      },
    });
    expect(unavailabilityRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the plot is fully before the block', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '07:00', endTime: '08:00' },
      faculty: {
        unavailability: [block('08:00', '12:00')],
      },
    });
    expect(unavailabilityRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the plot is fully after the block', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '13:00', endTime: '14:30' },
      faculty: {
        unavailability: [block('08:00', '12:00')],
      },
    });
    expect(unavailabilityRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the plot ends exactly when the block starts', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '07:00', endTime: '08:00' },
      faculty: {
        unavailability: [block('08:00', '12:00')],
      },
    });
    expect(unavailabilityRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the plot starts exactly when the block ends', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '12:00', endTime: '13:30' },
      faculty: {
        unavailability: [block('08:00', '12:00')],
      },
    });
    expect(unavailabilityRule.validate(ctx).status).toBe('pass');
  });

  it('fails when the plot is fully inside the block', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '09:00', endTime: '10:30' },
      faculty: {
        unavailability: [block('08:00', '12:00')],
      },
    });
    const result = unavailabilityRule.validate(ctx);
    expect(result.status).toBe('fail');
    if (result.status === 'fail') {
      expect(result.reason).toContain('Tuesday 08:00–12:00');
    }
  });

  it('fails when the plot partially overlaps the block (starts before)', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '07:00', endTime: '09:00' },
      faculty: {
        unavailability: [block('08:00', '12:00')],
      },
    });
    expect(unavailabilityRule.validate(ctx).status).toBe('fail');
  });

  it('fails when the plot partially overlaps the block (ends after)', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '11:00', endTime: '13:00' },
      faculty: {
        unavailability: [block('08:00', '12:00')],
      },
    });
    expect(unavailabilityRule.validate(ctx).status).toBe('fail');
  });

  it('fails when the plot fully wraps the block', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '06:00', endTime: '14:00' },
      faculty: {
        unavailability: [block('08:00', '12:00')],
      },
    });
    expect(unavailabilityRule.validate(ctx).status).toBe('fail');
  });

  it('lists every blocking window when multiple overlap', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '09:00', endTime: '11:00' },
      faculty: {
        unavailability: [
          block('08:00', '10:00', 'Tuesday', 'Admin meeting'),
          block('10:30', '12:00', 'Tuesday', 'Research'),
        ],
      },
    });
    const result = unavailabilityRule.validate(ctx);
    expect(result.status).toBe('fail');
    if (result.status === 'fail') {
      expect(result.reason).toContain('Admin meeting');
      expect(result.reason).toContain('Research');
    }
  });

  it('handles HH:MM:SS time strings from the DB', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '09:00', endTime: '10:30' },
      faculty: {
        unavailability: [
          {
            ...block('08:00', '12:00'),
            startTime: '08:00:00',
            endTime: '12:00:00',
          },
        ],
      },
    });
    expect(unavailabilityRule.validate(ctx).status).toBe('fail');
  });

  it('does not fire when a different-day block exists', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Wednesday', startTime: '09:00', endTime: '10:30' },
      faculty: {
        unavailability: [
          block('08:00', '12:00', 'Tuesday'),
          block('13:00', '17:00', 'Thursday'),
        ],
      },
    });
    expect(unavailabilityRule.validate(ctx).status).toBe('pass');
  });
});