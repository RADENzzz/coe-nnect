import test from 'node:test';
import assert from 'node:assert/strict';

import { waitForMinimumLoginAnimation } from './login-flow.ts';

test('login success animation waits briefly without delaying the route', async () => {
  const startedAt = Date.now();
  await waitForMinimumLoginAnimation(60);
  assert.ok(Date.now() - startedAt >= 55);
});
