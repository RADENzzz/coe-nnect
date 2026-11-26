import assert from 'node:assert/strict';
import test from 'node:test';
import { extractApiError } from './api-error.ts';

test('prefers a string response message', () => {
  assert.equal(
    extractApiError({ response: { status: 400, data: { message: 'Bad code' } } }, 'Fallback'),
    'Bad code',
  );
});

test('joins string-array response messages', () => {
  assert.equal(
    extractApiError(
      { response: { status: 422, data: { message: ['Code is required', 'Title is required'] } } },
      'Fallback',
    ),
    'Code is required, Title is required',
  );
});

test('uses exact status fallbacks', () => {
  const cases: Array<[number, string]> = [
    [400, 'Invalid request.'],
    [403, 'You do not have permission to do that.'],
    [404, 'The requested item was not found.'],
    [409, 'This conflicts with an existing record.'],
    [422, 'Please check the entered values.'],
    [500, 'Something went wrong on the server.'],
    [503, 'The service is temporarily unavailable.'],
  ];
  for (const [status, expected] of cases) {
    assert.equal(extractApiError({ response: { status, data: {} } }, 'Fallback'), expected);
  }
});

test('uses network and caller fallbacks', () => {
  assert.equal(extractApiError(new Error('Network Error'), 'Fallback'), 'Could not reach the server.');
  assert.equal(extractApiError({}, 'Fallback'), 'Fallback');
});
