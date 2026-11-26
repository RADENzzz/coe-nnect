import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('request change modal validates the reason and reports filing through global feedback', () => {
  const modalSource = read(
    'apps/frontend/src/features/timetable/components/RequestChangeModal.tsx',
  );

  assert.match(modalSource, /@MinLength|reason\.trim\(\)\.length < 5/);
  assert.match(modalSource, /maxLength=\{500\}/);
  assert.match(
    modalSource,
    /feedback\.success\('Change request sent to the Dean\.'\)/,
  );
  assert.match(modalSource, /feedback\.failed\(extractApiError/);
});

test('request change modal invalidates every affected query after filing', () => {
  const modalSource = read(
    'apps/frontend/src/features/timetable/components/RequestChangeModal.tsx',
  );

  assert.match(modalSource, /export interface RequestChangeModalProps/);
  assert.match(modalSource, /export default function RequestChangeModal/);
  assert.match(modalSource, /createChangeRequest\(entry\.id, reason\.trim\(\)\)/);
  assert.match(modalSource, /\['schedules'\]/);
  assert.match(modalSource, /\['schedule-change-requests'\]/);
  assert.match(modalSource, /\['schedule-change-request', entry\.id\]/);
  assert.match(modalSource, /\['schedule-publish-requests'\]/);
  assert.match(modalSource, /\['schedule-unfinalize-requests'\]/);
  assert.match(modalSource, /\['coverage'\]/);
  assert.match(modalSource, /\['flagged'\]/);
  assert.doesNotMatch(modalSource, /window\.alert|window\.confirm|window\.prompt/);
});
