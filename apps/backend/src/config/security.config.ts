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

  const allowed = [
    ...splitOrigins(env.FRONTEND_URL),
    ...splitOrigins(env.CORS_ALLOWED_ORIGINS),
  ];

  if (allowed.includes(normalized)) return true;

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
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
    ],
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
