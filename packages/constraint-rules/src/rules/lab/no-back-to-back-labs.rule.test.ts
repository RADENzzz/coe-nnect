import { describe, it, expect } from 'vitest';
import { noBackToBackLabsRule } from './no-back-to-back-labs.rule';
import { baseContext } from '../../test-utils/base-context';
import type { ScheduleEntryContext } from '../../types/rule-context.type';

const labRow = (
  id: string,
  day: string,
  start: string,
  end: string,
  opts: { facultyId?: string; section?: string } = {},
): ScheduleEntryContext => ({
  scheduleId: id,
  termId: 't1',
  subjectId: 'subj-x',
  facultyId: opts.facultyId ?? 'f1',
  roomId: 'r1',
  section: opts.section ?? '1A',
  loadType: 'laboratory',
  dayOfWeek: day,
  startTime: start,
  endTime: end,
});

describe('H-6 no back-to-back labs (disabled)', () => {
  it('passes when candidate is not a lab', () => {
    const ctx = baseContext({
      subject: { labUnits: 0 },
      existingSchedule: [labRow('e1', 'Monday', '08:00', '09:00')],
      timeSlot: { dayOfWeek: 'Monday', startTime: '09:30', endTime: '10:30' },
    });
    expect(noBackToBackLabsRule.validate(ctx).status).toBe('pass');
  });

  it('passes when candidate lab is far from other lab', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '13:00', endTime: '16:00' },
      existingSchedule: [labRow('e1', 'Monday', '08:00', '11:00')],
    });
    expect(noBackToBackLabsRule.validate(ctx).status).toBe('pass');
  });

  it('passes even with adjacent lab (rule disabled)', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      timeSlot: { dayOfWeek: 'Monday', startTime: '11:00', endTime: '14:00' },
      existingSchedule: [labRow('e1', 'Monday', '08:00', '10:45')],
    });
    expect(noBackToBackLabsRule.validate(ctx).status).toBe('pass');
  });

  it('passes even when faculty has adjacent lab (rule disabled)', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      section: { sectionCode: null },
      timeSlot: { dayOfWeek: 'Monday', startTime: '11:00', endTime: '14:00' },
      existingSchedule: [labRow('e1', 'Monday', '08:00', '10:45')],
    });
    expect(noBackToBackLabsRule.validate(ctx).status).toBe('pass');
  });

  it('rule type is soft (disabled)', () => {
    expect(noBackToBackLabsRule.type).toBe('soft');
  });

  it('rule name indicates it is disabled', () => {
    expect(noBackToBackLabsRule.name).toMatch(/disabled/i);
  });
});