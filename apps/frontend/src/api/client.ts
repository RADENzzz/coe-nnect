import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { supabase } from '../lib/supabase';

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

/**
 * Long-running endpoints that need > the default 30s window.
 * Matched against `config.url` (path + query).
 */
const LONG_ENDPOINT_TIMEOUTS: Array<[RegExp, number]> = [
  [/\/solve(\?|$)/, 150_000], // backend allows 120s + network overhead
  [/\/extract(\?|$)/, 120_000],
  [/\/prospectus\/.*\/info(\?|$)/, 90_000],
];

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

/** Endpoints safe to retry after a transient failure. */
const IDEMPOTENT_POST = [/\/solve(\?|$)/, /\/login(\?|$)/];

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

function timeoutFor(url: string | undefined): number {
  if (!url) return DEFAULT_TIMEOUT_MS;
  for (const [re, ms] of LONG_ENDPOINT_TIMEOUTS) {
    if (re.test(url)) return ms;
  }
  return DEFAULT_TIMEOUT_MS;
}

function isRetryable(
  error: AxiosError,
  method: string,
  url: string,
): boolean {
  const status = error.response?.status;
  const transient =
    !error.response ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    error.code === 'ECONNRESET' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ERR_NETWORK';

  if (!transient) return false;

  // GETs are always idempotent
  if (method === 'get') return true;

  // POSTs only if explicitly whitelisted
  if (method === 'post') {
    return IDEMPOTENT_POST.some((re) => re.test(url));
  }

  return false;
}

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request: attach Supabase JWT ──
api.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// ── Request: apply per-endpoint timeout ──
api.interceptors.request.use((config) => {
  // Only override if the caller didn't set an explicit timeout
  if (config.timeout === DEFAULT_TIMEOUT_MS || !config.timeout) {
    config.timeout = timeoutFor(config.url);
  }
  return config;
});

// ── Response: cold-start retry + auth handling ──
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const cfg = error.config as RetryableConfig | undefined;
    const method = (cfg?.method ?? 'get').toLowerCase();
    const url = cfg?.url ?? '';

    // ── Cold-start / transient retry with exponential backoff ──
    if (cfg && isRetryable(error, method, url)) {
      const attempt = (cfg._retryCount ?? 0) + 1;

      if (attempt <= MAX_RETRIES) {
        cfg._retryCount = attempt;

        // 3s → 6s → 12s
        const delay = 3000 * Math.pow(2, attempt - 1);

        console.warn(
          `[api] ${method.toUpperCase()} ${url} failed ` +
            `(${status ?? error.code ?? 'network'}). ` +
            `Retry ${attempt}/${MAX_RETRIES} in ${delay}ms`,
        );

        // Let the UI know on the first retry only
        if (attempt === 1) {
          window.dispatchEvent(
            new CustomEvent('api:cold-start', { detail: { url, method } }),
          );
        }

        await new Promise((r) => setTimeout(r, delay));

        // Reset the per-attempt timeout so it doesn't stack across retries
        const retryCfg = { ...cfg } as RetryableConfig;
        retryCfg.timeout = timeoutFor(url);

        return api(retryCfg);
      }
    }

    // ── 401 → sign out & redirect to login ──
    if (status === 401) {
      await supabase.auth.signOut();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);