import test from 'node:test';
import assert from 'node:assert/strict';

import { nextActiveSemesterCode } from './term-semester-suggestion.ts';

function type(code: string, sortOrder: number, isActive: boolean) {
  return {
    code,
    label: code,
    shortLabel: code,
    sortOrder,
    isActive,
    termCount: 0,
    prospectusCount: 0,
    pdfTableCount: 0,
    electiveCount: 0,
  };
}

const types = [
  type('3rd', 40, true),
  type('summer', 30, false),
  type('1st', 10, true),
  type('2nd', 20, true),
];

test('skips an inactive next type in favour of the next active one', () => {
  assert.equal(nextActiveSemesterCode(types, '1st'), '2nd');
  assert.equal(nextActiveSemesterCode(types, '2nd'), '3rd');
  assert.equal(nextActiveSemesterCode(types, '3rd'), '1st');
});

test('wraps among active types and ignores an inactive or unknown current code', () => {
  assert.equal(nextActiveSemesterCode(types, '3rd'), '1st');
  assert.equal(nextActiveSemesterCode(types, 'summer'), '1st');
  assert.equal(nextActiveSemesterCode(types, 'fifth'), '1st');
});

test('returns undefined when no active type exists', () => {
  assert.equal(
    nextActiveSemesterCode([type('summer', 10, false)], 'summer'),
    undefined,
  );
});
