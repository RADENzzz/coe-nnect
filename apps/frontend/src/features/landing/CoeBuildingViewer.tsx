import '@google/model-viewer';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ModelViewerElement } from '@google/model-viewer';
import {
  captureCameraPose,
  type CameraPoseCaptureResult,
} from './camera-orbit-capture';
import {
  getCameraZoomLockConstraints,
  getHorizontalAngularVelocity,
  shouldStartHorizontalInertia,
  stepHorizontalInertia,
} from './camera-inertia';

const MODEL_SRC = '/3D_Models/coe_Building.glb';
const DEFAULT_CAMERA_ORBIT = '2.2471349423243066rad 1.1908017615620003rad 154.5116331083687m';
const DEFAULT_CAMERA_TARGET = '-4.961324271775314m 6.2189790436357235m -2.4709905048660423m';
const DEFAULT_CAMERA_FIELD_OF_VIEW = '15.402513570977764deg';

/**
 * Interactive 3D preview of the COE building. The viewer reads the GLB at
 * runtime, so replacing `public/3D_Models/coe_Building.glb` with the finished
 * model updates this card with no code changes.
 */
export default function CoeBuildingViewer() {
  const viewerRef = useRef<ModelViewerElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [devInertiaEnabled, setDevInertiaEnabled] = useState(false);
  const devInertiaEnabledRef = useRef(false);
  const inertiaFrameRef = useRef<number | null>(null);
  const [cameraPoseCapture, setCameraPoseCapture] =
    useState<CameraPoseCaptureResult | null>(null);

  const handleDevInertiaToggle = (enabled: boolean) => {
    devInertiaEnabledRef.current = enabled;
    setDevInertiaEnabled(enabled);
    if (!enabled && inertiaFrameRef.current !== null) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
  };

  const handleCaptureCameraOrbit = async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const capture = await captureCameraPose(viewer, (value) => {
      const clipboard = navigator.clipboard;
      if (!clipboard) {
        return Promise.reject(new Error('Clipboard API is unavailable.'));
      }
      return clipboard.writeText(value);
    });

    setCameraPoseCapture(capture);
  };

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

    const cancelInertia = () => {
      if (inertiaFrameRef.current !== null) {
        cancelAnimationFrame(inertiaFrameRef.current);
        inertiaFrameRef.current = null;
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
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

    const playIntroAnimations = async () => {
      const animationNames = [...viewer.availableAnimations];
      if (animationNames.length === 0) return;

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
      if (!import.meta.env.DEV) {
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
      void playIntroAnimations();
    };

    viewer.addEventListener('load', handleLoad);
    return () => {
      cancelInertia();
      viewer.removeEventListener('load', handleLoad);
      viewer.removeEventListener('pointerdown', handlePointerDown);
      viewer.removeEventListener('pointermove', handlePointerMove);
      viewer.removeEventListener('pointerup', handlePointerUp);
      viewer.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, []);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
        </div>
      )}

      {import.meta.env.DEV && loaded && (
        <div className="absolute bottom-3 right-3 z-10 max-w-[85%] rounded-lg bg-slate-950/90 p-3 text-xs text-white shadow-lg">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCaptureCameraOrbit}
              className="rounded-md bg-white px-3 py-1.5 font-semibold text-slate-900 hover:bg-slate-100"
            >
              Capture & copy camera defaults
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 font-medium">
              <input
                type="checkbox"
                role="switch"
                aria-label="Enable camera inertia"
                checked={devInertiaEnabled}
                onChange={(event) =>
                  handleDevInertiaToggle(event.currentTarget.checked)
                }
                className="peer sr-only"
              />
              <span className="relative h-5 w-9 rounded-full bg-white/25 transition-colors peer-checked:bg-emerald-500 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white" />
              <span>Inertia {devInertiaEnabled ? 'on' : 'off'}</span>
            </label>
          </div>
          {cameraPoseCapture && (
            <div className="mt-2 space-y-1" aria-live="polite">
              <p>
                {cameraPoseCapture.copied
                  ? 'Copied all camera defaults.'
                  : 'Clipboard copy failed; select all values below.'}
              </p>
              <code className="block break-all rounded bg-white/10 p-2">
                const DEFAULT_CAMERA_ORBIT = '{cameraPoseCapture.orbit}';
                <br />
                const DEFAULT_CAMERA_TARGET = '{cameraPoseCapture.target}';
                <br />
                const DEFAULT_CAMERA_FIELD_OF_VIEW = '{cameraPoseCapture.fieldOfView}';
              </code>
              <p>
                Paste over the adjacent camera constants near the top of
                CoeBuildingViewer.tsx.
              </p>
            </div>
          )}
        </div>
      )}

      <model-viewer
        ref={viewerRef}
        src={MODEL_SRC}
        alt="3D model of the College of Engineering building"
        camera-controls=""
        interaction-prompt="none"
        shadow-intensity="0.8"
        exposure="1.1"
        environment-image="neutral"
        camera-orbit={DEFAULT_CAMERA_ORBIT}
        camera-target={DEFAULT_CAMERA_TARGET}
        field-of-view={DEFAULT_CAMERA_FIELD_OF_VIEW}
        min-camera-orbit="auto auto 50%"
        max-camera-orbit="auto auto 200%"
        style={
          {
            backgroundColor: 'transparent',
            '--poster-color': 'transparent',
            width: '100%',
            height: '100%',
          } as CSSProperties
        }
      />
    </div>
  );
}
