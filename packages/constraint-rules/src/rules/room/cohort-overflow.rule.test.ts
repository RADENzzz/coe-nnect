import { describe, it, expect } from 'vitest';
import { cohortOverflowRule } from './cohort-overflow.rule';
import { baseContext } from '../../test-utils/base-context';

describe('S-8 cohort overflow', () => {
  it('passes for lecture sessions (only labs are affected)', () => {
    const ctx = baseContext({
      loadType: 'lecture',
      section: { sectionCode: '1A', studentCount: 60 },
      room: { capacity: 40 },
    });
    expect(cohortOverflowRule.validate(ctx).status).toBe('pass');
  });

  it('passes when no room is assigned', () => {
    const ctx = baseContext({
      loadType: 'laboratory',
      section: { sectionCode: '1A', studentCount: 60 },
      room: null,
    });
    expect(cohortOverflowRule.validate(ctx).status).toBe('pass');
  });

  it('passes when room has no capacity recorded', () => {
    const ctx = baseContext({
      loadType: 'laboratory',
      section: { sectionCode: '1A', studentCount: 60 },
      room: { capacity: null },
    });
    expect(cohortOverflowRule.validate(ctx).status).toBe('pass');
  });

  it('passes when studentCount is not set (data not yet available)', () => {
    const ctx = baseContext({
      loadType: 'laboratory',
      section: { sectionCode: '1A' },
      room: { capacity: 40 },
    });
    expect(cohortOverflowRule.validate(ctx).status).toBe('pass');
  });

  it('passes when cohort fits in the room', () => {
    const ctx = baseContext({
      loadType: 'laboratory',
      section: { sectionCode: '1A', studentCount: 30 },
      room: { capacity: 40 },
    });
    expect(cohortOverflowRule.validate(ctx).status).toBe('pass');
  });

  it('passes when cohort exactly fills the room', () => {
    const ctx = baseContext({
      loadType: 'laboratory',
      section: { sectionCode: '1A', studentCount: 40 },
      room: { capacity: 40 },
    });
    expect(cohortOverflowRule.validate(ctx).status).toBe('pass');
  });

  it('warns when cohort exceeds room capacity', () => {
    const ctx = baseContext({
      loadType: 'laboratory',
      section: { sectionCode: '1A', studentCount: 45 },
      room: { capacity: 40 },
    });
    expect(cohortOverflowRule.validate(ctx).status).toBe('warn');
  });

  it('includes the overflow amount in the reason', () => {
    const ctx = baseContext({
      loadType: 'laboratory',
      section: { sectionCode: '1A', studentCount: 60 },
      room: { capacity: 40 },
    });
    const result = cohortOverflowRule.validate(ctx);
    expect(result.status).toBe('warn');
    if (result.status === 'warn') {
      expect(result.reason).toContain('60 students');
      expect(result.reason).toContain('40');
      expect(result.reason).toContain('20 over capacity');
    }
  });

  it('mentions the section code in the reason', () => {
    const ctx = baseContext({
      loadType: 'laboratory',
      section: { sectionCode: 'CpE-1A', studentCount: 50 },
      room: { capacity: 30 },
    });
    const result = cohortOverflowRule.validate(ctx);
    expect(result.status).toBe('warn');
    if (result.status === 'warn') {
      expect(result.reason).toContain('CpE-1A');
    }
  });
});