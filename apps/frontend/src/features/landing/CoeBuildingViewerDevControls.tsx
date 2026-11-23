import type { CameraKeyframeEditorItem } from './camera-orbit-capture';

type Props = {
  cameraAnimationPlaying: boolean;
  cameraControlsEnabled: boolean;
  cameraKeyframeSource: string;
  cameraKeyframeStatus: string;
  cameraKeyframes: readonly CameraKeyframeEditorItem[];
  cameraZoomPercent: number;
  devInertiaEnabled: boolean;
  keyframeDurationMs: number;
  onCaptureCameraKeyframe: () => void;
  onCameraPreview: () => void;
  onCameraZoomChange: (zoomPercent: number) => void;
  onCopyCameraKeyframes: () => void;
  onDevInertiaChange: (enabled: boolean) => void;
  onEnterPreview: () => void;
  onKeyframeDurationChange: (durationMs: number) => void;
  onRemoveCameraKeyframe: (index: number) => void;
  onSetInitialCamera: () => void;
  onTransitionDurationChange: (index: number, durationMs: number) => void;
};

export default function CoeBuildingViewerDevControls({
  cameraAnimationPlaying,
  cameraControlsEnabled,
  cameraKeyframeSource,
  cameraKeyframeStatus,
  cameraKeyframes,
  cameraZoomPercent,
  devInertiaEnabled,
  keyframeDurationMs,
  onCaptureCameraKeyframe,
  onCameraPreview,
  onCameraZoomChange,
  onCopyCameraKeyframes,
  onDevInertiaChange,
  onEnterPreview,
  onKeyframeDurationChange,
  onRemoveCameraKeyframe,
  onSetInitialCamera,
  onTransitionDurationChange,
}: Props) {
  return (
    <div className="absolute bottom-3 right-3 z-20 max-h-[60%] max-w-[90%] overflow-y-auto rounded-lg bg-slate-950/90 p-3 text-xs text-white shadow-lg">
      <label className="inline-flex cursor-pointer items-center gap-2 font-medium">
        <input
          type="checkbox"
          role="switch"
          aria-label="Enable camera inertia"
          checked={devInertiaEnabled}
          onChange={(event) => onDevInertiaChange(event.currentTarget.checked)}
          className="peer sr-only"
        />
        <span className="relative h-5 w-9 rounded-full bg-white/25 transition-colors peer-checked:bg-emerald-500 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white" />
        <span>Inertia {devInertiaEnabled ? 'on' : 'off'}</span>
      </label>

      <div className="mt-3 space-y-2 border-t border-white/15 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">Camera animation keys</p>
          <button
            type="button"
            onClick={onEnterPreview}
            className="shrink-0 rounded-md border border-white/25 px-2 py-1 font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Preview page
          </button>
        </div>
        <p className="text-white/70">
          Orbit is [theta rad, phi rad, distance m]; target is [x, y, z] m.
          Each key's duration is the transition into it.
        </p>
        <label className="grid gap-1">
          <span className="flex justify-between">
            <span>Zoom</span>
            <output>{cameraZoomPercent}%</output>
          </span>
          <input
            type="range"
            aria-label="Camera zoom"
            min="50"
            max="200"
            step="1"
            value={cameraZoomPercent}
            disabled={!cameraControlsEnabled || cameraAnimationPlaying}
            onChange={(event) =>
              onCameraZoomChange(Number(event.currentTarget.value))
            }
            className="w-full accent-emerald-400 disabled:opacity-50"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={onSetInitialCamera}
            disabled={!cameraControlsEnabled || cameraAnimationPlaying}
            className="rounded-md border border-white/25 px-3 py-1.5 font-semibold hover:bg-white/10 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Use current view as initial
          </button>
          <label className="grid gap-1">
            <span>Transition into new key (ms)</span>
            <input
              type="number"
              min="0"
              step="100"
              value={keyframeDurationMs}
              onChange={(event) => {
                const rawValue = event.currentTarget.value;
                if (!rawValue.trim()) return;
                const value = Number(rawValue);
                if (Number.isFinite(value) && value >= 0) {
                  onKeyframeDurationChange(value);
                }
              }}
              className="w-28 rounded bg-white/10 px-2 py-1 text-white"
            />
          </label>
          <button
            type="button"
            onClick={onCaptureCameraKeyframe}
            disabled={cameraAnimationPlaying}
            className="rounded-md bg-white px-3 py-1.5 font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-50"
          >
            Add current camera key
          </button>
          <button
            type="button"
            onClick={onCameraPreview}
            className="rounded-md border border-white/25 px-3 py-1.5 font-semibold hover:bg-white/10"
          >
            {cameraAnimationPlaying ? 'Stop preview' : 'Preview keyframes'}
          </button>
          <button
            type="button"
            onClick={onCopyCameraKeyframes}
            className="rounded-md border border-white/25 px-3 py-1.5 font-semibold hover:bg-white/10"
          >
            Copy keyframes to code
          </button>
        </div>
        <ol className="space-y-1">
          {cameraKeyframes.map((keyframe, index) => (
            <li
              key={keyframe.editorId}
              className="flex flex-wrap items-center gap-2 rounded bg-white/5 px-2 py-1"
            >
              <span className="font-medium">Key {index + 1}</span>
              {index > 0 && (
                <label className="flex items-center gap-1">
                  <span>Transition (ms)</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={keyframe.durationMs}
                    onChange={(event) => {
                      const rawValue = event.currentTarget.value;
                      if (!rawValue.trim()) return;
                      const value = Number(rawValue);
                      if (Number.isFinite(value) && value >= 0) {
                        onTransitionDurationChange(index, value);
                      }
                    }}
                    className="w-24 rounded bg-white/10 px-2 py-1 text-white"
                  />
                </label>
              )}
              <button
                type="button"
                onClick={() => onRemoveCameraKeyframe(index)}
                disabled={cameraKeyframes.length === 1}
                className="ml-auto rounded px-2 py-1 text-white/75 hover:bg-white/10 disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
        {cameraKeyframeStatus && (
          <p aria-live="polite">{cameraKeyframeStatus}</p>
        )}
        {cameraKeyframeSource && (
          <textarea
            aria-label="Camera keyframe source code"
            readOnly
            rows={Math.min(8, cameraKeyframes.length * 7 + 2)}
            value={cameraKeyframeSource}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded bg-white/10 p-2 font-mono text-[10px] text-white"
          />
        )}
      </div>
    </div>
  );
}
