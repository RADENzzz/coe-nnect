import type { ModelViewerElement } from '@google/model-viewer';

type CameraViewer = Pick<
  ModelViewerElement,
  'getCameraOrbit' | 'getCameraTarget' | 'getFieldOfView'
>;

export type CameraPoseCaptureResult = {
  orbit: string;
  target: string;
  fieldOfView: string;
  copied: boolean;
  copyError?: unknown;
};

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
