import type { ModelViewerElement } from '@google/model-viewer';

type CameraViewer = Pick<
  ModelViewerElement,
  'getCameraOrbit' | 'getCameraTarget' | 'getFieldOfView'
>;

type CameraKeyframeViewer = Pick<
  ModelViewerElement,
  'getCameraOrbit' | 'getCameraTarget'
>;

export type CameraKeyframe = {
  orbit: readonly [thetaRad: number, phiRad: number, radiusM: number];
  target: readonly [xM: number, yM: number, zM: number];
  durationMs: number;
};

export type CameraKeyframeEditorItem = CameraKeyframe & {
  editorId: string;
};

export type CameraPoseCaptureResult = {
  orbit: string;
  target: string;
  fieldOfView: string;
  copied: boolean;
  copyError?: unknown;
};

export function captureCameraKeyframe(
  viewer: CameraKeyframeViewer,
  durationMs: number,
): CameraKeyframe {
  const { theta, phi, radius } = viewer.getCameraOrbit();
  const { x, y, z } = viewer.getCameraTarget();

  return {
    orbit: [theta, phi, radius],
    target: [x, y, z],
    durationMs,
  };
}

export function updateInitialCameraKeyframe(
  keyframes: readonly CameraKeyframeEditorItem[],
  currentPose: CameraKeyframe,
): CameraKeyframeEditorItem[] {
  if (keyframes.length === 0) return [];

  return keyframes.map((keyframe, index) =>
    index === 0
      ? { ...keyframe, orbit: currentPose.orbit, target: currentPose.target }
      : keyframe,
  );
}

export function serializeCameraKeyframes(
  keyframes: readonly CameraKeyframe[],
): string {
  const sourceKeyframes = keyframes.map(({ orbit, target, durationMs }) => ({
    orbit,
    target,
    durationMs,
  }));

  return (
    `const CAMERA_INTRO_KEYFRAMES = ${JSON.stringify(sourceKeyframes, null, 2)} ` +
    'as const satisfies readonly CameraKeyframe[];'
  );
}

export async function captureCameraPose(
  viewer: CameraViewer,
  writeClipboard: (value: string) => Promise<void>,
): Promise<CameraPoseCaptureResult> {
  const orbit = viewer.getCameraOrbit().toString();
  const targetPosition = viewer.getCameraTarget();
  const target = `${targetPosition.x}m ${targetPosition.y}m ${targetPosition.z}m`;
  const fieldOfView = `${viewer.getFieldOfView()}deg`;
  const sourceDefaults = `const DEFAULT_CAMERA_ORBIT = '${orbit}';\nconst DEFAULT_CAMERA_TARGET = '${target}';\nconst DEFAULT_CAMERA_FIELD_OF_VIEW = '${fieldOfView}';`;

  try {
    await writeClipboard(sourceDefaults);
    return { orbit, target, fieldOfView, copied: true };
  } catch (copyError) {
    return { orbit, target, fieldOfView, copied: false, copyError };
  }
}
