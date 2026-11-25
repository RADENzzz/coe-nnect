import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSemesterType } from './semester-match.ts';

const types = [
  { code: '1st', label: 'First Semester', shortLabel: '1st', sortOrder: 10 },
  { code: '2nd', label: 'Second Semester', shortLabel: '2nd', sortOrder: 20 },
  { code: '3rd', label: 'Third Semester', shortLabel: '3rd', sortOrder: 30 },
  { code: 'summer', label: 'Summer', shortLabel: 'Summer', sortOrder: 40 },
];

test('matches a code, a short label, a full label, and an alias', () => {
  assert.equal(matchSemesterType('3RD', types)?.code, '3rd');
  assert.equal(matchSemesterType('Third Semester', types)?.code, '3rd');
  assert.equal(matchSemesterType('Third', types)?.code, '3rd');
  assert.equal(matchSemesterType('Mid Year', types)?.code, 'summer');
});

test('returns null for an unrecognized value', () => {
  assert.equal(matchSemesterType('Fifth Term', types), null);
});

test('matches a term name and a PDF heading that embed a type', () => {
  assert.equal(
    matchSemesterType('Third Semester 2026-2027', types)?.code,
    '3rd',
  );
  assert.equal(matchSemesterType('THIRD YEAR - 3RD SEMESTER', types)?.code, '3rd');
});

test('resolves an ambiguous label by sort order', () => {
  const ambiguous = [
    { code: 'a', label: 'Term', shortLabel: 'A', sortOrder: 20 },
    { code: 'b', label: 'Term', shortLabel: 'B', sortOrder: 10 },
  ];
  assert.equal(matchSemesterType('Term', ambiguous)?.code, 'b');
});
