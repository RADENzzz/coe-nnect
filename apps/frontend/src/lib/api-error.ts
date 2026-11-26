interface ApiErrorData {
  message?: string | string[];
  error?: string;
}

interface ApiErrorShape {
  code?: string;
  message?: string;
  response?: {
    status?: number;
    data?: ApiErrorData | null;
  } | null;
}

const STATUS_FALLBACKS: Readonly<Record<number, string>> = {
  400: 'Invalid request.',
  403: 'You do not have permission to do that.',
  404: 'The requested item was not found.',
  409: 'This conflicts with an existing record.',
  422: 'Please check the entered values.',
  500: 'Something went wrong on the server.',
  503: 'The service is temporarily unavailable.',
};

const NETWORK_FALLBACK = 'Could not reach the server.';

function firstUsableMessage(value: string | string[] | undefined | null): string | null {
  if (Array.isArray(value)) {
    const messages = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);
    return messages.length > 0 ? messages.join(', ') : null;
  }
  if (typeof value === 'string') {
    const message = value.trim();
    return message.length > 0 ? message : null;
  }
  return null;
}

/**
 * Reduce an Axios-shaped error (or any unknown failure) to user-facing text.
 *
 * Order: response message (string or array) → response error string →
 * status-based fallback → network fallback → caller fallback. Empty or
 * whitespace-only response messages are ignored.
 */
export function extractApiError(error: unknown, fallback: string): string {
  const err = (error ?? {}) as ApiErrorShape;
  const data = err.response?.data ?? null;

  const message = firstUsableMessage(data?.message);
  if (message !== null) return message;

  const apiError = firstUsableMessage(data?.error);
  if (apiError !== null) return apiError;

  const status = err.response?.status;
  const statusFallback = status === undefined ? undefined : STATUS_FALLBACKS[status];
  if (statusFallback !== undefined) return statusFallback;

  const isNetworkError =
    err.code === 'ERR_NETWORK' || String(err.message ?? '').trim().toLowerCase() === 'network error';
  if (isNetworkError) return NETWORK_FALLBACK;

  return fallback;
}
