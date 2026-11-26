import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');

test('Dean approval drawer owns all three request decisions', () => {
  const source = read(
    'apps/frontend/src/features/dean/components/ApprovalDetailDrawer.tsx',
  );

  assert.match(source, /export type ApprovalDrawerTarget/);
  assert.match(source, /kind: 'publish'/);
  assert.match(source, /kind: 'unfinalize'/);
  assert.match(source, /kind: 'change'/);
  assert.match(source, /kind: 'schedule'/);
  assert.match(source, /createPortal\(/);
  assert.match(source, /lockBodyScroll/);
  assert.match(source, /aria-label="Approval details"/);
  assert.match(source, /respondToPublishRequest/);
  assert.match(source, /respondToUnfinalizeRequest/);
  assert.match(source, /respondToChangeRequest/);
  assert.match(source, /feedback\.success\(/);
  assert.match(source, /feedback\.failed\(/);
  assert.match(source, /if \(!remarks\.trim\(\)\) return;|Rejection remarks are required/);
  assert.doesNotMatch(source, /window\.alert|window\.confirm|window\.prompt/);
  assert.doesNotMatch(source, /respondToPublishRequest\([^)]*'published'/);
});
