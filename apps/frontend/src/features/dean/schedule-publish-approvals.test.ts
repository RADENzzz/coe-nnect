import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('Dean page decides publish requests only through the approval workspace', () => {
  const source = read('apps/frontend/src/features/dean/DeanApprovalsPage.tsx');

  // Direct publish stays forbidden and IDP stays manual.
  assert.match(source, /type BatchAction = 'finalize' \| 'unfinalize-published'/);
  assert.doesNotMatch(source, /BatchAction[^;]*'publish'/);
  assert.doesNotMatch(source, /action === 'publish'/);
  assert.doesNotMatch(source, /Publish \{selectedFinalizedCount\}/);
  assert.match(source, /sendActiveTermToIdp/);
  assert.match(source, /feedback\.success\(/);
  assert.doesNotMatch(source, /const \[publishDecisionError, setPublishDecisionError\]/);

  // Deep links keep their own parameters; the drawer owns the decisions.
  assert.match(source, /searchParams\.get\('publishRequest'\)/);
  assert.match(source, /next\.delete\('publishRequest'\)/);
  assert.match(source, /publishDeepLinkHandledRef/);
  assert.match(source, /fetchPublishRequests/);
  assert.match(source, /\['schedule-publish-requests'\]/);

  // Tabbed workspace wiring.
  assert.match(source, /type ApprovalTab = 'publish' \| 'unfinalize' \| 'change' \| 'review' \| 'finalized' \| 'all'/);
  assert.match(source, /Publish requests \(\$\{publishPendingCount\}\)/);
  assert.match(source, /Unfinalize requests \(\$\{unfinalizePendingCount\}\)/);
  assert.match(source, /Change requests \(\$\{changePendingCount\}\)/);
  assert.match(source, /Pending review \(\$\{reviewCount\}\)/);
  assert.match(source, /Finalized & published \(\$\{finalizedCount\}\)/);
  assert.match(source, /All schedules \(\$\{schedules\.length\}\)/);
  assert.match(source, /ApprovalDetailDrawer/);
  assert.match(source, /searchParams\.get\('changeRequest'\)/);
  assert.match(source, /next\.delete\('changeRequest'\)/);
  assert.doesNotMatch(source, /navigate\(`\/dean\/timetable\?focus=/);
  assert.match(source, /activeTab !== 'review' && activeTab !== 'finalized' && activeTab !== 'all'/);
});
