import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCameraZoomLockConstraints,
  getHorizontalAngularVelocity,
  shouldStartHorizontalInertia,
  stepHorizontalInertia,
} from './camera-inertia.ts';
import * as cameraInertia from './camera-inertia.ts';

test('keyframe camera playback eases between poses using the shortest orbit path', () => {
  const play = cameraInertia.playCameraKeyframes;
  assert.equal(typeof play, 'function');
  if (typeof play !== 'function') return;

  const frames: Array<(time: number) => void> = [];
  const viewer = {
    cameraOrbit: '',
    cameraTarget: '',
    jumpCameraToGoal: () => {},
  };
  let animationFinished = false;
  play(
    viewer,
    [
      { orbit: [6, 1, 10], target: [0, 0, 0], durationMs: 0 },
      { orbit: [0.2, 1, 14], target: [8, 4, -2], durationMs: 1000 },
    ],
    false,
    (callback) => {
      frames.push(callback);
      return frames.length;
    },
    () => {},
    () => {
      animationFinished = true;
    },
  );

  frames[0](0);
  frames[1](500);
  const expectedTheta = Number(
    (6 + Math.atan2(Math.sin(0.2 - 6), Math.cos(0.2 - 6)) / 2).toPrecision(
      12,
    ),
  );
  assert.equal(viewer.cameraOrbit, `${expectedTheta}rad 1rad 12m`);
  assert.equal(viewer.cameraTarget, '4m 2m -1m');
  frames[2](1000);
  assert.equal(animationFinished, true);
});

test('keyframe camera playback jumps to the final pose for reduced motion', () => {
  const play = cameraInertia.playCameraKeyframes;
  assert.equal(typeof play, 'function');
  if (typeof play !== 'function') return;

  let scheduledFrames = 0;
  let jumpCount = 0;
  const viewer = {
    cameraOrbit: '',
    cameraTarget: '',
    jumpCameraToGoal: () => {
      jumpCount += 1;
    },
  };
  play(
    viewer,
    [
      { orbit: [1, 1, 2], target: [0, 0, 0], durationMs: 0 },
      { orbit: [3, 1.5, 5], target: [1, 2, 3], durationMs: 1000 },
    ],
    true,
    () => {
      scheduledFrames += 1;
      return scheduledFrames;
    },
    () => {},
  );

  assert.equal(viewer.cameraOrbit, '3rad 1.5rad 5m');
  assert.equal(viewer.cameraTarget, '1m 2m 3m');
  assert.equal(scheduledFrames, 0);
  assert.equal(jumpCount, 1);
});

test('camera zoom slider scales radius relative to the intro framing', () => {
  const getRadius = cameraInertia.getCameraRadiusForZoom;
  assert.equal(typeof getRadius, 'function');
  if (typeof getRadius !== 'function') return;

  assert.equal(getRadius(20, 50), 10);
  assert.equal(getRadius(20, 100), 20);
  assert.equal(getRadius(20, 200), 40);
  assert.equal(getRadius(20, 250), 40);
});

test('camera zoom display maps camera radius to a bounded percentage', () => {
  const getZoomPercent = cameraInertia.getCameraZoomPercentForRadius;
  assert.equal(typeof getZoomPercent, 'function');
  if (typeof getZoomPercent !== 'function') return;

  assert.equal(getZoomPercent(20, 10), 50);
  assert.equal(getZoomPercent(20, 20), 100);
  assert.equal(getZoomPercent(20, 40), 200);
  assert.equal(getZoomPercent(20, 60), 200);
});

test('camera zoom baseline uses the initial keyframe radius', () => {
  const getZoomBaseRadius = cameraInertia.getCameraZoomBaseRadius;
  assert.equal(typeof getZoomBaseRadius, 'function');
  if (typeof getZoomBaseRadius !== 'function') return;

  assert.equal(
    getZoomBaseRadius([
      { orbit: [1, 0.9, 20], target: [0, 0, 0], durationMs: 0 },
      { orbit: [2, 1, 40], target: [1, 1, 1], durationMs: 1000 },
    ]),
    20,
  );
});

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

test('zoom constraints allow only the keyframe radius range during playback', () => {
  const getConstraints = cameraInertia.getCameraZoomKeyframeConstraints;
  assert.equal(typeof getConstraints, 'function');
  if (typeof getConstraints !== 'function') return;

  assert.deepEqual(
    getConstraints(
      [
        { orbit: [0, 1, 16], target: [0, 0, 0], durationMs: 0 },
        { orbit: [1, 1, 24], target: [0, 0, 0], durationMs: 900 },
      ],
      20,
    ),
    {
      minCameraOrbit: 'auto auto 16m',
      maxCameraOrbit: 'auto auto 24m',
      minFieldOfView: '20deg',
      maxFieldOfView: '20deg',
    },
  );
});

test('camera controls wait for both model and camera animations to finish', () => {
  const canEnable = cameraInertia.canEnableCameraControls;
  assert.equal(typeof canEnable, 'function');
  if (typeof canEnable !== 'function') return;

  assert.equal(canEnable(false, false), false);
  assert.equal(canEnable(true, false), false);
  assert.equal(canEnable(false, true), false);
  assert.equal(canEnable(true, true), true);
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
