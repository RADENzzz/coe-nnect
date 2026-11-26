import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('class block exposes a stop-propagating change request quick action', () => {
  const classBlock = read(
    'apps/frontend/src/features/timetable/components/ClassBlock.tsx',
  );
  const grid = read(
    'apps/frontend/src/features/timetable/components/TimetableGrid.tsx',
  );
  const agenda = read(
    'apps/frontend/src/features/timetable/views/AgendaView.tsx',
  );

  assert.match(classBlock, /onRequestChange\?:\s*\(entry: ScheduleEntry\) => void/);
  assert.match(classBlock, /requestChangeEntryIds\?: Set<string>/);
  assert.match(classBlock, /e\.stopPropagation\(\)/);
  assert.match(grid, /onRequestChange/);
  assert.match(agenda, /onRequestChange/);
});

test('timetable page opens the change modal only for the head own locked entries', () => {
  const page = read(
    'apps/frontend/src/features/timetable/TimetablePage.tsx',
  );

  assert.match(page, /RequestChangeModal/);
  assert.match(page, /requestChangeEntry/);
  assert.match(page, /department_head/);
  assert.match(page, /'review'/);
  assert.match(page, /'finalized'/);
});
