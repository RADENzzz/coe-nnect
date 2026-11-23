import test from 'node:test';
import assert from 'node:assert/strict';

import * as classifierLogic from './classifier-logic.ts';

test('classifier opens on one year-term and can show all rows on request', () => {
  const getInitialGroupKey = Reflect.get(
    classifierLogic,
    'getInitialClassifierGroupKey',
  );
  const getRowsForGroup = Reflect.get(
    classifierLogic,
    'getClassifierRowsForGroup',
  );

  assert.equal(typeof getInitialGroupKey, 'function');
  assert.equal(typeof getRowsForGroup, 'function');
  if (typeof getInitialGroupKey !== 'function' || typeof getRowsForGroup !== 'function') {
    return;
  }

  const rows = [
    { key: 'year-one', yearLevel: 1, semester: '1st' },
    { key: 'year-two', yearLevel: 2, semester: '1st' },
  ];
  const initialGroupKey = Reflect.apply(getInitialGroupKey, null, [
    [{ key: '1-1st' }, { key: '2-1st' }],
  ]);
  const initialRows = Reflect.apply(getRowsForGroup, null, [
    rows,
    initialGroupKey,
  ]);

  assert.equal(initialGroupKey, '1-1st');
  assert.deepEqual(
    initialRows.map((row: { key: string }) => row.key),
    ['year-one'],
  );
  assert.deepEqual(Reflect.apply(getRowsForGroup, null, [rows, 'all']), rows);
});

test('classifier falls back to all rows when no year-term groups exist', () => {
  const getInitialGroupKey = Reflect.get(
    classifierLogic,
    'getInitialClassifierGroupKey',
  );

  assert.equal(typeof getInitialGroupKey, 'function');
  if (typeof getInitialGroupKey !== 'function') return;

  assert.equal(Reflect.apply(getInitialGroupKey, null, [[]]), 'all');
});
