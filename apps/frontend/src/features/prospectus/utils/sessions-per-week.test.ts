import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SESSION_LIMITS,
  buildSessionsPerWeekPatch,
  formatSessionsPerWeek,
} from './sessions-per-week.ts';

test('formats both session counts', () => {
  assert.equal(
    formatSessionsPerWeek({ lectureSessionsPerWeek: 3, labSessionsPerWeek: 1 }),
    '3 lec · 1 lab',
  );
});

test('formats one-sided counts', () => {
  assert.equal(
    formatSessionsPerWeek({ lectureSessionsPerWeek: 2, labSessionsPerWeek: 0 }),
    '2 lec',
  );
  assert.equal(
    formatSessionsPerWeek({ lectureSessionsPerWeek: 0, labSessionsPerWeek: 1 }),
    '1 lab',
  );
});

test('shows an em dash when both counts are missing or zero', () => {
  assert.equal(formatSessionsPerWeek(null), '—');
  assert.equal(formatSessionsPerWeek(undefined), '—');
  assert.equal(
    formatSessionsPerWeek({ lectureSessionsPerWeek: 0, labSessionsPerWeek: 0 }),
    '—',
  );
});

test('builds a patch containing only the two editable fields', () => {
  const patch = buildSessionsPerWeekPatch({
    lectureSessionsPerWeek: 3,
    labSessionsPerWeek: 1,
  });

  assert.deepEqual(patch, {
    lectureSessionsPerWeek: 3,
    labSessionsPerWeek: 1,
  });
  assert.deepEqual(Object.keys(patch).sort(), [
    'labSessionsPerWeek',
    'lectureSessionsPerWeek',
  ]);
});

test('shares the existing validation ranges', () => {
  assert.deepEqual(SESSION_LIMITS, {
    lecture: { min: 1, max: 5 },
    lab: { min: 1, max: 3 },
  });
});
