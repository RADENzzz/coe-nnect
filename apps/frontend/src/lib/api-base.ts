/**
 * Resolve where the API and Socket.IO live for the current page.
 *
 * `VITE_API_BASE_URL` is normally absolute (`http://localhost:3000/api`) or a
 * same-origin path (`/api`). Two cases need care:
 *
 * - The app is opened from another machine, the LAN, or a Cloudflare tunnel,
 *   while the configured URL still points at *that viewer's* `localhost` —
 *   those requests can never reach this machine.
 * - A Railway frontend was built with an absolute `*.up.railway.app` backend
 *   URL. Browsers cannot reach Railway's private network, and the production
 *   CSP only allows same-origin `connect-src`, so that URL can never work.
 *
 * In both cases we fall back to the same-origin `/api` path, which the Vite
 * dev/preview server and `server.mjs` proxy to the backend.
 */
const DEFAULT_API_BASE_URL = 'http://localhost:3000/api';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const RAILWAY_HOST_SUFFIX = '.up.railway.app';

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname) || hostname.endsWith('.localhost');
}

function isRailwayHost(hostname: string): boolean {
  return hostname === 'up.railway.app' || hostname.endsWith(RAILWAY_HOST_SUFFIX);
}

function configuredBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return value?.trim() || DEFAULT_API_BASE_URL;
}

export function resolveApiBaseUrl(): string {
  const configured = configuredBaseUrl();
  if (!ABSOLUTE_URL_RE.test(configured)) return configured;

  try {
    const url = new URL(configured);
    const apiHost = url.hostname;
    const pageHost = window.location.hostname;
    if (isLoopbackHost(apiHost) && !isLoopbackHost(pageHost)) {
      return '/api';
    }
    // Only when the page is not itself running on localhost: a developer may
    // legitimately point a local dev server at the deployed backend.
    if (
      isRailwayHost(apiHost) &&
      !isLoopbackHost(pageHost) &&
      url.origin !== window.location.origin
    ) {
      return '/api';
    }
  } catch {
    // Malformed value: hand it to axios unchanged and let it surface.
  }

  return configured;
}

/**
 * Origin (scheme + host, no path) for Socket.IO. Relative bases resolve to the
 * page's own origin, which keeps socket traffic on the same tunnel host.
 */
export function resolveSocketOrigin(): string {
  try {
    return new URL(resolveApiBaseUrl(), window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}
