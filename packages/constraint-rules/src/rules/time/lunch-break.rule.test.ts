import { describe, it, expect } from 'vitest';
import { lunchBreakRule } from './lunch-break.rule';
import { baseContext } from '../../test-utils/base-context';

describe('S-7 lunch break', () => {
  it('passes when session is entirely before lunch', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '11:00' },
    });
    expect(lunchBreakRule.validate(ctx).status).toBe('pass');
  });

  it('passes when session is entirely after lunch', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '13:00', endTime: '15:00' },
    });
    expect(lunchBreakRule.validate(ctx).status).toBe('pass');
  });

  it('passes when session ends exactly at lunch start', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '10:30', endTime: '12:00' },
    });
    expect(lunchBreakRule.validate(ctx).status).toBe('pass');
  });

  it('passes when session starts exactly at lunch end', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '13:00', endTime: '14:30' },
    });
    expect(lunchBreakRule.validate(ctx).status).toBe('pass');
  });

  it('passes when overlap is below the limit (shortened break still allowed)', () => {
    // 12:00–12:20 overlap = 20 min < 30 min default
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '11:40', endTime: '12:20' },
    });
    expect(lunchBreakRule.validate(ctx).status).toBe('pass');
  });

  it('warns when overlap exceeds the limit', () => {
    // 11:30–13:30 fully covers the 60-min lunch window
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '11:30', endTime: '13:30' },
    });
    expect(lunchBreakRule.validate(ctx).status).toBe('warn');
  });

  it('warns when session runs through the middle of lunch', () => {
    // 11:00–14:00 spans the full lunch window
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '11:00', endTime: '14:00' },
    });
    expect(lunchBreakRule.validate(ctx).status).toBe('warn');
  });

  it('respects custom lunch times from config', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '13:00', endTime: '14:30' },
      config: { lunchStart: '13:00', lunchEnd: '14:00' },
    });
    expect(lunchBreakRule.validate(ctx).status).toBe('warn');
  });
});