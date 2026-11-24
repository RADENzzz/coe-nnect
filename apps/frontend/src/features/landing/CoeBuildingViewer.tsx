import '@google/model-viewer';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ModelViewerElement } from '@google/model-viewer';
import CoeBuildingViewerDevControls from './CoeBuildingViewerDevControls';
import {
  captureCameraKeyframe,
  serializeCameraKeyframes,
  updateInitialCameraKeyframe,
  type CameraKeyframe,
  type CameraKeyframeEditorItem,
} from './camera-orbit-capture';
import {
  getCameraRadiusForZoom,
  getCameraZoomBaseRadius,
  getCameraZoomPercentForRadius,
} from './camera-inertia';
import { useCoeBuildingMotion } from './useCoeBuildingMotion';

const MODEL_SRC = '/3D_Models/coe_Building.glb';
const DEFAULT_CAMERA_FIELD_OF_VIEW = '15.402513570977764deg';
const CAMERA_INTRO_KEYFRAMES = [
  {
    "orbit": [
      -1.2889579364771067,
      1.5571390171317057,
      96.15751057528988
    ],
    "target": [
      -13.3988451739381,
      5.174407438053279,
      -9.259725485497297
    ],
    "durationMs": 5000
  },
  {
    "orbit": [
      2.3513008264050312,
      1.4673787704872387,
      104.0792004009705
    ],
    "target": [
      0.9155817630901351,
      4.417303152381093,
      11.52685261023364
    ],
    "durationMs": 4000
  }
] as const satisfies readonly CameraKeyframe[];

/**
 * Interactive 3D preview of the COE building. The viewer reads the GLB at
 * runtime, so replacing `public/3D_Models/coe_Building.glb` with the finished
 * model updates this card with no code changes.
 */
export default function CoeBuildingViewer() {
  const viewerRef = useRef<ModelViewerElement>(null);
  const [devInertiaEnabled, setDevInertiaEnabled] = useState(false);
  const [devToolsVisible, setDevToolsVisible] = useState(true);
  const [cameraZoomPercent, setCameraZoomPercent] = useState(100);
  const {
    cameraAnimationPlaying,
    cameraControlsEnabled,
    cancelInertia,
    loaded,
    playCameraKeyframes,
    stopCameraKeyframeAnimation,
  } = useCoeBuildingMotion(
    viewerRef,
    CAMERA_INTRO_KEYFRAMES,
    devInertiaEnabled,
  );
  const [cameraKeyframes, setCameraKeyframes] = useState<
    CameraKeyframeEditorItem[]
  >(() =>
    CAMERA_INTRO_KEYFRAMES.map((keyframe, index) => ({
      ...keyframe,
      editorId: `initial-${index}`,
    })),
  );
  const cameraZoomBaseRadiusM = getCameraZoomBaseRadius(cameraKeyframes);
  const nextKeyframeIdRef = useRef(CAMERA_INTRO_KEYFRAMES.length);
  const [keyframeDurationMs, setKeyframeDurationMs] = useState(1600);
  const [cameraKeyframeStatus, setCameraKeyframeStatus] = useState('');
  const [cameraKeyframeSource, setCameraKeyframeSource] = useState('');
  const handleDevInertiaToggle = (enabled: boolean) => {
    setDevInertiaEnabled(enabled);
    if (!enabled) cancelInertia();
  };

  const handleCaptureCameraKeyframe = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const keyframe = captureCameraKeyframe(
      viewer,
      cameraKeyframes.length === 0 ? 0 : keyframeDurationMs,
    );
    const editorId = `captured-${nextKeyframeIdRef.current++}`;
    setCameraKeyframes((current) => [...current, { ...keyframe, editorId }]);
    setCameraKeyframeStatus('Camera key added. Copy the code to keep it.');
  };

  const handleSetInitialCamera = () => {
    const viewer = viewerRef.current;
    const initialKeyframe = cameraKeyframes[0];
    if (!viewer || !initialKeyframe) return;

    const currentPose = captureCameraKeyframe(
      viewer,
      initialKeyframe.durationMs,
    );
    setCameraKeyframes((current) =>
      updateInitialCameraKeyframe(current, currentPose),
    );
    setCameraKeyframeStatus(
      'Initial camera pose updated. Copy keyframes to keep it.',
    );
  };

  const handleCopyCameraKeyframes = async () => {
    const source = serializeCameraKeyframes(cameraKeyframes);
    setCameraKeyframeSource(source);

    try {
      const clipboard = navigator.clipboard;
      if (!clipboard) throw new Error('Clipboard API is unavailable.');
      await clipboard.writeText(source);
      setCameraKeyframeStatus('Copied camera keyframes to the clipboard.');
    } catch {
      setCameraKeyframeStatus(
        'Clipboard copy failed. Select and copy the code below.',
      );
    }
  };

  const handleRemoveCameraKeyframe = (index: number) => {
    setCameraKeyframes((current) =>
      current.length > 1
        ? current.filter((_, itemIndex) => itemIndex !== index)
        : current,
    );
    setCameraKeyframeStatus('Camera key removed.');
  };

  const handleKeyframeDurationChange = (durationMs: number) => {
    setKeyframeDurationMs(durationMs);
  };

  const handleTransitionDurationChange = (
    index: number,
    durationMs: number,
  ) => {
    setCameraKeyframes((current) =>
      current.map((keyframe, keyframeIndex) =>
        keyframeIndex === index
          ? { ...keyframe, durationMs }
          : keyframe,
      ),
    );
  };

  const handleCameraPreview = () => {
    if (cameraAnimationPlaying) {
      stopCameraKeyframeAnimation();
      return;
    }

    playCameraKeyframes(cameraKeyframes);
  };

  const handleCameraZoomChange = (zoomPercent: number) => {
    const viewer = viewerRef.current;
    if (!viewer || !cameraControlsEnabled || cameraAnimationPlaying) return;

    const { theta, phi } = viewer.getCameraOrbit();
    const radius = getCameraRadiusForZoom(
      cameraZoomBaseRadiusM,
      zoomPercent,
    );
    viewer.cameraOrbit = `${theta}rad ${phi}rad ${radius}m`;
    viewer.jumpCameraToGoal();
    setCameraZoomPercent(
      getCameraZoomPercentForRadius(cameraZoomBaseRadiusM, radius),
    );
  };

  useEffect(() => {
    if (!import.meta.env.DEV || !loaded) return;

    const viewer = viewerRef.current;
    if (!viewer) return;

    const handleCameraChange = () => {
      setCameraZoomPercent(
        getCameraZoomPercentForRadius(
          cameraZoomBaseRadiusM,
          viewer.getCameraOrbit().radius,
        ),
      );
    };

    viewer.addEventListener('camera-change', handleCameraChange);
    handleCameraChange();
    return () => viewer.removeEventListener('camera-change', handleCameraChange);
  }, [cameraZoomBaseRadiusM, loaded]);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
        </div>
      )}

      {import.meta.env.DEV &&
        loaded &&
        (devToolsVisible ? (
          <CoeBuildingViewerDevControls
            cameraAnimationPlaying={cameraAnimationPlaying}
            cameraControlsEnabled={cameraControlsEnabled}
            cameraKeyframeSource={cameraKeyframeSource}
            cameraKeyframeStatus={cameraKeyframeStatus}
            cameraKeyframes={cameraKeyframes}
            cameraZoomPercent={cameraZoomPercent}
            devInertiaEnabled={devInertiaEnabled}
            keyframeDurationMs={keyframeDurationMs}
            onCaptureCameraKeyframe={handleCaptureCameraKeyframe}
            onCameraPreview={handleCameraPreview}
            onCameraZoomChange={handleCameraZoomChange}
            onCopyCameraKeyframes={handleCopyCameraKeyframes}
            onDevInertiaChange={handleDevInertiaToggle}
            onEnterPreview={() => setDevToolsVisible(false)}
            onKeyframeDurationChange={handleKeyframeDurationChange}
            onRemoveCameraKeyframe={handleRemoveCameraKeyframe}
            onSetInitialCamera={handleSetInitialCamera}
            onTransitionDurationChange={handleTransitionDurationChange}
          />
        ) : (
          <button
            type="button"
            onClick={() => setDevToolsVisible(true)}
            className="absolute bottom-3 right-3 z-20 rounded-md bg-slate-950/85 px-3 py-2 text-xs font-semibold text-white shadow-lg hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Show camera tools
          </button>
        ))}

      <model-viewer
        ref={viewerRef}
        src={MODEL_SRC}
        alt="3D model of the College of Engineering building"
        camera-controls={cameraControlsEnabled ? '' : undefined}
        interaction-prompt="none"
        shadow-intensity="0.8"
        exposure="1.1"
        environment-image="neutral"
        camera-orbit={`${CAMERA_INTRO_KEYFRAMES[0].orbit[0]}rad ${CAMERA_INTRO_KEYFRAMES[0].orbit[1]}rad ${CAMERA_INTRO_KEYFRAMES[0].orbit[2]}m`}
        camera-target={`${CAMERA_INTRO_KEYFRAMES[0].target[0]}m ${CAMERA_INTRO_KEYFRAMES[0].target[1]}m ${CAMERA_INTRO_KEYFRAMES[0].target[2]}m`}
        field-of-view={DEFAULT_CAMERA_FIELD_OF_VIEW}
        min-camera-orbit={
          import.meta.env.DEV
            ? `auto auto ${getCameraRadiusForZoom(cameraZoomBaseRadiusM, 50)}m`
            : 'auto auto 50%'
        }
        max-camera-orbit={
          import.meta.env.DEV
            ? `auto auto ${getCameraRadiusForZoom(cameraZoomBaseRadiusM, 200)}m`
            : 'auto auto 200%'
        }
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
