/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_VERSION: string;
  /** Optional public link to the IDP faculty application. */
  readonly VITE_IDP_APP_URL?: string;
  /** Optional display name for the IDP app promo. */
  readonly VITE_IDP_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}