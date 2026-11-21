import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterEntriesByRole,
  normalizeTimetableScope,
  TIMETABLE_VIEW_TABS,
  visibleTimetableViewTabs,
  visibleUnresolvedElectives,
  resetTimetableScope,
  departmentTabTone,
} from './timetable-scope.ts';

test('tab-first timetable exposes the four requested views', () => {
  assert.deepEqual(
    TIMETABLE_VIEW_TABS,
    [
      { value: 'master', label: 'Master' },
      { value: 'byDepartment', label: 'Departments' },
      { value: 'byRoom', label: 'Rooms' },
      { value: 'byFaculty', label: 'Faculty' },
    ],
  );
});

test('department heads see the same timetable view tabs but stay department-scoped', () => {
  assert.deepEqual(
    visibleTimetableViewTabs('department_head'),
    [
      { value: 'master', label: 'Master' },
      { value: 'byDepartment', label: 'Departments' },
      { value: 'byRoom', label: 'Rooms' },
      { value: 'byFaculty', label: 'Faculty' },
    ],
  );
  assert.equal(
    visibleTimetableViewTabs('college_dean').length,
    4,
  );
});

test('department heads default to own department but can change view scope', () => {
  assert.deepEqual(
    normalizeTimetableScope({
      role: 'department_head',
      deptId: 'dept-a',
      viewMode: 'byDepartment',
      viewDeptId: '',
    }),
    { viewMode: 'byDepartment', viewDeptId: 'dept-a' },
  );

  assert.deepEqual(
    normalizeTimetableScope({
      role: 'department_head',
      deptId: 'dept-a',
      viewMode: 'byRoom',
      viewDeptId: '',
    }),
    { viewMode: 'byRoom', viewDeptId: '' },
  );

  assert.deepEqual(
    normalizeTimetableScope({
      role: 'department_head',
      deptId: 'dept-a',
      viewMode: 'master',
      viewDeptId: '',
    }),
    { viewMode: 'master', viewDeptId: '' },
  );
});

test('department heads can filter foreign departments and snapshot entries', () => {
  const entries = [
    { id: 'own', deptId: 'dept-a' },
    { id: 'foreign', deptId: 'dept-b' },
  ];

  assert.deepEqual(
    filterEntriesByRole(entries, 'department_head', 'dept-a'),
    entries,
  );
  assert.deepEqual(
    filterEntriesByRole(entries, 'college_dean', 'dept-a'),
    entries,
  );
});

test('clear filter restores the head department default', () => {
  assert.deepEqual(
    resetTimetableScope('department_head', 'dept-a'),
    { viewMode: 'byDepartment', viewDeptId: 'dept-a' },
  );
  assert.deepEqual(
    resetTimetableScope('college_dean', 'dept-a'),
    { viewMode: 'master', viewDeptId: '' },
  );
});

test('department tab tones are stable and valid', () => {
  assert.deepEqual(
    departmentTabTone('CPE'),
    departmentTabTone('CPE'),
  );
  assert.equal(
    departmentTabTone('CPE').dot.startsWith('bg-'),
    true,
  );
});

test('unresolved elective notices are visible only to the owning department head', () => {
  const subjects = [
    { subjectId: 'one', isElective: true, isPlaceholder: true, subjectCode: 'ELEC-1', deptId: 'dept-a' },
    { subjectId: 'two', isElective: true, isPlaceholder: true, subjectCode: 'ELEC-2', deptId: 'dept-b' },
  ];

  assert.deepEqual(
    visibleUnresolvedElectives(subjects, 'department_head', 'dept-a'),
    [subjects[0]],
  );
  assert.deepEqual(
    visibleUnresolvedElectives(subjects, 'college_dean', 'dept-a'),
    [],
  );
});
