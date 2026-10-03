import { describe, it, expect } from 'vitest';
import { splittable2UnitLabRule } from './splittable-2unit-lab.rule';
import { baseContext } from '../../test-utils/base-context';

describe('H-10 2-unit lab splits into 3-hour blocks', () => {
  it('passes for non-2-unit labs', () => {
    const ctx = baseContext({ subject: { labUnits: 0 } });
    expect(splittable2UnitLabRule.validate(ctx).status).toBe('pass');
  });

  it('passes for a 2-unit lab scheduled as exactly 3 hours', () => {
    const ctx = baseContext({
      subject: { labUnits: 2 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '11:00' },
    });
    expect(splittable2UnitLabRule.validate(ctx).status).toBe('pass');
  });

  it('fails for a 2-unit lab scheduled as a single 6-hour block', () => {
    const ctx = baseContext({
      subject: { labUnits: 2 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '14:00' },
    });
    expect(splittable2UnitLabRule.validate(ctx).status).toBe('fail');
  });

  it('fails for a 2-unit lab scheduled as 4.5 hours', () => {
    const ctx = baseContext({
      subject: { labUnits: 2 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '12:30' },
    });
    expect(splittable2UnitLabRule.validate(ctx).status).toBe('fail');
  });

  it('fails for a 2-unit lab scheduled as 1.5 hours', () => {
    const ctx = baseContext({
      subject: { labUnits: 2 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
    });
    expect(splittable2UnitLabRule.validate(ctx).status).toBe('fail');
  });
});