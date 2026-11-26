import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('Dean page decides publish requests only through the approval queue', () => {
  const source = read('apps/frontend/src/features/dean/DeanApprovalsPage.tsx');

  assert.match(source, /type BatchAction = 'finalize' \| 'unfinalize-published'/);
  assert.doesNotMatch(source, /BatchAction[^;]*'publish'/);
  assert.doesNotMatch(source, /action === 'publish'/);
  assert.doesNotMatch(source, /Publish \{selectedFinalizedCount\}/);
  assert.match(source, /searchParams\.get\('publishRequest'\)/);
  assert.match(source, /next\.delete\('publishRequest'\)/);
  assert.match(source, /publishDeepLinkHandledRef/);
  assert.match(source, /fetchPublishRequests/);
  assert.match(source, /respondToPublishRequest/);
  assert.match(source, /\['schedule-publish-requests'\]/);
  assert.match(source, /\['schedule-publish-request', saved\.scheduleId\]/);
  assert.match(source, /sendActiveTermToIdp/);
  assert.match(source, /feedback\.success\(/);
  assert.doesNotMatch(source, /const \[publishDecisionError, setPublishDecisionError\]/);
});
