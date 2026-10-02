import { describe, it, expect } from 'vitest';
import { facultyQualificationRule } from './faculty-qualification.rule';
import { baseContext } from '../../test-utils/base-context';

describe('F-5 faculty qualification', () => {
  it('passes with no faculty', () => {
    const ctx = baseContext({ faculty: null });
    expect(facultyQualificationRule.validate(ctx).status).toBe('pass');
  });

  it('passes when no qualification list is loaded', () => {
    const ctx = baseContext({
      faculty: { qualifiedSubjectIds: undefined },
    });
    expect(facultyQualificationRule.validate(ctx).status).toBe('pass');
  });

  it('passes when faculty is qualified', () => {
    const ctx = baseContext({
      faculty: { qualifiedSubjectIds: ['s1'] },
    });
    expect(facultyQualificationRule.validate(ctx).status).toBe('pass');
  });

  it('fails when faculty is not qualified', () => {
    const ctx = baseContext({
      faculty: { qualifiedSubjectIds: ['s2', 's3'] },
    });
    expect(facultyQualificationRule.validate(ctx).status).toBe('fail');
  });
});