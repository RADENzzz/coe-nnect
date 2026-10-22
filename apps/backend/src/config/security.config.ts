import { timingSafeEqual } from 'node:crypto';

type Env = NodeJS.ProcessEnv;

function splitOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function normalizeOrigin(origin: string): string | null {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

/**
 * Cloudflare quick tunnels hand out a random hostname on every run
 * (https://<random-words>.trycloudflare.com), so a fixed allowlist cannot
 * work. These are enabled automatically outside production — `pnpm dev` then
 * `pnpm online` works without restarting the backend — and by
 * CORS_ALLOW_TUNNEL=true when a deployed instance needs them (demos only).
 */
const TUNNEL_ORIGIN_PATTERNS = ['https://*.trycloudflare.com'];

/**
 * Compare a browser origin against one allowlist entry.
 *
 * Entries are either an exact origin ("https://coe.example.edu") or a
 * subdomain wildcard ("https://*.trycloudflare.com"). The wildcard must be
 * the leading "*." label of the hostname and the scheme must match, so
 * "https://*.example.com" accepts "https://a.example.com" but not
 * "http://a.example.com", "https://example.com", or "https://a.example.com.evil".
 */
export function matchesOriginPattern(pattern: string, origin: string): boolean {
  const normalizedPattern = normalizeOrigin(pattern) ?? pattern;
  if (!normalizedPattern.includes('*')) return normalizedPattern === origin;

  const parsed = /^(https?:\/\/)\*\.([^/:*]+)$/i.exec(normalizedPattern);
  if (!parsed) return false;

  const [, scheme, wildcardHost] = parsed;
  if (!origin.startsWith(scheme)) return false;

  const host = origin.slice(scheme.length);
  return (
    host.length > wildcardHost.length + 1 && host.endsWith(`.${wildcardHost}`)
  );
}

/**
 * Production uses an explicit allowlist only. Development and test keep a
 * loopback convenience rule so a local Vite server on any port still works.
 */
export function isCorsOriginAllowed(
  origin: string | undefined,
  env: Env = process.env,
): boolean {
  // Non-browser callers (curl, server-to-server, health checks) have no
  // Origin header. CORS does not apply to them.
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  const allowTunnelOrigins =
    env.CORS_ALLOW_TUNNEL === 'true' || env.NODE_ENV !== 'production';

  const allowed = [
    ...splitOrigins(env.FRONTEND_URL),
    ...splitOrigins(env.CORS_ALLOWED_ORIGINS),
    ...(allowTunnelOrigins ? TUNNEL_ORIGIN_PATTERNS : []),
  ];

  if (allowed.some((pattern) => matchesOriginPattern(pattern, normalized))) {
    return true;
  }

  if (env.NODE_ENV === 'production') return false;

  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(
    normalized,
  );
}

export function buildCorsOptions(env: Env = process.env) {
  return {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Reject without throwing: the browser blocks the response, while the
      // API still returns a normal response to non-browser clients.
      callback(null, isCorsOriginAllowed(origin, env));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 86400,
  };
}

/**
 * Swagger is available in development/test. In production it must be
 * explicitly enabled and protected with basic-auth credentials.
 */
export function isSwaggerEnabled(env: Env = process.env): boolean {
  if (env.NODE_ENV !== 'production') return true;
  return (
    env.ENABLE_SWAGGER === 'true' &&
    Boolean(env.SWAGGER_USER?.trim()) &&
    Boolean(env.SWAGGER_PASSWORD)
  );
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isBasicAuthHeaderValid(
  header: string | undefined,
  expectedUser: string | undefined,
  expectedPassword: string | undefined,
): boolean {
  if (!expectedUser || !expectedPassword) return false;
  if (!header) return false;

  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return false;
  }

  const separator = decoded.indexOf(':');
  if (separator < 0) return false;

  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  return safeEqual(user, expectedUser) && safeEqual(password, expectedPassword);
}

export function createSwaggerAuthMiddleware(env: Env = process.env) {
  return (req: any, res: any, next: () => void) => {
    const valid = isBasicAuthHeaderValid(
      req.headers?.authorization,
      env.SWAGGER_USER,
      env.SWAGGER_PASSWORD,
    );

    if (valid) return next();

    res.setHeader(
      'WWW-Authenticate',
      'Basic realm="CoE-NNECT API documentation"',
    );
    res.status(401).send('Authentication required.');
  };
}

/**
 * Content-Security-Policy for the backend surface. The API only serves JSON,
 * while Swagger UI needs inline styles/scripts. `unsafe-inline` is therefore
 * scoped to deployments where Swagger is actually mounted.
 */
export function buildHelmetOptions(env: Env = process.env) {
  const swagger = isSwaggerEnabled(env);
  const isProduction = env.NODE_ENV === 'production';

  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", ...(swagger ? ["'unsafe-inline'"] : [])],
        styleSrc: ["'self'", ...(swagger ? ["'unsafe-inline'"] : [])],
        connectSrc: ["'self'"],
        ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' as const },
    crossOriginResourcePolicy: { policy: 'cross-origin' as const },
    referrerPolicy: { policy: 'no-referrer' as const },
    hsts: isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false,
  };
}
