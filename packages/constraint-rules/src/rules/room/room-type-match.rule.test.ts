import { describe, it, expect } from 'vitest';
import { roomTypeMatchRule } from './room-type-match.rule';
import type { RuleContext } from '../../types/rule-context.type';
import { baseContext } from '../../test-utils/base-context';

describe('R-1 room type match', () => {
  it('passes when no room type is required', () => {
    const ctx = baseContext({ subject: { requiredRoomType: null } });
    expect(roomTypeMatchRule.validate(ctx).status).toBe('pass');
  });

  it('passes when room type matches', () => {
    const ctx = baseContext({
      subject: { requiredRoomType: 'laboratory' },
      room: { roomType: 'laboratory' },
    });
    expect(roomTypeMatchRule.validate(ctx).status).toBe('pass');
  });

  it('fails when room type does not match', () => {
    const ctx = baseContext({
      subject: { requiredRoomType: 'laboratory' },
      room: { roomType: 'lecture_room' },
    });
    const result = roomTypeMatchRule.validate(ctx);
    expect(result.status).toBe('fail');
  });
});