import test from 'node:test';
import assert from 'node:assert/strict';

import { waitForMinimumLogoutAnimation } from './logout-flow.ts';

test('logout animation waits for at least a short visible duration', async () => {
  const startedAt = Date.now();
  await waitForMinimumLogoutAnimation(60);
  assert.ok(Date.now() - startedAt >= 55);
});
