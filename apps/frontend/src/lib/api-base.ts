/**
 * Resolve where the API and Socket.IO live for the current page.
 *
 * `VITE_API_BASE_URL` is normally absolute (`http://localhost:3000/api`) or a
 * same-origin path (`/api`). One case needs care: the app opened from another
 * machine, the LAN, or a Cloudflare tunnel, while the configured URL still
 * points at *that viewer's* `localhost` — those requests can never reach this
 * machine. When that happens we fall back to the same-origin `/api` path,
 * which the Vite dev/preview server proxies to the backend.
 */
const DEFAULT_API_BASE_URL = 'http://localhost:3000/api';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname) || hostname.endsWith('.localhost');
}

function configuredBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return value?.trim() || DEFAULT_API_BASE_URL;
}

export function resolveApiBaseUrl(): string {
  const configured = configuredBaseUrl();
  if (!ABSOLUTE_URL_RE.test(configured)) return configured;

  try {
    const apiHost = new URL(configured).hostname;
    const pageHost = window.location.hostname;
    if (isLoopbackHost(apiHost) && !isLoopbackHost(pageHost)) {
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
