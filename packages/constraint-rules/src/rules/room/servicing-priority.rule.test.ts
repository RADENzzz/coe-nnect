import { describe, it, expect } from 'vitest';
import { servicingPriorityRule } from './servicing-priority.rule';
import { baseContext } from '../../test-utils/base-context';

describe('S-6 servicing priority for shared labs', () => {
  it('passes when no room is assigned', () => {
    const ctx = baseContext({ room: null });
    expect(servicingPriorityRule.validate(ctx).status).toBe('pass');
  });

  it('passes for a non-shared-lab room', () => {
    const ctx = baseContext({
      room: { roomNumber: '205', deptId: 'd1' },
      subject: { deptId: 'd1' },
    });
    expect(servicingPriorityRule.validate(ctx).status).toBe('pass');
  });

  it('passes for a subject from another department (servicing)', () => {
    const ctx = baseContext({
      room: { roomNumber: '203', deptId: 'd1' },
      subject: { deptId: 'd2' },
    });
    expect(servicingPriorityRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the shared lab has no owning department', () => {
    const ctx = baseContext({
      room: { roomNumber: '203', deptId: null },
      subject: { deptId: 'd1' },
    });
    expect(servicingPriorityRule.validate(ctx).status).toBe('pass');
  });

  it('warns for an in-department subject in a shared lab', () => {
    const ctx = baseContext({
      room: { roomNumber: '203', deptId: 'd1' },
      subject: { deptId: 'd1' },
    });
    expect(servicingPriorityRule.validate(ctx).status).toBe('warn');
  });

  it('warns for room 204 with the same pattern', () => {
    const ctx = baseContext({
      room: { roomNumber: '204', deptId: 'd1' },
      subject: { deptId: 'd1' },
    });
    expect(servicingPriorityRule.validate(ctx).status).toBe('warn');
  });
});