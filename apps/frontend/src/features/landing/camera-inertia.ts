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
