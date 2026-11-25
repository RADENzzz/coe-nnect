import test from 'node:test';
import assert from 'node:assert/strict';

import {
  maxTables,
  nextFreeCombination,
  YEAR_LEVELS,
} from './constants.ts';

const catalog = [
  { code: '3rd' },
  { code: 'summer' },
  { code: 'trimester' },
];

test('maxTables follows the number of catalog semesters', () => {
  assert.equal(maxTables(3), 18);
  assert.equal(maxTables(4), 24);
  assert.equal(maxTables(0), 6);
});

test('nextFreeCombination walks arbitrary semester codes', () => {
  assert.deepEqual(nextFreeCombination([], catalog), {
    yearLevel: 1,
    semester: '3rd',
  });
  assert.deepEqual(
    nextFreeCombination([{ yearLevel: 1, semester: '3rd' }], catalog),
    { yearLevel: 1, semester: 'summer' },
  );
  assert.deepEqual(
    nextFreeCombination(
      [
        { yearLevel: 1, semester: '3rd' },
        { yearLevel: 1, semester: 'summer' },
        { yearLevel: 1, semester: 'trimester' },
      ],
      catalog,
    ),
    { yearLevel: 2, semester: '3rd' },
  );
});

test('nextFreeCombination returns null once every slot is taken', () => {
  const existing = YEAR_LEVELS.flatMap((yearLevel) =>
    catalog.map(({ code: semester }) => ({ yearLevel, semester })),
  );
  assert.equal(nextFreeCombination(existing, catalog), null);
});
