import { describe, it, expect } from 'vitest';
import { blockDurationSanityRule } from './block-duration-sanity.rule';
import { baseContext } from '../../test-utils/base-context';

describe('H-11 block duration sanity', () => {
  // ── Lecture subjects ──

  it('passes a 90-minute lecture block', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('pass');
  });

  it('warns on a 180-minute lecture block (special request)', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '11:00' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('warn');
  });

  it('fails on a 6.5-hour lecture block', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      timeSlot: { dayOfWeek: 'Thursday', startTime: '08:00', endTime: '14:30' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('fail');
  });

  it('fails on a 1-hour lecture block', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:00' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('fail');
  });

  // ── Lab subjects ──

  it('passes a 3-hour lab block', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 0, labUnits: 2 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '11:00' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('pass');
  });

  it('fails a 6-hour lab block (even if lab_units = 3, which H-10 does not cover)', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 0, labUnits: 3 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '14:00' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('fail');
  });

  it('fails a 1-hour lab block', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 0, labUnits: 1 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:00' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('fail');
  });

  // ── Edge cases ──

  it('passes when subject has no units at all (nothing to constrain)', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 0, labUnits: 0 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '14:30' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('pass');
  });
});