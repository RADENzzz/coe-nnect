import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

const pageSource = () =>
  read('apps/frontend/src/features/dean/DeanApprovalsPage.tsx');

function matches(source: string, pattern: RegExp, message: string) {
  assert.ok(pattern.test(source), message);
}

function doesNotMatch(source: string, pattern: RegExp, message: string) {
  assert.ok(!pattern.test(source), message);
}

test('request tables wire a Review action that opens the row drawer', async () => {
  const source = pageSource();
  const start = source.lastIndexOf('{isRequestTab ? (');
  const end = source.indexOf(') : !activeTerm ?', start);
  const requestTable = source.slice(start, end);

  assert.ok(start >= 0 && end > start, 'request table branch not found');
  matches(
    requestTable,
    /getActions=\{getRequestActions\}/,
    'request table must pass its Review actions to ResponsiveTable',
  );
  doesNotMatch(
    requestTable,
    /getActions=\{getActions\}/,
    'schedule-table actions must not be passed to request rows',
  );
  matches(
    source,
    /reviewRowAction\(row, setDrawerTarget\)/,
    'request Review action must open the drawer for its row',
  );

  const { reviewRowAction } = await import('./dean-approval-actions.ts');
  const row = { requestId: 'r7' };
  let opened: unknown = null;
  const actions = reviewRowAction(row, (target: unknown) => {
    opened = target;
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.label, 'Review');
  actions[0]?.onClick?.();
  assert.equal(opened, row);
});

test('clearing an unfinalize request deep link also clears its injected status', async () => {
  const source = pageSource();
  matches(
    source,
    /param === 'request'[\s\S]{0,200}clearRequestDeepLinkParams/,
    'clearing ?request= must also clear the injected ?status=',
  );

  const { clearRequestDeepLinkParams } = await import(
    './dean-approval-actions.ts'
  );
  const deepLink = clearRequestDeepLinkParams(
    new URLSearchParams('request=u1&status=published&deptFilter=CS'),
  );

  assert.equal(deepLink.get('request'), null);
  assert.equal(deepLink.get('status'), null);
  assert.equal(deepLink.get('deptFilter'), 'CS');

  // A status filter set without a request deep link must survive.
  const manual = clearRequestDeepLinkParams(
    new URLSearchParams('status=review'),
  );
  assert.equal(manual.get('status'), 'review');
});
