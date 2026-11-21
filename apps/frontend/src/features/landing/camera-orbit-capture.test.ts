import test from 'node:test';
import assert from 'node:assert/strict';

import { captureCameraPose } from './camera-orbit-capture.ts';

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
