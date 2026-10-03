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
      loadType: 'laboratory',
    });
    expect(roomNoLabRule.validate(ctx).status).toBe('fail');
  });

  // ▼▼▼ NEW TESTS — appended at the end, still inside `describe` ▼▼▼

  it('passes when loadType is lecture, even in Room 206 for a lab-containing subject', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      room: { roomNumber: '206' },
      loadType: 'lecture',
    });
    expect(roomNoLabRule.validate(ctx).status).toBe('pass');
  });

  it('fails when loadType is laboratory in Room 206', () => {
    const ctx = baseContext({
      subject: { labUnits: 1 },
      room: { roomNumber: '206' },
      loadType: 'laboratory',
    });
    expect(roomNoLabRule.validate(ctx).status).toBe('fail');
  });
});   // ← the describe's closing brace — new tests are ABOVE this line