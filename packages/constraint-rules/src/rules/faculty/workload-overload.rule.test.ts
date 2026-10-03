import { describe, it, expect } from 'vitest';
import { workloadOverloadRule } from './workload-overload.rule';
import { baseContext } from '../../test-utils/base-context';

describe('F-3 faculty workload overload', () => {
  it('passes with no faculty', () => {
    const ctx = baseContext({ faculty: null });
    expect(workloadOverloadRule.validate(ctx).status).toBe('pass');
  });

  it('passes when required hours is not set', () => {
    const ctx = baseContext({ faculty: { requiredHours: undefined } });
    expect(workloadOverloadRule.validate(ctx).status).toBe('pass');
  });

  it('passes when assigned hours is not set', () => {
    const ctx = baseContext({ faculty: { assignedHours: undefined } });
    expect(workloadOverloadRule.validate(ctx).status).toBe('pass');
  });

  it('passes when well under the required load', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'lecture',
      faculty: { requiredHours: 18, assignedHours: 6 },
    });
    expect(workloadOverloadRule.validate(ctx).status).toBe('pass');
  });

  it('passes when exactly at the required load', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'lecture',
      faculty: { requiredHours: 15, assignedHours: 12 },
    });
    expect(workloadOverloadRule.validate(ctx).status).toBe('pass');
  });

  it('warns when the plot pushes past the required load', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'lecture',
      faculty: { requiredHours: 15, assignedHours: 13 },
    });
    const result = workloadOverloadRule.validate(ctx);
    expect(result.status).toBe('warn');
    if (result.status === 'warn') {
      expect(result.reason).toContain('16.0h');
      expect(result.reason).toContain('15h');
    }
  });

  it('counts lab sessions at 3 contact hours per unit', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 0, labUnits: 2 },
      loadType: 'laboratory',
      faculty: { requiredHours: 18, assignedHours: 15 },
    });
    // lab contributes 2 × 3 = 6 hours → 15 + 6 = 21 → overload of 3
    const result = workloadOverloadRule.validate(ctx);
    expect(result.status).toBe('warn');
  });

  it('ignores the lab component when loadType is lecture', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 1 },
      loadType: 'lecture',
      faculty: { requiredHours: 18, assignedHours: 15 },
    });
    // 3 + 15 = 18 → still pass
    expect(workloadOverloadRule.validate(ctx).status).toBe('pass');
  });
});