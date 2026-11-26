import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('plot subject modal starts with all departments visible', () => {
  const modal = read(
    'apps/frontend/src/features/plot-subject/PlotSubjectModal.tsx',
  );

  const start = modal.indexOf('const defaultDept');
  assert.ok(start > 0, 'plot modal must compute a department filter default');
  const reset = modal.slice(start, modal.indexOf('if (!open)', start));

  assert.match(reset, /const defaultDept = '';/);
  assert.doesNotMatch(reset, /profile\?\.role === 'department_head'/);
  assert.doesNotMatch(reset, /setFilterDept\(myDeptId\)/);
  assert.match(modal, /<option value="">All departments<\/option>/);
  assert.match(modal, /setFilterDept\(presetSubjectId \? '' : defaultDept\)/);
});
