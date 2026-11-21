import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCameraZoomLockConstraints,
  getHorizontalAngularVelocity,
  shouldStartHorizontalInertia,
  stepHorizontalInertia,
} from './camera-inertia.ts';

test('horizontal inertia stays off in dev until enabled, and respects reduced motion', () => {
  assert.equal(shouldStartHorizontalInertia(true, false, false, 1), false);
  assert.equal(shouldStartHorizontalInertia(true, true, false, 1), true);
  assert.equal(shouldStartHorizontalInertia(false, false, false, 1), true);
  assert.equal(shouldStartHorizontalInertia(false, true, true, 1), false);
});

test('zoom lock keeps camera distance and field of view fixed', () => {
  assert.deepEqual(getCameraZoomLockConstraints(12.5, 24), {
    minCameraOrbit: 'auto auto 12.5m',
    maxCameraOrbit: 'auto auto 12.5m',
    minFieldOfView: '24deg',
    maxFieldOfView: '24deg',
  });
});

test('horizontal flick velocity follows model-viewer rotation direction', () => {
  assert.ok(
    Math.abs(getHorizontalAngularVelocity(100, 500, 500) + (4 * Math.PI) / 5) <
      1e-12,
  );
  assert.ok(
    Math.abs(getHorizontalAngularVelocity(-100, 500, 500) - (4 * Math.PI) / 5) <
      1e-12,
  );
});

test('horizontal flick velocity ignores invalid measurements and is capped', () => {
  assert.equal(getHorizontalAngularVelocity(100, 0, 500), 0);
  assert.equal(getHorizontalAngularVelocity(100, 100, 0), 0);
  assert.equal(getHorizontalAngularVelocity(10000, 1, 500), -8);
});

test('horizontal inertia advances in its current direction and slows with friction', () => {
  const firstFrame = stepHorizontalInertia(2, 0.1);
  const secondFrame = stepHorizontalInertia(firstFrame.velocity, 0.1);

  assert.ok(firstFrame.deltaRadians > 0);
  assert.ok(firstFrame.velocity > 0);
  assert.ok(firstFrame.velocity < 2);
  assert.ok(secondFrame.deltaRadians > 0);
  assert.ok(secondFrame.velocity < firstFrame.velocity);
});
