import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProspectusForm,
  withDuplicateSubjectError,
} from './validate-prospectus-form.ts';

const valid = {
  programId: '1',
  subjectId: '2',
  yearLevel: '3',
  semester: '1st',
  lectureSessionsPerWeek: '2',
  lectureMinutesPerSession: '90',
  labSessionsPerWeek: '1',
  labMinutesPerSession: '180',
};

test('accepts a complete placement', () => {
  assert.deepEqual(validateProspectusForm(valid), []);
});

test('reports every missing required field at once', () => {
  const errors = validateProspectusForm({
    ...valid,
    programId: '',
    subjectId: '',
    semester: '',
  });
  assert.deepEqual(errors.map((e) => e.field).sort(), ['programId', 'semester', 'subjectId']);
});

test('rejects out-of-range sessions and minutes', () => {
  const errors = validateProspectusForm({
    ...valid,
    lectureSessionsPerWeek: '0',
    labSessionsPerWeek: '4',
    lectureMinutesPerSession: '15',
    labMinutesPerSession: '400',
  });
  assert.deepEqual(
    errors.map((e) => e.field).sort(),
    ['labMinutesPerSession', 'labSessionsPerWeek', 'lectureMinutesPerSession', 'lectureSessionsPerWeek'],
  );
});

test('keeping an existing error when a duplicate subject is added', () => {
  const problems = validateProspectusForm({ ...valid, semester: '' });
  assert.deepEqual(withDuplicateSubjectError(problems, true), [
    { field: 'semester', message: 'Choose a semester.' },
    {
      field: 'subjectId',
      message: 'This subject is already mapped to this slot',
    },
  ]);
});
