import { describe, it, expect } from 'vitest';
import { labPriorityRule } from './lab-priority.rule';
import { baseContext } from '../../test-utils/base-context';

describe('S-5 lab priority for lab rooms', () => {
  it('passes for non-lab sessions', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      loadType: 'lecture',
      room: { roomType: 'lecture_room' },
    });
    expect(labPriorityRule.validate(ctx).status).toBe('pass');
  });

  it('passes when no room is assigned', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      loadType: 'laboratory',
      room: null,
    });
    expect(labPriorityRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the subject has no lab component', () => {
    const ctx = baseContext({
      subject: { labUnits: 0 },
      loadType: 'laboratory',
      room: { roomType: 'lecture_room' },
    });
    expect(labPriorityRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the room is a laboratory', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      loadType: 'laboratory',
      room: { roomType: 'laboratory' },
    });
    expect(labPriorityRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the room is a computer_lab', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      loadType: 'laboratory',
      room: { roomType: 'computer_lab' },
    });
    expect(labPriorityRule.validate(ctx).status).toBe('pass');
  });

  it('warns when a lab subject is scheduled in a lecture room', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      loadType: 'laboratory',
      room: { roomType: 'lecture_room' },
    });
    expect(labPriorityRule.validate(ctx).status).toBe('warn');
  });

  it('warns when a lab subject is scheduled in a drafting room', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      loadType: 'laboratory',
      room: { roomType: 'drafting_room' },
    });
    expect(labPriorityRule.validate(ctx).status).toBe('warn');
  });
});