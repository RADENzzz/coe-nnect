import { rateLimit } from 'express-rate-limit';

type Env = NodeJS.ProcessEnv;

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const RATE_LIMIT_MESSAGE = {
  statusCode: 429,
  message: 'Too many requests. Please try again later.',
};

/**
 * Broad protection for every HTTP route. Login has a second, stricter bucket
 * mounted at the route path in main.ts.
 */
export function createGlobalRateLimiter(env: Env = process.env) {
  return rateLimit({
    windowMs: positiveNumber(env.THROTTLE_TTL_MS, 60_000),
    limit: positiveNumber(env.THROTTLE_LIMIT, 300),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    message: RATE_LIMIT_MESSAGE,
    // The app sets Express `trust proxy` explicitly in main.ts when deployed
    // behind Vercel/nginx. The header heuristic would otherwise warn on
    // every proxied request.
    validate: { xForwardedForHeader: false },
  });
}

export function createLoginRateLimiter(env: Env = process.env) {
  return rateLimit({
    windowMs: 60_000,
    limit: positiveNumber(env.LOGIN_THROTTLE_LIMIT, 10),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    message: RATE_LIMIT_MESSAGE,
    validate: { xForwardedForHeader: false },
  });
}
