import '@google/model-viewer';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ModelViewerElement } from '@google/model-viewer';
import {
  captureCameraPose,
  type CameraPoseCaptureResult,
} from './camera-orbit-capture';

const MODEL_SRC = '/3D_Models/coe_Building.glb';
const DEFAULT_CAMERA_ORBIT = '2.2133245190924704rad 1.5579204157012274rad 154.5116331083687m';
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
  const [cameraPoseCapture, setCameraPoseCapture] =
    useState<CameraPoseCaptureResult | null>(null);

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
      void playIntroAnimations();
    };

    viewer.addEventListener('load', handleLoad);
    return () => viewer.removeEventListener('load', handleLoad);
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
          <button
            type="button"
            onClick={handleCaptureCameraOrbit}
            className="rounded-md bg-white px-3 py-1.5 font-semibold text-slate-900 hover:bg-slate-100"
          >
            Capture & copy camera defaults
          </button>
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
