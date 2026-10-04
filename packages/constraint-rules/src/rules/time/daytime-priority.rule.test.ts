import { describe, it, expect } from 'vitest';
import { daytimePriorityRule } from './daytime-priority.rule';
import { baseContext } from '../../test-utils/base-context';

describe('S-9 daytime priority', () => {
  it('passes when session starts in the morning', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
    });
    expect(daytimePriorityRule.validate(ctx).status).toBe('pass');
  });

  it('passes when session starts before 17:30', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '17:00', endTime: '18:30' },
    });
    expect(daytimePriorityRule.validate(ctx).status).toBe('pass');
  });

  it('warns when session starts exactly at 17:30 (first evening slot)', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '17:30', endTime: '19:00' },
    });
    expect(daytimePriorityRule.validate(ctx).status).toBe('warn');
  });

  it('warns when session starts after 17:30', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '18:00', endTime: '19:00' },
    });
    expect(daytimePriorityRule.validate(ctx).status).toBe('warn');
  });

  it('respects custom daytime end hour from config', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '15:00', endTime: '16:30' },
      config: { daytimePriorityEndHour: '14:00' },
    });
    expect(daytimePriorityRule.validate(ctx).status).toBe('warn');
  });
});