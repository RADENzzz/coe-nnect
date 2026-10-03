import { describe, it, expect } from 'vitest';
import { loadTypeMatchRule } from './load-type-match.rule';
import { baseContext } from '../../test-utils/base-context';

describe('H-13 load type matches subject component', () => {
  it('passes for a lecture-only subject plotted as lecture', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'lecture',
    });
    expect(loadTypeMatchRule.validate(ctx).status).toBe('pass');
  });

  it('passes for a lab-only subject plotted as laboratory', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 0, labUnits: 2 },
      loadType: 'laboratory',
    });
    expect(loadTypeMatchRule.validate(ctx).status).toBe('pass');
  });

  it('passes for a combined subject plotted as lecture', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 1 },
      loadType: 'lecture',
    });
    expect(loadTypeMatchRule.validate(ctx).status).toBe('pass');
  });

  it('passes for a combined subject plotted as laboratory', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 1 },
      loadType: 'laboratory',
    });
    expect(loadTypeMatchRule.validate(ctx).status).toBe('pass');
  });

  it('fails for a lecture-only subject plotted as laboratory', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'laboratory',
    });
    const result = loadTypeMatchRule.validate(ctx);
    expect(result.status).toBe('fail');
    if (result.status === 'fail') {
      expect(result.reason).toContain('no laboratory component');
    }
  });

  it('fails for a lab-only subject plotted as lecture', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 0, labUnits: 2 },
      loadType: 'lecture',
    });
    const result = loadTypeMatchRule.validate(ctx);
    expect(result.status).toBe('fail');
    if (result.status === 'fail') {
      expect(result.reason).toContain('no lecture component');
    }
  });

  it('passes when loadType is other', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'other',
    });
    expect(loadTypeMatchRule.validate(ctx).status).toBe('pass');
  });

  it('passes when loadType is null (unknown, do not block)', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: null,
    });
    expect(loadTypeMatchRule.validate(ctx).status).toBe('pass');
  });
});