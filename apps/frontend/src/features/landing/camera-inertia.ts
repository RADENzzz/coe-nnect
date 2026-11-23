import type { CameraKeyframe } from './camera-orbit-capture';

export interface CameraIntroViewer {
  cameraOrbit: string;
  cameraTarget: string;
  jumpCameraToGoal(): void;
}

export type CameraFrameRequest = (callback: (time: number) => void) => number;

export type CameraFrameCancel = (handle: number) => void;

const MIN_CAMERA_ZOOM_PERCENT = 50;
const MAX_CAMERA_ZOOM_PERCENT = 200;

export function getCameraZoomBaseRadius(
  keyframes: readonly CameraKeyframe[],
): number {
  const initialKeyframe = keyframes[0];
  if (!initialKeyframe) {
    throw new Error('At least one camera keyframe is required for zoom.');
  }
  return initialKeyframe.orbit[2];
}

export function canEnableCameraControls(
  modelAnimationFinished: boolean,
  cameraAnimationFinished: boolean,
): boolean {
  return modelAnimationFinished && cameraAnimationFinished;
}

export function getCameraRadiusForZoom(
  baseRadiusM: number,
  zoomPercent: number,
): number {
  const clampedZoomPercent = Math.min(
    MAX_CAMERA_ZOOM_PERCENT,
    Math.max(MIN_CAMERA_ZOOM_PERCENT, zoomPercent),
  );
  return (baseRadiusM * clampedZoomPercent) / 100;
}

export function getCameraZoomPercentForRadius(
  baseRadiusM: number,
  radiusM: number,
): number {
  return Math.min(
    MAX_CAMERA_ZOOM_PERCENT,
    Math.max(
      MIN_CAMERA_ZOOM_PERCENT,
      Math.round((radiusM / baseRadiusM) * 100),
    ),
  );
}

function applyCameraKeyframe(
  viewer: CameraIntroViewer,
  keyframe: CameraKeyframe,
): void {
  const format = (value: number) => Number(value.toPrecision(12)).toString();
  viewer.cameraOrbit = `${format(keyframe.orbit[0])}rad ${format(keyframe.orbit[1])}rad ${format(keyframe.orbit[2])}m`;
  viewer.cameraTarget = `${format(keyframe.target[0])}m ${format(keyframe.target[1])}m ${format(keyframe.target[2])}m`;
  viewer.jumpCameraToGoal();
}

export function playCameraKeyframes(
  viewer: CameraIntroViewer,
  keyframes: readonly CameraKeyframe[],
  prefersReducedMotion: boolean,
  requestFrame: CameraFrameRequest,
  cancelFrame: CameraFrameCancel,
  onComplete?: () => void,
): () => void {
  if (keyframes.length === 0) {
    onComplete?.();
    return () => {};
  }

  if (prefersReducedMotion || keyframes.length === 1) {
    applyCameraKeyframe(viewer, keyframes[keyframes.length - 1]);
    onComplete?.();
    return () => {};
  }

  applyCameraKeyframe(viewer, keyframes[0]);

  let cancelled = false;
  let frameHandle: number | null = null;
  let segmentIndex = 1;
  let segmentStartTime: number | null = null;

  const animate = (time: number) => {
    if (cancelled) return;

    if (segmentStartTime === null) segmentStartTime = time;
    const from = keyframes[segmentIndex - 1];
    const to = keyframes[segmentIndex];
    const duration = Math.max(0, to.durationMs);
    const progress =
      duration === 0 ? 1 : Math.min(1, (time - segmentStartTime) / duration);
    const easedProgress = 0.5 - Math.cos(Math.PI * progress) / 2;
    const thetaDelta = Math.atan2(
      Math.sin(to.orbit[0] - from.orbit[0]),
      Math.cos(to.orbit[0] - from.orbit[0]),
    );

    applyCameraKeyframe(viewer, {
      orbit: [
        from.orbit[0] + thetaDelta * easedProgress,
        from.orbit[1] + (to.orbit[1] - from.orbit[1]) * easedProgress,
        from.orbit[2] + (to.orbit[2] - from.orbit[2]) * easedProgress,
      ],
      target: [
        from.target[0] + (to.target[0] - from.target[0]) * easedProgress,
        from.target[1] + (to.target[1] - from.target[1]) * easedProgress,
        from.target[2] + (to.target[2] - from.target[2]) * easedProgress,
      ],
      durationMs: to.durationMs,
    });

    if (progress === 1) {
      segmentIndex += 1;
      segmentStartTime = time;
      if (segmentIndex >= keyframes.length) {
        frameHandle = null;
        onComplete?.();
        return;
      }
    }

    frameHandle = requestFrame(animate);
  };

  frameHandle = requestFrame(animate);

  return () => {
    cancelled = true;
    if (frameHandle !== null) cancelFrame(frameHandle);
  };
}

const MAX_ANGULAR_VELOCITY = 8;
const FRICTION_TIME_SECONDS = 0.65;

export function getCameraZoomLockConstraints(
  radius: number,
  fieldOfView: number,
): {
  minCameraOrbit: string;
  maxCameraOrbit: string;
  minFieldOfView: string;
  maxFieldOfView: string;
} {
  const fixedRadius = `${radius}m`;
  const fixedFieldOfView = `${fieldOfView}deg`;

  return {
    minCameraOrbit: `auto auto ${fixedRadius}`,
    maxCameraOrbit: `auto auto ${fixedRadius}`,
    minFieldOfView: fixedFieldOfView,
    maxFieldOfView: fixedFieldOfView,
  };
}

export function getCameraZoomKeyframeConstraints(
  keyframes: readonly CameraKeyframe[],
  fieldOfView: number,
): {
  minCameraOrbit: string;
  maxCameraOrbit: string;
  minFieldOfView: string;
  maxFieldOfView: string;
} {
  const radii = keyframes.map((keyframe) => keyframe.orbit[2]);
  const minimumRadius = Math.min(...radii);
  const maximumRadius = Math.max(...radii);
  const fixedFieldOfView = `${fieldOfView}deg`;

  return {
    minCameraOrbit: `auto auto ${minimumRadius}m`,
    maxCameraOrbit: `auto auto ${maximumRadius}m`,
    minFieldOfView: fixedFieldOfView,
    maxFieldOfView: fixedFieldOfView,
  };
}

export function shouldStartHorizontalInertia(
  isDevelopment: boolean,
  developmentInertiaEnabled: boolean,
  prefersReducedMotion: boolean,
  angularVelocity: number,
): boolean {
  return (
    (!isDevelopment || developmentInertiaEnabled) &&
    !prefersReducedMotion &&
    Math.abs(angularVelocity) >= 0.2
  );
}

export function getHorizontalAngularVelocity(
  deltaX: number,
  durationMs: number,
  viewerHeight: number,
): number {
  if (
    !Number.isFinite(deltaX) ||
    !Number.isFinite(durationMs) ||
    !Number.isFinite(viewerHeight) ||
    durationMs <= 0 ||
    viewerHeight <= 0
  ) {
    return 0;
  }

  const radiansPerSecond =
    (-2 * Math.PI * deltaX * 1000) / (viewerHeight * durationMs);

  return Math.max(
    -MAX_ANGULAR_VELOCITY,
    Math.min(MAX_ANGULAR_VELOCITY, radiansPerSecond),
  );
}

export function stepHorizontalInertia(
  angularVelocity: number,
  elapsedSeconds: number,
): { deltaRadians: number; velocity: number } {
  const elapsed = Math.max(0, Math.min(elapsedSeconds, 0.05));
  const decay = Math.exp(-elapsed / FRICTION_TIME_SECONDS);

  return {
    deltaRadians:
      angularVelocity * FRICTION_TIME_SECONDS * (1 - decay),
    velocity: angularVelocity * decay,
  };
}
