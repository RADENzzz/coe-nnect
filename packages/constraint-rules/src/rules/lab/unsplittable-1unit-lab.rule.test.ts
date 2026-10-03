import { describe, it, expect } from 'vitest';
import { unsplittable1UnitLabRule } from './unsplittable-1unit-lab.rule';
import { baseContext } from '../../test-utils/base-context';

describe('H-9 1-unit lab is unsplittable', () => {
  it('passes for non-1-unit labs', () => {
    const ctx = baseContext({ subject: { labUnits: 0 } });
    expect(unsplittable1UnitLabRule.validate(ctx).status).toBe('pass');
  });

  it('passes for 2-unit labs (different rule handles those)', () => {
    const ctx = baseContext({
      subject: { labUnits: 2 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '11:00' },
    });
    expect(unsplittable1UnitLabRule.validate(ctx).status).toBe('pass');
  });

  it('passes for a 1-unit lab scheduled as exactly 3 hours', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '11:00' },
    });
    expect(unsplittable1UnitLabRule.validate(ctx).status).toBe('pass');
  });

  it('fails for a 1-unit lab scheduled as 1.5 hours', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
    });
    expect(unsplittable1UnitLabRule.validate(ctx).status).toBe('fail');
  });

  it('fails for a 1-unit lab scheduled as 1 hour', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:00' },
    });
    expect(unsplittable1UnitLabRule.validate(ctx).status).toBe('fail');
  });
});