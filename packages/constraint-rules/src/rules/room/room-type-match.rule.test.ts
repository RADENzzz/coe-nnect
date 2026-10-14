import { describe, it, expect } from 'vitest';
import { roomTypeMatchRule } from './room-type-match.rule';
import type { RuleContext } from '../../types/rule-context.type';

function makeContext(overrides: Partial<RuleContext>): RuleContext {
  return {
    subject: {
      subjectId: '1',
      subjectCode: 'TEST 101',
      title: 'Test Subject',
      lectureUnits: 0,
      labUnits: 0,
      requiredRoomType: null,
      deptId: '1',
      ...overrides.subject,
    },
    room: overrides.room ?? null,
    faculty: null,
    section: null,
    loadType: 'lecture',
    dayOfWeek: 'Monday',
    startTime: '08:00',
    endTime: '09:30',
    existingSchedule: [],
    ...overrides,
  } as RuleContext;
}

describe('R-1: Room Type Match', () => {
  // ─────────────────────────────────────────────
  // Pass-through cases
  // ─────────────────────────────────────────────
  it('passes when no room is selected', () => {
    const result = roomTypeMatchRule.validate(
      makeContext({
        subject: { requiredRoomType: 'lecture_room' } as any,
        room: null,
      }),
    );
    expect(result.status).toBe('pass');
  });

  // ─────────────────────────────────────────────
  // Pure subjects — strict match
  // ─────────────────────────────────────────────
  it('passes a pure lecture subject in a lecture room', () => {
    const result = roomTypeMatchRule.validate(
      makeContext({
        subject: {
          subjectCode: 'LEC 101',
          lectureUnits: 3,
          labUnits: 0,
          requiredRoomType: 'lecture_room',
        } as any,
        room: { roomId: '1', roomNumber: '101', roomType: 'lecture_room' } as any,
        loadType: 'lecture',
      }),
    );
    expect(result.status).toBe('pass');
  });

  it('fails a pure lecture subject in a laboratory', () => {
    const result = roomTypeMatchRule.validate(
      makeContext({
        subject: {
          subjectCode: 'LEC 101',
          lectureUnits: 3,
          labUnits: 0,
          requiredRoomType: 'lecture_room',
        } as any,
        room: { roomId: '2', roomNumber: '205', roomType: 'laboratory' } as any,
        loadType: 'lecture',
      }),
    );
    expect(result.status).toBe('fail');
    if (result.status === 'fail') {
      expect(result.reason).toContain('LEC 101');
      expect(result.reason).toContain('lecture_room');
      expect(result.reason).toContain('laboratory');
    }
  });

  it('passes a pure lab subject in a laboratory', () => {
    const result = roomTypeMatchRule.validate(
      makeContext({
        subject: {
          subjectCode: 'LAB 101',
          lectureUnits: 0,
          labUnits: 2,
          requiredRoomType: 'laboratory',
        } as any,
        room: { roomId: '2', roomNumber: '205', roomType: 'laboratory' } as any,
        loadType: 'laboratory',
      }),
    );
    expect(result.status).toBe('pass');
  });

  it('fails a pure lab subject in a lecture room', () => {
    const result = roomTypeMatchRule.validate(
      makeContext({
        subject: {
          subjectCode: 'LAB 101',
          lectureUnits: 0,
          labUnits: 2,
          requiredRoomType: 'laboratory',
        } as any,
        room: { roomId: '1', roomNumber: '101', roomType: 'lecture_room' } as any,
        loadType: 'laboratory',
      }),
    );
    expect(result.status).toBe('fail');
  });

  // ─────────────────────────────────────────────
  // Mixed subjects ('any') — kind decides
  // ─────────────────────────────────────────────
  describe('mixed subject (required_room_type = "any")', () => {
    const mixedSubject = {
      subjectCode: 'BES 111',
      lectureUnits: 3,
      labUnits: 1,
      requiredRoomType: 'any',
    };

    it('passes a lecture block in a lecture room', () => {
      const result = roomTypeMatchRule.validate(
        makeContext({
          subject: mixedSubject as any,
          room: {
            roomId: '1',
            roomNumber: '101',
            roomType: 'lecture_room',
          } as any,
          loadType: 'lecture',
        }),
      );
      expect(result.status).toBe('pass');
    });

    it('passes a lecture block in a laboratory (any-room for lecture)', () => {
      const result = roomTypeMatchRule.validate(
        makeContext({
          subject: mixedSubject as any,
          room: {
            roomId: '2',
            roomNumber: '205',
            roomType: 'laboratory',
          } as any,
          loadType: 'lecture',
        }),
      );
      expect(result.status).toBe('pass');
    });

    it('passes a lecture block in a computer lab', () => {
      const result = roomTypeMatchRule.validate(
        makeContext({
          subject: mixedSubject as any,
          room: {
            roomId: '3',
            roomNumber: 'CLAB-A',
            roomType: 'computer_lab',
          } as any,
          loadType: 'lecture',
        }),
      );
      expect(result.status).toBe('pass');
    });

    it('passes a lab block in a laboratory', () => {
      const result = roomTypeMatchRule.validate(
        makeContext({
          subject: mixedSubject as any,
          room: {
            roomId: '2',
            roomNumber: '205',
            roomType: 'laboratory',
          } as any,
          loadType: 'laboratory',
        }),
      );
      expect(result.status).toBe('pass');
    });

    it('passes a lab block in a computer lab', () => {
      const result = roomTypeMatchRule.validate(
        makeContext({
          subject: mixedSubject as any,
          room: {
            roomId: '3',
            roomNumber: 'CLAB-A',
            roomType: 'computer_lab',
          } as any,
          loadType: 'laboratory',
        }),
      );
      expect(result.status).toBe('pass');
    });

    it('fails a lab block in a lecture room', () => {
      const result = roomTypeMatchRule.validate(
        makeContext({
          subject: mixedSubject as any,
          room: {
            roomId: '1',
            roomNumber: '101',
            roomType: 'lecture_room',
          } as any,
          loadType: 'laboratory',
        }),
      );
      expect(result.status).toBe('fail');
      if (result.status === 'fail') {
        expect(result.reason).toContain('BES 111');
        expect(result.reason).toContain('lab block');
      }
    });

    it('fails a lab block in a drafting room', () => {
      const result = roomTypeMatchRule.validate(
        makeContext({
          subject: mixedSubject as any,
          room: {
            roomId: '4',
            roomNumber: 'DR-1',
            roomType: 'drafting_room',
          } as any,
          loadType: 'laboratory',
        }),
      );
      expect(result.status).toBe('fail');
    });
  });

  // ─────────────────────────────────────────────
  // Unset required_room_type → behaves like 'any'
  // ─────────────────────────────────────────────
  describe('unset required_room_type (null)', () => {
    it('treats null like "any" for a lecture block', () => {
      const result = roomTypeMatchRule.validate(
        makeContext({
          subject: {
            subjectCode: 'X 1',
            lectureUnits: 2,
            labUnits: 0,
            requiredRoomType: null,
          } as any,
          room: {
            roomId: '1',
            roomNumber: '101',
            roomType: 'lecture_room',
          } as any,
          loadType: 'lecture',
        }),
      );
      expect(result.status).toBe('pass');
    });

    it('treats null like "any" for a lab block in a lab', () => {
      const result = roomTypeMatchRule.validate(
        makeContext({
          subject: {
            subjectCode: 'X 1',
            lectureUnits: 0,
            labUnits: 1,
            requiredRoomType: null,
          } as any,
          room: {
            roomId: '2',
            roomNumber: '205',
            roomType: 'laboratory',
          } as any,
          loadType: 'laboratory',
        }),
      );
      expect(result.status).toBe('pass');
    });
  });
});