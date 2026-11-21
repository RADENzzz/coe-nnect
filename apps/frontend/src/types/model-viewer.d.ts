import type React from 'react';
import type { ModelViewerElement } from '@google/model-viewer';

/**
 * `<model-viewer>` is a custom element. React 18 does not forward its custom
 * events from JSX props, so the component attaches `load`/`error` listeners
 * through a ref. This declaration only makes the tag and its attributes
 * type-safe in JSX.
 */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<ModelViewerElement>,
        ModelViewerElement
      > & {
        src?: string;
        alt?: string;
        'camera-controls'?: string | boolean;
        'auto-rotate'?: string | boolean;
        'auto-rotate-delay'?: string | number;
        'rotation-per-second'?: string;
        'interaction-prompt'?: string;
        'shadow-intensity'?: string | number;
        exposure?: string | number;
        'environment-image'?: string;
        'camera-target'?: string;
        'camera-orbit'?: string;
        'field-of-view'?: string;
        'min-camera-orbit'?: string;
        'max-camera-orbit'?: string;
        loading?: string;
        reveal?: string;
      };
    }
  }
}

export {};
