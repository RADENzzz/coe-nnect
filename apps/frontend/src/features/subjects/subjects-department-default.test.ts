import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSubjectsDefaultDepartment,
  restoreSubjectsDepartmentFilter,
} from './subjects-department-default.ts';

test('department head defaults to own department when no department is selected', () => {
  assert.equal(
    getSubjectsDefaultDepartment('department_head', 'dept-a', ''),
    'dept-a',
  );
});

test('college-wide roles default to all departments', () => {
  for (const role of ['administrator', 'college_dean', 'college_secretary']) {
    assert.equal(
      getSubjectsDefaultDepartment(role, 'dept-a', ''),
      '',
    );
  }
});

test('an explicit department selection is preserved', () => {
  assert.equal(
    getSubjectsDefaultDepartment('department_head', 'dept-a', 'dept-b'),
    'dept-b',
  );
});

test('a head without a department does not get an invalid filter', () => {
  assert.equal(
    getSubjectsDefaultDepartment('department_head', '', ''),
    '',
  );
});

test('clear all restores department head default but leaves college roles unfiltered', () => {
  const headParams = restoreSubjectsDepartmentFilter(
    'department_head',
    'dept-a',
    new URLSearchParams('q=math&dept=dept-b&kind=elective'),
  );
  assert.equal(headParams.get('dept'), 'dept-a');
  assert.equal(headParams.get('q'), null);
  assert.equal(headParams.get('kind'), null);

  const secretaryParams = restoreSubjectsDepartmentFilter(
    'college_secretary',
    '',
    new URLSearchParams('dept=dept-a&kind=elective'),
  );
  assert.equal(secretaryParams.get('dept'), null);
  assert.equal(secretaryParams.get('kind'), null);
});
