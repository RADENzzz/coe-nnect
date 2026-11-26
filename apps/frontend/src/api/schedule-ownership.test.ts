import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getScheduleDeptId } from './schedule-ownership.ts';

const read = (path: string) =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');

test('schedule ownership uses the plotted row department, not the catalog owner', () => {
  assert.equal(
    getScheduleDeptId({
      deptId: '2',
      subject: { deptId: '1' },
    }),
    '2',
  );
});

test('schedule ownership accepts snake_case version rows', () => {
  assert.equal(
    getScheduleDeptId({
      dept_id: '2',
      subject: { deptId: '1' },
    }),
    '2',
  );
});

test('schedule ownership falls back to the catalog owner only for legacy rows', () => {
  assert.equal(
    getScheduleDeptId({
      deptId: null,
      subject: { deptId: '1' },
    }),
    '1',
  );
  assert.equal(getScheduleDeptId({}), '');
});

test('every live schedule surface derives its department from the row', () => {
  const files = [
    'apps/frontend/src/features/timetable/TimetablePage.tsx',
    'apps/frontend/src/features/dean/DeanApprovalsPage.tsx',
    'apps/frontend/src/features/dean/DeanDashboardPage.tsx',
    'apps/frontend/src/features/dean/DeanDepartmentsPage.tsx',
    'apps/frontend/src/features/dashboard/DashboardPage.tsx',
  ];

  for (const file of files) {
    const source = read(file);
    assert.match(
      source,
      /getScheduleDeptId\(/,
      `${file} must derive schedule ownership from the schedule row`,
    );
    assert.doesNotMatch(
      source,
      /\b(raw|s|row|schedule)\.subject\??\.deptId\b/,
      `${file} still uses the subject catalog owner for a schedule`,
    );
  }
});
