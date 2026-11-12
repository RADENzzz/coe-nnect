import type React from 'react';
import type { CapWidget } from 'cap-widget';

/**
 * React 18 does not forward custom-element events from JSX props. LoginPage
 * attaches `solve`/`error`/`reset` listeners through a ref instead, but JSX
 * still needs to know that `<cap-widget>` is a valid intrinsic element.
 */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'cap-widget': React.DetailedHTMLProps<
        React.HTMLAttributes<CapWidget>,
        CapWidget
      > & {
        'data-cap-api-endpoint'?: string;
        'data-cap-hidden-field-name'?: string;
        'data-cap-i18n-initial-state'?: string;
        'data-cap-i18n-verifying-label'?: string;
        'data-cap-i18n-solved-label'?: string;
        'data-cap-i18n-error-label'?: string;
        required?: boolean;
      };
    }
  }
}

export {};
