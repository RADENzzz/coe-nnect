import { describe, it, expect } from 'vitest';
import { labHostsLectureRule } from './lab-hosts-lecture.rule';
import { baseContext } from '../../test-utils/base-context';

describe('R-4 lab room hosts lecture', () => {
  it('passes for lab sessions', () => {
    const ctx = baseContext({
      loadType: 'laboratory',
      room: { roomType: 'laboratory' },
    });
    expect(labHostsLectureRule.validate(ctx).status).toBe('pass');
  });

  it('passes when no room is assigned', () => {
    const ctx = baseContext({
      loadType: 'lecture',
      room: null,
    });
    expect(labHostsLectureRule.validate(ctx).status).toBe('pass');
  });

  it('passes for a lecture in a lecture room', () => {
    const ctx = baseContext({
      loadType: 'lecture',
      room: { roomType: 'lecture_room' },
    });
    expect(labHostsLectureRule.validate(ctx).status).toBe('pass');
  });

  it('warns for a lecture in a laboratory', () => {
    const ctx = baseContext({
      loadType: 'lecture',
      room: { roomType: 'laboratory' },
    });
    expect(labHostsLectureRule.validate(ctx).status).toBe('warn');
  });

  it('warns for a lecture in a computer_lab', () => {
    const ctx = baseContext({
      loadType: 'lecture',
      room: { roomType: 'computer_lab' },
    });
    expect(labHostsLectureRule.validate(ctx).status).toBe('warn');
  });

  it('passes for a drafting room (not a lab type)', () => {
    const ctx = baseContext({
      loadType: 'lecture',
      room: { roomType: 'drafting_room' },
    });
    expect(labHostsLectureRule.validate(ctx).status).toBe('pass');
  });
});