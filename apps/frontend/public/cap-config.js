/**
 * Cap widget asset overrides.
 *
 * The widget fetches its WASM solver and the pako fallback from jsDelivr by
 * default. Serving them from our own origin keeps the production CSP free of
 * third-party script/connect sources and avoids a hard dependency on a CDN.
 *
 * Loaded synchronously before theme-boot.js and the app bundle. The widget
 * reads these globals lazily, so setting them here is early enough even though
 * cap-widget itself is imported by the React bundle.
 */
window.CAP_CUSTOM_WASM_URL = '/cap/cap_wasm_bg.wasm';
window.CAP_CUSTOM_HASHWX_URL = '/cap/hashwx.wasm';
window.CAP_PAKO_URL = '/cap/pako_inflate.min.js';
