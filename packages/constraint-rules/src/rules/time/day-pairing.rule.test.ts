import { describe, it, expect } from 'vitest';
import { dayPairingRule } from './day-pairing.rule';
import { baseContext } from '../../test-utils/base-context';
import type { ScheduleEntryContext } from '../../types/rule-context.type';

const sibling = (
  day: string,
  section = '1A',
  subjectId = 's1',
): ScheduleEntryContext => ({
  scheduleId: 'e1',
  termId: 't1',
  subjectId,
  facultyId: 'f1',
  roomId: 'r1',
  section,
  loadType: 'lecture',
  dayOfWeek: day,
  startTime: '08:00',
  endTime: '09:30',
});

describe('S-2 day pairing', () => {
  it('passes when no sibling block exists', () => {
    const ctx = baseContext({
      section: { sectionCode: '1A' },
      timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
      existingSchedule: [],
    });
    expect(dayPairingRule.validate(ctx).status).toBe('pass');
  });

  it('passes when sibling is on the correct pair day (M/Th)', () => {
    const ctx = baseContext({
      section: { sectionCode: '1A' },
      timeSlot: { dayOfWeek: 'Thursday', startTime: '08:00', endTime: '09:30' },
      existingSchedule: [sibling('Monday')],
    });
    expect(dayPairingRule.validate(ctx).status).toBe('pass');
  });

  it('passes when sibling is on the correct pair day (T/F)', () => {
    const ctx = baseContext({
      section: { sectionCode: '1A' },
      timeSlot: { dayOfWeek: 'Friday', startTime: '08:00', endTime: '09:30' },
      existingSchedule: [sibling('Tuesday')],
    });
    expect(dayPairingRule.validate(ctx).status).toBe('pass');
  });

  it('warns when sibling is on an off-pattern day', () => {
    const ctx = baseContext({
      section: { sectionCode: '1A' },
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '08:00', endTime: '09:30' },
      existingSchedule: [sibling('Monday')],
    });
    expect(dayPairingRule.validate(ctx).status).toBe('warn');
  });

  it('passes when there is no section (unassigned plots)', () => {
    const ctx = baseContext({
      section: { sectionCode: null },
      existingSchedule: [sibling('Monday')],
    });
    expect(dayPairingRule.validate(ctx).status).toBe('pass');
  });

  it('ignores siblings of other sections', () => {
    const ctx = baseContext({
      section: { sectionCode: '1A' },
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '08:00', endTime: '09:30' },
      existingSchedule: [sibling('Monday', '2B')],
    });
    expect(dayPairingRule.validate(ctx).status).toBe('pass');
  });

  it('ignores siblings of other subjects', () => {
    const ctx = baseContext({
      section: { sectionCode: '1A' },
      timeSlot: { dayOfWeek: 'Tuesday', startTime: '08:00', endTime: '09:30' },
      existingSchedule: [sibling('Monday', '1A', 'other-subject')],
    });
    expect(dayPairingRule.validate(ctx).status).toBe('pass');
  });
});