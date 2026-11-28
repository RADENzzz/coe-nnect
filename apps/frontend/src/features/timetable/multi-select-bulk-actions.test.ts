import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getBulkActionEligibleIds } from './utils/bulk-actions.util.ts';

const entry = (id: string, status?: 'draft' | 'review' | 'finalized' | 'published') =>
  ({ id, status }) as never;

const selected = new Set(['d', 'r', 'f', 'p']);

test('bulk actions only return rows whose status allows the action', () => {
  const entries = [
    entry('d', 'draft'),
    entry('r', 'review'),
    entry('f', 'finalized'),
    entry('p', 'published'),
  ];

  assert.deepEqual(getBulkActionEligibleIds('delete', entries, selected), ['d', 'r']);
  assert.deepEqual(getBulkActionEligibleIds('review', entries, selected), ['d']);
  assert.deepEqual(getBulkActionEligibleIds('finalize', entries, selected), ['d', 'r']);
  assert.deepEqual(getBulkActionEligibleIds('request-publish', entries, selected), ['f']);
});

test('frontend test script registers the bulk-actions test file', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  ) as { scripts: { test: string } };

  assert.match(
    packageJson.scripts.test,
    /(?:^|\s)src\/features\/timetable\/multi-select-bulk-actions\.test\.ts(?:\s|$)/,
  );
});
