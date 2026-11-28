import { describe, it, expect } from 'vitest';
import { crossDeptRequestRule } from './cross-dept-request.rule';
import { baseContext } from '../../test-utils/base-context';

describe('F-8 cross-department request', () => {
  it('fails when faculty dept differs from catalog subject dept and no request exists', () => {
    const ctx = baseContext({
      subject: { deptId: 'd1' },
      faculty: { deptId: 'd2' },
    });

    expect(crossDeptRequestRule.validate(ctx).status).toBe('fail');
  });

  it('passes when the faculty belongs to the department being scheduled even if the catalog owner differs', () => {
    const ctx = baseContext({
      subject: { deptId: 'd1' },
      faculty: { deptId: 'd2' },
      scheduleDeptId: 'd2',
    });

    expect(crossDeptRequestRule.validate(ctx).status).toBe('pass');
  });

  it('still fails for a genuinely foreign faculty', () => {
    const ctx = baseContext({
      subject: { deptId: 'd1' },
      faculty: { deptId: 'd3' },
      scheduleDeptId: 'd2',
    });

    expect(crossDeptRequestRule.validate(ctx).status).toBe('fail');
  });

  it('passes with an approved request when the faculty is genuinely foreign', () => {
    const ctx = baseContext({
      termId: 't1',
      subject: { subjectId: 's1', deptId: 'd1' },
      faculty: { facultyId: 'f1', deptId: 'd3' },
      scheduleDeptId: 'd2',
      approvedFacultyRequests: [
        { requestId: 'r1', facultyId: 'f1', subjectId: 's1', termId: 't1' },
      ],
    });

    expect(crossDeptRequestRule.validate(ctx).status).toBe('pass');
  });
});
