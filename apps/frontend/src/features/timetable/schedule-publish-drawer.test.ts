import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('schedule drawer files publish requests and shows the Dean response', () => {
  const source = read(
    'apps/frontend/src/features/timetable/components/ScheduleDetailDrawer.tsx',
  );

  assert.match(source, /const STATUS_OPTIONS = \['draft', 'review', 'finalized'\] as const/);
  assert.match(source, /published: 'Published'/);
  assert.match(source, /entry\.status !== 'published'/);
  assert.match(source, /fetchSchedulePublishRequest/);
  assert.match(source, /createPublishRequest/);
  assert.match(source, /Request publish approval/);
  assert.match(source, /Publish approval pending/);
  assert.match(source, /Dean note/);
  assert.match(source, /\['schedule-publish-request', entry\?\.id\]/);
  assert.match(source, /feedback\.success\(/);
  assert.doesNotMatch(source, /alert\(|confirm\(|prompt\(/);
  assert.doesNotMatch(source, /const \[publishError, setPublishError\]/);
});
