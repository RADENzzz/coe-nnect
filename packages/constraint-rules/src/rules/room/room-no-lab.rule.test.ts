import { describe, it, expect } from 'vitest';
import { roomNoLabRule } from './room-no-lab.rule';
import { baseContext } from '../../test-utils/base-context';

describe('R-3 room 206 never hosts labs', () => {
  it('passes for non-lab subject in room 206', () => {
    const ctx = baseContext({
      subject: { labUnits: 0 },
      room: { roomNumber: '206' },
    });
    expect(roomNoLabRule.validate(ctx).status).toBe('pass');
  });

  it('passes for lab subject in a different room', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      room: { roomNumber: '205' },
    });
    expect(roomNoLabRule.validate(ctx).status).toBe('pass');
  });

  it('fails for lab subject in room 206', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      room: { roomNumber: '206' },
    });
    expect(roomNoLabRule.validate(ctx).status).toBe('fail');
  });
});