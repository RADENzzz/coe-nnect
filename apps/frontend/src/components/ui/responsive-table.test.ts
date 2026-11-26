import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('./ResponsiveTable.tsx', import.meta.url),
  'utf8',
);

test('selectable tables keep the checkbox column on non-selectable rows', () => {
  const tbody = source.slice(
    source.indexOf('<tbody>'),
    source.indexOf('</tbody>'),
  );
  const selectionCell = tbody.slice(
    tbody.indexOf('{selectable &&'),
    tbody.indexOf('{columns.map((c) =>'),
  );

  assert.ok(selectionCell.length > 0, 'desktop selection cell must exist');
  assert.match(
    selectionCell,
    /rowSelectable\s*\?\s*\(/,
    'read-only rows need a separate branch from selectable rows',
  );
  assert.match(
    selectionCell,
    /:\s*\(\s*<td[\s\S]*cellPad[\s\S]*w-0[\s\S]*\/>/,
    'non-selectable rows need an empty cell with the same padding/width as the checkbox cell',
  );
});
