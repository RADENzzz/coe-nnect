import '@google/model-viewer';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ModelViewerElement } from '@google/model-viewer';

const MODEL_SRC = '/3D_Models/coe_Building.glb';

/**
 * Interactive 3D preview of the COE building. The viewer reads the GLB at
 * runtime, so replacing `public/3D_Models/coe_Building.glb` with the finished
 * model updates this card with no code changes.
 */
export default function CoeBuildingViewer() {
  const viewerRef = useRef<ModelViewerElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const handleLoad = () => setLoaded(true);
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

      <model-viewer
        ref={viewerRef}
        src={MODEL_SRC}
        alt="3D model of the College of Engineering building"
        camera-controls=""
        interaction-prompt="none"
        shadow-intensity="0.8"
        exposure="1.1"
        environment-image="neutral"
        camera-orbit="30deg 72deg 70%"
        min-camera-orbit="auto auto 50%"
        max-camera-orbit="auto auto 90%"
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
