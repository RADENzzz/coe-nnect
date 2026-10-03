import { describe, it, expect } from 'vitest';
import { sectionOverlapRule } from './section-overlap.rule';
import { baseContext } from '../../test-utils/base-context';
import type { ScheduleEntryContext } from '../../types/rule-context.type';

const row = (
  id: string,
  day: string,
  start: string,
  end: string,
  section = '1A',
): ScheduleEntryContext => ({
  scheduleId: id,
  termId: 't1',
  subjectId: 'subj-x',
  facultyId: 'f1',
  roomId: 'r1',
  section,
  loadType: 'lecture',
  dayOfWeek: day,
  startTime: start,
  endTime: end,
});

describe('H-3 section overlap', () => {
  it('passes when section is unassigned', () => {
    const ctx = baseContext({ section: { sectionCode: null } });
    expect(sectionOverlapRule.validate(ctx).status).toBe('pass');
  });

  it('passes when section has no other classes', () => {
    const ctx = baseContext();
    expect(sectionOverlapRule.validate(ctx).status).toBe('pass');
  });

  it('fails when section has an overlapping class', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30' },
      existingSchedule: [row('e1', 'Monday', '10:00', '11:30')],
    });
    expect(sectionOverlapRule.validate(ctx).status).toBe('fail');
  });

  it('passes when the other class is for a different section', () => {
    const ctx = baseContext({
      section: { sectionCode: '1A' },
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30' },
      existingSchedule: [row('e1', 'Monday', '09:00', '10:30', '2B')],
    });
    expect(sectionOverlapRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the other class is on a different day', () => {
    const ctx = baseContext({
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '09:00', endTime: '10:30' },
      existingSchedule: [row('e1', 'Monday', '09:00', '10:30')],
    });
    expect(sectionOverlapRule.validate(ctx).status).toBe('pass');
  });

  it('ignores the row being edited', () => {
    const ctx = baseContext({
      excludeScheduleId: 'e1',
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:30' },
      existingSchedule: [row('e1', 'Monday', '09:00', '10:30')],
    });
    expect(sectionOverlapRule.validate(ctx).status).toBe('pass');
  });
});