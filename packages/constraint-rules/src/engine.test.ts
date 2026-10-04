import { describe, it, expect } from 'vitest';
import { RuleRegistry } from './registry';
import { evaluate } from './engine';
import type { ConstraintRule } from './types/rule.interface';
import type { RuleContext } from './types/rule-context.type';

const ctx = {
  termId: 't1',
  subject: {
    subjectId: 's1', subjectCode: 'CPE 101', title: 'PLD',
    totalUnits: 3, lectureUnits: 3, labUnits: 0,
    requiredRoomType: null, deptId: 'd1',
  },
  section: { sectionCode: '1A' },
  faculty: null,
  room: null,
  timeSlot: { dayOfWeek: 'Monday', startTime: '08:00', endTime: '09:30' },
  loadType: 'lecture',
  existingSchedule: [],
  facultyCommitments: [],
  minorBlocks: [],
  subjectRestrictions: [],
  approvedFacultyRequests: [],
  config: {
    operatingHoursStart: '07:00', operatingHoursEnd: '19:00',
    maxConsecutiveHours: 3, minBreakMinutes: 30,
    lunchStart: '12:00', lunchEnd: '13:00',
    lunchBreakMinutes: 60, lunchBreakOverlapMinutes: 30,
    visitingLecturerMaxHours: 24, defaultRequiredHours: 18,
    releaseHoursGranularity: 3, labSplitHours: 3,
    lectureBlockMinutes: 90,
    daytimePriorityEndHour: '17:30',
  },
} satisfies RuleContext;

const alwaysPass: ConstraintRule = {
  id: 'TEST-1', name: 'Always Pass', description: '',
  type: 'hard', category: 'time',
  validate: () => ({ status: 'pass' }),
};

const alwaysFail: ConstraintRule = {
  id: 'TEST-2', name: 'Always Fail', description: '',
  type: 'hard', category: 'room',
  validate: () => ({ status: 'fail', reason: 'nope' }),
};

describe('engine', () => {
  it('passes when all hard rules pass', () => {
    const reg = new RuleRegistry().register(alwaysPass);
    const result = evaluate(reg.getAll(), ctx);
    expect(result.valid).toBe(true);
    expect(result.hardConflicts).toHaveLength(0);
  });

  it('fails when a hard rule fails', () => {
    const reg = new RuleRegistry().registerAll([alwaysPass, alwaysFail]);
    const result = evaluate(reg.getAll(), ctx);
    expect(result.valid).toBe(false);
    expect(result.hardConflicts).toHaveLength(1);
    expect(result.hardConflicts[0].ruleId).toBe('TEST-2');
  });

  it('rejects duplicate rule ids', () => {
    const reg = new RuleRegistry().register(alwaysPass);
    expect(() => reg.register(alwaysPass)).toThrow(/Duplicate rule id/);
  });
});