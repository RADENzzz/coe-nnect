/**
 * Pre-paint theme bootstrap.
 *
 * Loaded synchronously from <head> so the saved theme, accent palette, and
 * glass flag are applied before React mounts. Kept as a separate file (rather
 * than inline <script> blocks) so the production Content-Security-Policy can
 * use `script-src 'self'` without `'unsafe-inline'`.
 */
(function () {
  try {
    var stored = localStorage.getItem('coe-nnect:theme');
    var dark = stored === 'dark';
    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    var scheme = document.querySelector('meta[name="color-scheme"]');
    if (scheme) scheme.setAttribute('content', dark ? 'dark' : 'light');
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor)
      themeColor.setAttribute('content', dark ? '#0a0a0a' : '#5c1219');
  } catch {
    /* Ignore unavailable storage; fall back to light. */
  }

  try {
    var css = localStorage.getItem('coe-nnect:appearance-css:v2');
    if (css) {
      var style = document.createElement('style');
      style.id = 'coe-appearance';
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }
  } catch {
    /* Ignore unavailable storage. */
  }

  try {
    var raw = localStorage.getItem('coe-nnect:appearance');
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.glass === true) {
        document.documentElement.classList.add('glass');
      }
    }
  } catch {
    /* Ignore unavailable storage or malformed JSON. */
  }
})();
