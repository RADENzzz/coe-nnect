import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ModelViewerElement } from '@google/model-viewer';
import type { CameraKeyframe } from './camera-orbit-capture';
import {
  canEnableCameraControls,
  getCameraZoomKeyframeConstraints,
  getCameraZoomLockConstraints,
  getHorizontalAngularVelocity,
  playCameraKeyframes,
  shouldStartHorizontalInertia,
  stepHorizontalInertia,
} from './camera-inertia';

export function useCoeBuildingMotion(
  viewerRef: RefObject<ModelViewerElement | null>,
  initialKeyframes: readonly CameraKeyframe[],
  devInertiaEnabled: boolean,
) {
  const [loaded, setLoaded] = useState(false);
  const [cameraControlsEnabled, setCameraControlsEnabled] = useState(false);
  const [cameraAnimationPlaying, setCameraAnimationPlaying] = useState(false);
  const devInertiaEnabledRef = useRef(devInertiaEnabled);
  const inertiaFrameRef = useRef<number | null>(null);
  const cameraAnimationCancelRef = useRef<(() => void) | null>(null);
  const modelAnimationFinishedRef = useRef(false);
  const cameraAnimationFinishedRef = useRef(false);

  devInertiaEnabledRef.current = devInertiaEnabled;

  const cancelInertia = useCallback(() => {
    if (inertiaFrameRef.current !== null) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
  }, []);

  const startCameraKeyframeAnimation = useCallback(
    (keyframes: readonly CameraKeyframe[]) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      cameraAnimationCancelRef.current?.();
      cameraAnimationFinishedRef.current = false;
      viewer.cameraControls = false;
      setCameraControlsEnabled(false);
      setCameraAnimationPlaying(true);

      if (!import.meta.env.DEV && keyframes.length > 0) {
        const constraints = getCameraZoomKeyframeConstraints(
          keyframes,
          viewer.getFieldOfView(),
        );
        viewer.minCameraOrbit = constraints.minCameraOrbit;
        viewer.maxCameraOrbit = constraints.maxCameraOrbit;
        viewer.minFieldOfView = constraints.minFieldOfView;
        viewer.maxFieldOfView = constraints.maxFieldOfView;
      }

      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      cameraAnimationCancelRef.current = playCameraKeyframes(
        viewer,
        keyframes,
        prefersReducedMotion,
        requestAnimationFrame,
        cancelAnimationFrame,
        () => {
          cameraAnimationCancelRef.current = null;
          cameraAnimationFinishedRef.current = true;
          setCameraAnimationPlaying(false);

          if (!import.meta.env.DEV && keyframes.length > 0) {
            const { radius } = viewer.getCameraOrbit();
            const constraints = getCameraZoomLockConstraints(
              radius,
              viewer.getFieldOfView(),
            );
            viewer.minCameraOrbit = constraints.minCameraOrbit;
            viewer.maxCameraOrbit = constraints.maxCameraOrbit;
            viewer.minFieldOfView = constraints.minFieldOfView;
            viewer.maxFieldOfView = constraints.maxFieldOfView;
          }

          const canEnableControls = canEnableCameraControls(
            modelAnimationFinishedRef.current,
            cameraAnimationFinishedRef.current,
          );
          viewer.cameraControls = canEnableControls;
          setCameraControlsEnabled(canEnableControls);
        },
      );
    },
    [viewerRef],
  );

  const stopCameraKeyframeAnimation = useCallback(() => {
    cameraAnimationCancelRef.current?.();
    cameraAnimationCancelRef.current = null;
    cameraAnimationFinishedRef.current = true;
    setCameraAnimationPlaying(false);

    const viewer = viewerRef.current;
    const canEnableControls = canEnableCameraControls(
      modelAnimationFinishedRef.current,
      cameraAnimationFinishedRef.current,
    );
    if (viewer) viewer.cameraControls = canEnableControls;
    setCameraControlsEnabled(canEnableControls);
  }, [viewerRef]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const activePointers = new Set<number>();
    let rotationPointerId: number | null = null;
    let lastPointerX = 0;
    let lastPointerTime = 0;
    let angularVelocity = 0;
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    const handlePointerDown = (event: PointerEvent) => {
      if (!viewer.cameraControls) return;
      cancelInertia();
      activePointers.add(event.pointerId);

      if (
        activePointers.size !== 1 ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        rotationPointerId = null;
        angularVelocity = 0;
        return;
      }

      rotationPointerId = event.pointerId;
      lastPointerX = event.clientX;
      lastPointerTime = event.timeStamp;
      angularVelocity = 0;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== rotationPointerId) return;

      const duration = event.timeStamp - lastPointerTime;
      if (duration > 0) {
        angularVelocity = getHorizontalAngularVelocity(
          event.clientX - lastPointerX,
          duration,
          viewer.clientHeight,
        );
        lastPointerX = event.clientX;
        lastPointerTime = event.timeStamp;
      }
    };

    const startInertia = () => {
      if (
        !viewer.cameraControls ||
        !shouldStartHorizontalInertia(
          import.meta.env.DEV,
          devInertiaEnabledRef.current,
          prefersReducedMotion,
          angularVelocity,
        )
      ) {
        return;
      }

      const orbit = viewer.getCameraOrbit();
      let theta = orbit.theta;
      let previousTime = 0;

      const animate = (time: number) => {
        const elapsed = previousTime === 0 ? 0 : (time - previousTime) / 1000;
        previousTime = time;
        const step = stepHorizontalInertia(angularVelocity, elapsed);
        angularVelocity = step.velocity;
        theta += step.deltaRadians;
        viewer.cameraOrbit = `${theta}rad ${orbit.phi}rad ${orbit.radius}m`;

        if (Math.abs(angularVelocity) < 0.08) {
          inertiaFrameRef.current = null;
          return;
        }

        inertiaFrameRef.current = requestAnimationFrame(animate);
      };

      inertiaFrameRef.current = requestAnimationFrame(animate);
    };

    const handlePointerUp = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      if (event.pointerId !== rotationPointerId) return;

      rotationPointerId = null;
      if (activePointers.size === 0) startInertia();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      if (event.pointerId === rotationPointerId) {
        rotationPointerId = null;
        angularVelocity = 0;
      }
      cancelInertia();
    };

    viewer.addEventListener('pointerdown', handlePointerDown);
    viewer.addEventListener('pointermove', handlePointerMove);
    viewer.addEventListener('pointerup', handlePointerUp);
    viewer.addEventListener('pointercancel', handlePointerCancel);

    let finishedAnimationCount = 0;
    let removeAnimationFinishedListener: (() => void) | null = null;
    const markModelAnimationsFinished = () => {
      modelAnimationFinishedRef.current = true;
      const canEnableControls = canEnableCameraControls(
        modelAnimationFinishedRef.current,
        cameraAnimationFinishedRef.current,
      );
      viewer.cameraControls = canEnableControls;
      setCameraControlsEnabled(canEnableControls);
    };

    const playIntroAnimations = async () => {
      const animationNames = [...viewer.availableAnimations];
      if (animationNames.length === 0) {
        markModelAnimationsFinished();
        return;
      }

      const handleAnimationFinished = () => {
        finishedAnimationCount += 1;
        if (finishedAnimationCount < animationNames.length) return;
        viewer.removeEventListener('finished', handleAnimationFinished);
        removeAnimationFinishedListener = null;
        markModelAnimationsFinished();
      };
      viewer.addEventListener('finished', handleAnimationFinished);
      removeAnimationFinishedListener = () =>
        viewer.removeEventListener('finished', handleAnimationFinished);

      viewer.animationName = animationNames[0];
      await viewer.updateComplete;

      for (const animationName of animationNames.slice(1)) {
        viewer.appendAnimation(animationName, { repetitions: 1 });
      }

      viewer.currentTime = 0;
      viewer.play({ repetitions: 1, pingpong: false });
    };

    const handleLoad = () => {
      setLoaded(true);
      modelAnimationFinishedRef.current = false;
      startCameraKeyframeAnimation(initialKeyframes);
      void playIntroAnimations();
    };

    viewer.addEventListener('load', handleLoad);
    return () => {
      cancelInertia();
      cameraAnimationCancelRef.current?.();
      removeAnimationFinishedListener?.();
      viewer.removeEventListener('load', handleLoad);
      viewer.removeEventListener('pointerdown', handlePointerDown);
      viewer.removeEventListener('pointermove', handlePointerMove);
      viewer.removeEventListener('pointerup', handlePointerUp);
      viewer.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [
    cancelInertia,
    initialKeyframes,
    startCameraKeyframeAnimation,
    viewerRef,
  ]);

  return {
    cameraAnimationPlaying,
    cameraControlsEnabled,
    cancelInertia,
    loaded,
    playCameraKeyframes: startCameraKeyframeAnimation,
    stopCameraKeyframeAnimation,
  };
}
