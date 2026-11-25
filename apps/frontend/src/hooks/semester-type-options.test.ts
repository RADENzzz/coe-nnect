import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSemesterOptions,
  nextSemesterCode,
} from './semester-type-options.ts';

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

// Deliberately out of order: both helpers must use sortOrder, not input order.
const types = [
  type('3rd', 30, true),
  type('summer', 40, false),
  type('1st', 10, true),
  type('2nd', 20, true),
];

test('appends an inactive current code without mutating the catalog', () => {
  const before = JSON.stringify(types);
  const options = buildSemesterOptions(types, 'summer');

  assert.deepEqual(
    options.map((entry) => entry.code),
    ['1st', '2nd', '3rd', 'summer'],
  );
  assert.equal(JSON.stringify(types), before);
});

test('omits inactive types that are not the current code', () => {
  assert.deepEqual(
    buildSemesterOptions(types).map((entry) => entry.code),
    ['1st', '2nd', '3rd'],
  );
});

test('ignores an unknown current code', () => {
  assert.deepEqual(
    buildSemesterOptions(types, 'fifth').map((entry) => entry.code),
    ['1st', '2nd', '3rd'],
  );
});

test('nextAfter follows sort order and wraps to the first type', () => {
  assert.equal(nextSemesterCode(types, '1st'), '2nd');
  assert.equal(nextSemesterCode(types, '3rd'), 'summer');
  assert.equal(nextSemesterCode(types, 'summer'), '1st');
});

test('nextAfter returns undefined for an unknown code', () => {
  assert.equal(nextSemesterCode(types, 'fifth'), undefined);
});
