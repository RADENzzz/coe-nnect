import { describe, it, expect } from 'vitest';
import { blockDurationSanityRule } from './block-duration-sanity.rule';
import { baseContext } from '../../test-utils/base-context';

describe('H-11 block duration sanity', () => {
  // ── Lecture sessions ──

  it('passes a 90-minute lecture block', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'lecture',
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('pass');
  });

  it('warns on a 180-minute lecture block (special request)', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'lecture',
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '11:00' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('warn');
  });

  it('fails on a 6.5-hour lecture block', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'lecture',
      timeSlot: { dayOfWeek: 'Thursday', startTime: '08:00', endTime: '14:30' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('fail');
  });

  it('fails on a 1-hour lecture block', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'lecture',
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:00' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('fail');
  });

  // ── Lab sessions ──

  it('passes a 3-hour lab block for a non-1/2-unit lab', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 0, labUnits: 3 },
      loadType: 'laboratory',
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '11:00' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('pass');
  });

  it('fails a 6-hour lab block (lab_units = 3 fallback)', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 0, labUnits: 3 },
      loadType: 'laboratory',
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '14:00' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('fail');
  });

  it('fails a 1-hour lab block (lab_units = 3 fallback)', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 0, labUnits: 3 },
      loadType: 'laboratory',
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:00' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('fail');
  });

  it('passes for a 1-unit lab (H-9 handles those)', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 0, labUnits: 1 },
      loadType: 'laboratory',
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '14:30' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('pass');
  });

  it('passes for a 2-unit lab (H-10 handles those)', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 0, labUnits: 2 },
      loadType: 'laboratory',
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '14:30' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('pass');
  });

  // ── Edge cases ──

  it('passes for a lecture plot of a combined subject (3L + 1Lab)', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 1 },
      loadType: 'lecture',
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('pass');
  });

  it('passes when loadType is other', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'other',
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '14:30' },
    });
    expect(blockDurationSanityRule.validate(ctx).status).toBe('pass');
  });
});