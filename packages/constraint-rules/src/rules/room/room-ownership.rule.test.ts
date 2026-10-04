import { describe, it, expect } from 'vitest';
import { roomOwnershipRule } from './room-ownership.rule';
import { baseContext } from '../../test-utils/base-context';

describe('S-10 room ownership priority', () => {
  it('passes when no room is assigned', () => {
    const ctx = baseContext({ room: null });
    expect(roomOwnershipRule.validate(ctx).status).toBe('pass');
  });

  it('passes for a shared room (no owner)', () => {
    const ctx = baseContext({
      room: { deptId: null },
      subject: { deptId: 'd1' },
    });
    expect(roomOwnershipRule.validate(ctx).status).toBe('pass');
  });

  it('passes when the subject is from the room-owning department', () => {
    const ctx = baseContext({
      room: { deptId: 'd1' },
      subject: { deptId: 'd1' },
    });
    expect(roomOwnershipRule.validate(ctx).status).toBe('pass');
  });

  it('warns when the subject is from a different department', () => {
    const ctx = baseContext({
      room: { deptId: 'd1' },
      subject: { deptId: 'd2' },
    });
    expect(roomOwnershipRule.validate(ctx).status).toBe('warn');
  });
});