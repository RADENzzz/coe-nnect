import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearFieldError,
  mergeFieldError,
  type FieldError,
} from './form-errors.ts';

test('mergeFieldError replaces one field in place without mutating the input', () => {
  const errors: FieldError[] = [
    { field: 'name', message: 'Name is required' },
    { field: 'email', message: 'Enter a valid email' },
  ];

  const merged = mergeFieldError(errors, 'email', 'Email is already in use');

  assert.deepEqual(merged, [
    { field: 'name', message: 'Name is required' },
    { field: 'email', message: 'Email is already in use' },
  ]);
  assert.deepEqual(errors, [
    { field: 'name', message: 'Name is required' },
    { field: 'email', message: 'Enter a valid email' },
  ]);
  assert.notStrictEqual(merged, errors);
});

test('mergeFieldError appends a field that has no error yet', () => {
  const errors: FieldError[] = [
    { field: 'name', message: 'Name is required' },
  ];

  const merged = mergeFieldError(errors, 'room', 'Select a room');

  assert.deepEqual(merged, [
    { field: 'name', message: 'Name is required' },
    { field: 'room', message: 'Select a room' },
  ]);
  assert.deepEqual(errors, [{ field: 'name', message: 'Name is required' }]);
});

test('clearFieldError removes only the named field without mutating the input', () => {
  const errors: FieldError[] = [
    { field: 'name', message: 'Name is required' },
    { field: 'email', message: 'Enter a valid email' },
    { field: 'room', message: 'Select a room' },
  ];

  const cleared = clearFieldError(errors, 'email');

  assert.deepEqual(cleared, [
    { field: 'name', message: 'Name is required' },
    { field: 'room', message: 'Select a room' },
  ]);
  assert.deepEqual(errors, [
    { field: 'name', message: 'Name is required' },
    { field: 'email', message: 'Enter a valid email' },
    { field: 'room', message: 'Select a room' },
  ]);
});

test('clearing an absent field returns an equivalent new array', () => {
  const errors: FieldError[] = [
    { field: 'name', message: 'Name is required' },
  ];

  const cleared = clearFieldError(errors, 'email');

  assert.deepEqual(cleared, errors);
  assert.notStrictEqual(cleared, errors);
});
