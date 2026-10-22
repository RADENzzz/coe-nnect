import axios, {
  AxiosError,
  AxiosHeaders,
  InternalAxiosRequestConfig,
} from 'axios';
import { supabase } from '../lib/supabase';
import { resolveApiBaseUrl } from '../lib/api-base';

// Absolute (http://localhost:3000/api) or same-origin (/api). See api-base.ts
// for the tunnel/LAN fallback to the Vite proxy.
const BASE_URL = resolveApiBaseUrl();

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

const LONG_ENDPOINT_TIMEOUTS: Array<[RegExp, number]> = [
  [/\/solve(\?|$)/, 150_000],
  [/\/extract(\?|$)/, 120_000],
  [/\/prospectus\/.*\/info(\?|$)/, 90_000],
];

const RETRYABLE_POST = [/\/solve(\?|$)/, /\/login(\?|$)/];

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
  _timeoutApplied?: boolean;
}

function timeoutFor(url: string | undefined): number {
  if (!url) return DEFAULT_TIMEOUT_MS;
  for (const [re, ms] of LONG_ENDPOINT_TIMEOUTS) {
    if (re.test(url)) return ms;
  }
  return DEFAULT_TIMEOUT_MS;
}

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: auth + per-endpoint timeout ──
api.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }

  const c = config as RetryableConfig;
  if (!c._timeoutApplied) {
    if (c.timeout == null || c.timeout === DEFAULT_TIMEOUT_MS) {
      c.timeout = timeoutFor(c.url);
    }
    c._timeoutApplied = true;
  }

  return config;
});

// ── Response interceptor: cold-start retry + 401 handling ──
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const cfg = error.config as RetryableConfig | undefined;
    const status = error.response?.status;
    const method = (cfg?.method ?? 'get').toLowerCase();
    const url = cfg?.url ?? '';

    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    if (cfg) {
      const hasResponse = !!error.response;
      const is5xx = status === 502 || status === 503 || status === 504;
      const isNetwork = !hasResponse || error.code === 'ERR_NETWORK';
      const isConnKill =
        error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';

      const transient = is5xx || isConnKill || (isNetwork && method === 'get');

      const postAllowed =
        method === 'post' && RETRYABLE_POST.some((re) => re.test(url));

      const retryable = transient && (method === 'get' || postAllowed);

      const attempt = (cfg._retryCount ?? 0) + 1;

      if (retryable && attempt <= MAX_RETRIES) {
        const delay = 3000 * Math.pow(2, attempt - 1);

        console.warn(
          `[api] ${method.toUpperCase()} ${url} failed ` +
            `(${status ?? error.code ?? 'network'}). ` +
            `Retry ${attempt}/${MAX_RETRIES} in ${delay}ms`,
        );

        if (attempt === 1) {
          window.dispatchEvent(
            new CustomEvent('api:cold-start', { detail: { url, method } }),
          );
        }

        await new Promise((r) => setTimeout(r, delay));

        // Build a real AxiosHeaders instance (not a plain object spread)
        // so we don't lose the AxiosHeaders prototype/methods.
        const freshHeaders = AxiosHeaders.from(cfg.headers);
        freshHeaders.delete('Authorization'); // interceptor re-adds if session exists

        const retryCfg: RetryableConfig = {
          ...cfg,
          _retryCount: attempt,
          _timeoutApplied: false,
          headers: freshHeaders,
        };

        return api(retryCfg);
      }
    }

    if (status === 401) {
      await supabase.auth.signOut();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);
