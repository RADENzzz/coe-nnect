# Cap solver assets

These files are self-hosted so the production CSP does not need to allow a
third-party CDN. `public/cap-config.js` points the widget at them before the
React bundle loads.

| File                   | Source                              | License         |
| ---------------------- | ----------------------------------- | --------------- |
| `cap_wasm_bg.wasm`     | `@cap.js/wasm@0.0.8`                | Apache-2.0      |
| `hashwx.wasm`          | `@cap.js/wasm@0.0.8`                | Apache-2.0      |
| `pako_inflate.min.js`  | `pako@2.1.0` (`pako_inflate.min.js`) | MIT AND Zlib    |

The versions must match `cap-widget`'s `WASM_VERSION` and the pako version its
fallback expects. When upgrading `cap-widget`, re-download the matching files
from jsDelivr:

```text
https://cdn.jsdelivr.net/npm/@cap.js/wasm@<version>/browser/cap_wasm_bg.wasm
https://cdn.jsdelivr.net/npm/@cap.js/wasm@<version>/browser/hashwx.wasm
https://cdn.jsdelivr.net/npm/pako@<version>/dist/pako_inflate.min.js
```
