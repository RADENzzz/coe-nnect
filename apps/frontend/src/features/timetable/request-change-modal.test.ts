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

test('request change modal clears a stale reason when reopened for the same entry', () => {
  const modalSource = read(
    'apps/frontend/src/features/timetable/components/RequestChangeModal.tsx',
  );

  assert.ok(
    /useEffect\(\(\) => \{\s*if \(open\) setReason\(''\);\s*\}, \[open, entry\?\.id\]\);/.test(
      modalSource,
    ),
    'reason must reset when the modal is opened, even for the same entry id',
  );
  assert.ok(
    !/\}, \[entry\?\.id\]\);/.test(modalSource),
    'entry id alone must not be the only reset trigger',
  );
});
