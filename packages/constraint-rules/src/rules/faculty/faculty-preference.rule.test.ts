import { describe, it, expect } from 'vitest';
import { facultyPreferenceRule } from './faculty-preference.rule';
import { baseContext } from '../../test-utils/base-context';

describe('F-7 faculty time preference', () => {
  it('passes with no faculty', () => {
    const ctx = baseContext({ faculty: null });
    expect(facultyPreferenceRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the faculty has no preferences', () => {
    const ctx = baseContext({
      faculty: { preferences: undefined },
    });
    expect(facultyPreferenceRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the plot is fully inside a preferred window', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30' },
      faculty: {
        preferences: [
          { preferredDay: 'Monday', preferredStartTime: '08:00', preferredEndTime: '12:00' },
        ],
      },
    });
    expect(facultyPreferenceRule.validate(ctx).status).toBe('pass');
  });

  it('passes when one of several preferences matches', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Wednesday', startTime: '13:00', endTime: '14:30' },
      faculty: {
        preferences: [
          { preferredDay: 'Monday', preferredStartTime: '08:00', preferredEndTime: '12:00' },
          { preferredDay: 'Wednesday', preferredStartTime: '13:00', preferredEndTime: '17:00' },
        ],
      },
    });
    expect(facultyPreferenceRule.validate(ctx).status).toBe('pass');
  });

  it('warns when the day does not match any preference', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Friday', startTime: '09:00', endTime: '10:30' },
      faculty: {
        preferences: [
          { preferredDay: 'Monday', preferredStartTime: '08:00', preferredEndTime: '12:00' },
        ],
      },
    });
    expect(facultyPreferenceRule.validate(ctx).status).toBe('warn');
  });

  it('warns when the time falls outside the preferred window', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '14:00', endTime: '15:30' },
      faculty: {
        preferences: [
          { preferredDay: 'Monday', preferredStartTime: '08:00', preferredEndTime: '12:00' },
        ],
      },
    });
    expect(facultyPreferenceRule.validate(ctx).status).toBe('warn');
  });

  it('warns when the plot partially overlaps but is not contained', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '11:00', endTime: '13:00' },
      faculty: {
        preferences: [
          { preferredDay: 'Monday', preferredStartTime: '08:00', preferredEndTime: '12:00' },
        ],
      },
    });
    expect(facultyPreferenceRule.validate(ctx).status).toBe('warn');
  });
});