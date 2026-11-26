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

  assert.match(source, /fetchScheduleChangeRequest/);
  assert.match(source, /\['schedule-change-request', entry\?\.id\]/);
  assert.match(source, /Request change pending/);
  assert.match(source, /Dean approved the change request/);
  assert.match(source, /Dean note/);
  assert.match(source, /RequestChangeModal/);
  assert.match(source, /\['schedule-change-requests'\]/);
  assert.doesNotMatch(source, /window\.alert|window\.confirm|window\.prompt/);
});

test('publication stays behind the approval flow and rejections stay visible', () => {
  const source = read(
    'apps/frontend/src/features/timetable/components/ScheduleDetailDrawer.tsx',
  );
  const api = read('apps/frontend/src/api/schedule.api.ts');
  const plot = read(
    'apps/frontend/src/features/plot-subject/PlotSubjectModal.tsx',
  );

  assert.match(
    api,
    /export type EditableScheduleStatus = 'draft' \| 'review' \| 'finalized';/,
  );
  const statusUpdater = api.slice(
    api.indexOf('export async function updateScheduleStatus'),
  );
  assert.match(statusUpdater, /status: EditableScheduleStatus/);
  assert.doesNotMatch(statusUpdater.slice(0, 200), /'published'/);

  assert.match(
    source,
    /const handleStatusChange = \(newStatus: EditableScheduleStatus\)/,
  );
  assert.doesNotMatch(source, /statusMutation\.mutate\(newStatus as any\)/);
  assert.doesNotMatch(
    source,
    /publishRequest\?\.status === 'rejected' && entry\.status === 'draft'/,
  );
  assert.match(source, /Dean note — previous publish request/);
  assert.match(source, /Cancel finalization/);
  assert.match(source, /updateScheduleStatus\(entry!\.id, 'draft'\)/);
  assert.match(source, /Finalization cancelled/);

  assert.doesNotMatch(
    plot,
    /updateScheduleStatus|createPublishRequest|'published'/,
  );
});
