import test from 'node:test';
import assert from 'node:assert/strict';

import * as cameraCapture from './camera-orbit-capture.ts';
import { captureCameraPose } from './camera-orbit-capture.ts';

test('captureCameraKeyframe stores numeric pose data and transition duration', () => {
  const capture = cameraCapture.captureCameraKeyframe;
  assert.equal(typeof capture, 'function');
  if (typeof capture !== 'function') return;

  const keyframe = capture(
    {
      getCameraOrbit: () => ({ theta: 1.2, phi: 0.8, radius: 34 }),
      getCameraTarget: () => ({ x: -2, y: 1.5, z: 7 }),
    },
    1250,
  );

  assert.deepEqual(keyframe, {
    orbit: [1.2, 0.8, 34],
    target: [-2, 1.5, 7],
    durationMs: 1250,
  });
});

test('updating the initial camera pose preserves timing and later keyframes', () => {
  const updateInitial = cameraCapture.updateInitialCameraKeyframe;
  assert.equal(typeof updateInitial, 'function');
  if (typeof updateInitial !== 'function') return;

  const keyframes = [
    {
      orbit: [1, 0.9, 20],
      target: [0, 1, -2],
      durationMs: 0,
      editorId: 'start',
    },
    {
      orbit: [2, 1.1, 24],
      target: [1, 2, -3],
      durationMs: 900,
      editorId: 'next',
    },
  ] as const;
  const currentPose = {
    orbit: [4, 1.3, 32],
    target: [-3, 5, 6],
    durationMs: 500,
  } as const;

  assert.deepEqual(updateInitial(keyframes, currentPose), [
    {
      ...keyframes[0],
      orbit: currentPose.orbit,
      target: currentPose.target,
    },
    keyframes[1],
  ]);
});

test('camera keyframes serialize to a paste-ready TypeScript constant', () => {
  const serialize = cameraCapture.serializeCameraKeyframes;
  assert.equal(typeof serialize, 'function');
  if (typeof serialize !== 'function') return;

  const keyframes = [
    { orbit: [1, 0.9, 20], target: [0, 1, -2], durationMs: 900 },
  ] as const;

  assert.equal(
    serialize(keyframes),
    `const CAMERA_INTRO_KEYFRAMES = ${JSON.stringify(keyframes, null, 2)} as const satisfies readonly CameraKeyframe[];`,
  );
});

test('serialized keyframe source excludes editor-only ids', () => {
  const serialize = cameraCapture.serializeCameraKeyframes;
  assert.equal(typeof serialize, 'function');
  if (typeof serialize !== 'function') return;

  const keyframes = [
    { orbit: [1, 0.9, 20], target: [0, 1, -2], durationMs: 900, editorId: 'key-7' },
  ] as const;

  assert.equal(serialize(keyframes), `const CAMERA_INTRO_KEYFRAMES = [
  {
    "orbit": [
      1,
      0.9,
      20
    ],
    "target": [
      0,
      1,
      -2
    ],
    "durationMs": 900
  }
] as const satisfies readonly CameraKeyframe[];`);
});

test('captureCameraPose captures orbit and pan target for source defaults', async () => {
  let copiedValue = '';

  const result = await captureCameraPose(
    {
      getCameraOrbit: () => ({
        theta: 0,
        phi: 0,
        radius: 1,
        toString: () => '42deg 61deg 2.4m',
      }),
      getCameraTarget: () => ({ x: 1.25, y: 0.4, z: -2 }),
      getFieldOfView: () => 26.5,
    },
    async (value) => {
      copiedValue = value;
    },
  );

  assert.equal(result.orbit, '42deg 61deg 2.4m');
  assert.equal(result.target, '1.25m 0.4m -2m');
  assert.equal(result.fieldOfView, '26.5deg');
  assert.equal(result.copied, true);
  assert.equal(
    copiedValue,
    "const DEFAULT_CAMERA_ORBIT = '42deg 61deg 2.4m';\nconst DEFAULT_CAMERA_TARGET = '1.25m 0.4m -2m';\nconst DEFAULT_CAMERA_FIELD_OF_VIEW = '26.5deg';",
  );
});

test('captureCameraPose keeps orbit and target when clipboard copying fails', async () => {
  const copyError = new Error('Clipboard unavailable');

  const result = await captureCameraPose(
    {
      getCameraOrbit: () => ({
        theta: 0,
        phi: 0,
        radius: 1,
        toString: () => '10deg 70deg 80%',
      }),
      getCameraTarget: () => ({ x: 0, y: 0, z: 0 }),
      getFieldOfView: () => 30,
    },
    async () => {
      throw copyError;
    },
  );

  assert.equal(result.orbit, '10deg 70deg 80%');
  assert.equal(result.target, '0m 0m 0m');
  assert.equal(result.fieldOfView, '30deg');
  assert.equal(result.copied, false);
  assert.equal(result.copyError, copyError);
});
