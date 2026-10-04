import { describe, it, expect } from 'vitest';
import { subjectRestrictionRule } from './subject-restriction.rule';
import { baseContext } from '../../test-utils/base-context';
import type { ScheduleEntryContext } from '../../types/rule-context.type';

const row = (
  id: string,
  subjectId: string,
  day: string,
  start: string,
  end: string,
): ScheduleEntryContext => ({
  scheduleId: id,
  termId: 't1',
  subjectId,
  facultyId: 'f1',
  roomId: 'r1',
  section: '1A',
  loadType: 'lecture',
  dayOfWeek: day,
  startTime: start,
  endTime: end,
});

describe('S-11 subject restriction', () => {
  it('passes when there are no restrictions', () => {
    const ctx = baseContext({
      subjectRestrictions: [],
      existingSchedule: [row('e1', 's2', 'Monday', '08:00', '09:30')],
    });
    expect(subjectRestrictionRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the candidate subject is not in any restriction', () => {
    const ctx = baseContext({
      subject: { subjectId: 's1' },
      subjectRestrictions: [{ subjectIdA: 's2', subjectIdB: 's3' }],
      existingSchedule: [row('e1', 's2', 'Monday', '08:00', '09:30')],
    });
    expect(subjectRestrictionRule.validate(ctx).status).toBe('pass');
  });

  it('passes when no partner subject is scheduled', () => {
    const ctx = baseContext({
      subject: { subjectId: 's1' },
      subjectRestrictions: [{ subjectIdA: 's1', subjectIdB: 's2' }],
      existingSchedule: [],
    });
    expect(subjectRestrictionRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the partner is on a different day', () => {
    const ctx = baseContext({
      subject: { subjectId: 's1' },
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '08:00', endTime: '09:30' },
      subjectRestrictions: [{ subjectIdA: 's1', subjectIdB: 's2' }],
      existingSchedule: [row('e1', 's2', 'Monday', '08:00', '09:30')],
    });
    expect(subjectRestrictionRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the partner does not overlap', () => {
    const ctx = baseContext({
      subject: { subjectId: 's1' },
      timeSlot: { dayOfWeek: 'Monday', startTime: '10:00', endTime: '11:30' },
      subjectRestrictions: [{ subjectIdA: 's1', subjectIdB: 's2' }],
      existingSchedule: [row('e1', 's2', 'Monday', '08:00', '09:30')],
    });
    expect(subjectRestrictionRule.validate(ctx).status).toBe('pass');
  });

  it('warns when the partner overlaps', () => {
    const ctx = baseContext({
      subject: { subjectId: 's1' },
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30' },
      subjectRestrictions: [{ subjectIdA: 's1', subjectIdB: 's2' }],
      existingSchedule: [row('e1', 's2', 'Monday', '10:00', '11:30')],
    });
    expect(subjectRestrictionRule.validate(ctx).status).toBe('warn');
  });

  it('warns regardless of direction (candidate is B, partner is A)', () => {
    const ctx = baseContext({
      subject: { subjectId: 's2' },
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30' },
      subjectRestrictions: [{ subjectIdA: 's1', subjectIdB: 's2' }],
      existingSchedule: [row('e1', 's1', 'Monday', '10:00', '11:30')],
    });
    expect(subjectRestrictionRule.validate(ctx).status).toBe('warn');
  });

  it('uses the custom warning message when provided', () => {
    const ctx = baseContext({
      subject: { subjectId: 's1' },
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30' },
      subjectRestrictions: [
        {
          subjectIdA: 's1',
          subjectIdB: 's2',
          warningMessage: 'Irregular students need both — do not clash.',
        },
      ],
      existingSchedule: [row('e1', 's2', 'Monday', '10:00', '11:30')],
    });
    const result = subjectRestrictionRule.validate(ctx);
    expect(result.status).toBe('warn');
    if (result.status === 'warn') {
      expect(result.reason).toContain('Irregular students need both');
    }
  });
});