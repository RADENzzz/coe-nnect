import { describe, it, expect } from 'vitest';
import { visitingLecturerCapRule } from './visiting-lecturer-cap.rule';
import { baseContext } from '../../test-utils/base-context';

describe('F-6 visiting lecturer cap', () => {
  it('passes with no faculty', () => {
    const ctx = baseContext({ faculty: null });
    expect(visitingLecturerCapRule.validate(ctx).status).toBe('pass');
  });

  it('passes for regular faculty (rule does not apply)', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'lecture',
      faculty: {
        classification: 'regular',
        assignedUnits: 20,
      },
    });
    expect(visitingLecturerCapRule.validate(ctx).status).toBe('pass');
  });

  it('passes when assigned units is not set', () => {
    const ctx = baseContext({
      faculty: {
        classification: 'visiting_lecturer',
        assignedUnits: undefined,
      },
    });
    expect(visitingLecturerCapRule.validate(ctx).status).toBe('pass');
  });

  it('passes when under the cap', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'lecture',
      faculty: {
        classification: 'visiting_lecturer',
        assignedUnits: 18,
      },
    });
    // 18 + 3 = 21 ≤ 24 → pass
    expect(visitingLecturerCapRule.validate(ctx).status).toBe('pass');
  });

  it('passes when exactly at the cap', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'lecture',
      faculty: {
        classification: 'visiting_lecturer',
        assignedUnits: 21,
      },
    });
    // 21 + 3 = 24 ≤ 24 → pass
    expect(visitingLecturerCapRule.validate(ctx).status).toBe('pass');
  });

  it('fails when the plot pushes past the cap', () => {
    const ctx = baseContext({
      subject: { lectureUnits: 3, labUnits: 0 },
      loadType: 'lecture',
      faculty: {
        classification: 'visiting_lecturer',
        assignedUnits: 22,
      },
    });
    // 22 + 3 = 25 > 24 → fail
    const result = visitingLecturerCapRule.validate(ctx);
    expect(result.status).toBe('fail');
    if (result.status === 'fail') {
      expect(result.reason).toContain('25 units');
      expect(result.reason).toContain('24-unit cap');
    }
  });
});