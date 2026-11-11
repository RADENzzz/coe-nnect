import {
  isSupabaseAuthOutage,
  SupabaseService,
  VerifyAccessTokenResult,
} from '../src/database/supabase.service';

/** A syntactically valid JWT-shaped token with a known expiry. */
function makeToken(expiresInMs = 60 * 60 * 1000): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor((Date.now() + expiresInMs) / 1000) }),
  ).toString('base64url');
  return `header.${payload}.signature`;
}

function createService(getUser: jest.Mock): SupabaseService {
  const service = new SupabaseService({ get: jest.fn() } as any);
  // Skip onModuleInit: tests inject the auth client directly so no network
  // client or real Supabase config is needed.
  (service as any).anonClient = { auth: { getUser } };
  return service;
}

describe('isSupabaseAuthOutage', () => {
  it('treats retryable fetch errors as an outage', () => {
    expect(
      isSupabaseAuthOutage({ name: 'AuthRetryableFetchError', status: 0 }),
    ).toBe(true);
  });

  it('treats 5xx responses as an outage', () => {
    expect(isSupabaseAuthOutage({ status: 503 })).toBe(true);
  });

  it('treats rate limiting and request timeouts as an outage', () => {
    expect(isSupabaseAuthOutage({ status: 429 })).toBe(true);
    expect(isSupabaseAuthOutage({ status: 408 })).toBe(true);
  });

  it('treats network error messages as an outage', () => {
    expect(isSupabaseAuthOutage({ message: 'fetch failed' })).toBe(true);
    expect(isSupabaseAuthOutage({ message: 'connect ECONNREFUSED' })).toBe(
      true,
    );
    expect(
      isSupabaseAuthOutage({ message: 'getaddrinfo EAI_AGAIN supabase.co' }),
    ).toBe(true);
  });

  it('does not treat a rejected token as an outage', () => {
    expect(
      isSupabaseAuthOutage({
        status: 401,
        message: 'invalid JWT: unable to parse or verify signature',
      }),
    ).toBe(false);
    expect(
      isSupabaseAuthOutage({ message: 'Invalid login credentials' }),
    ).toBe(false);
  });

  it('does not treat a missing error as an outage', () => {
    expect(isSupabaseAuthOutage(null)).toBe(false);
    expect(isSupabaseAuthOutage(undefined)).toBe(false);
  });
});

describe('SupabaseService.verifyAccessToken', () => {
  it('returns invalid when Supabase rejects the token', async () => {
    const getUser = jest.fn().mockResolvedValue({
      data: { user: null },
      error: { status: 401, message: 'invalid JWT' },
    });
    const service = createService(getUser);

    await expect(service.verifyAccessToken(makeToken())).resolves.toEqual({
      status: 'invalid',
      message: 'invalid JWT',
    });
  });

  it('returns unavailable when the provider cannot be reached', async () => {
    const getUser = jest.fn().mockResolvedValue({
      data: { user: null },
      error: {
        name: 'AuthRetryableFetchError',
        status: 0,
        message: 'fetch failed',
      },
    });
    const service = createService(getUser);

    const result = await service.verifyAccessToken(makeToken());
    expect(result.status).toBe('unavailable');
  });

  it('returns unavailable when getUser throws a network error', async () => {
    const getUser = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    const service = createService(getUser);

    const result = await service.verifyAccessToken(makeToken());
    expect(result.status).toBe('unavailable');
  });

  it('returns the user for a valid token', async () => {
    const user = { id: 'user-1', email: 'head@wmsu.edu.ph' };
    const getUser = jest.fn().mockResolvedValue({
      data: { user },
      error: null,
    });
    const service = createService(getUser);

    await expect(service.verifyAccessToken(makeToken())).resolves.toEqual({
      status: 'valid',
      user,
    });
  });

  it('caches a verified token for repeat requests', async () => {
    const user = { id: 'user-1' };
    const getUser = jest.fn().mockResolvedValue({
      data: { user },
      error: null,
    });
    const service = createService(getUser);
    const token = makeToken();

    await service.verifyAccessToken(token);
    await service.verifyAccessToken(token);
    await service.verifyAccessToken(token);

    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('does not cache a token that is about to expire', async () => {
    const user = { id: 'user-1' };
    const getUser = jest.fn().mockResolvedValue({
      data: { user },
      error: null,
    });
    const service = createService(getUser);
    // Less than the 30s safety margin left: caching it would be pointless.
    const token = makeToken(10_000);

    await service.verifyAccessToken(token);
    await service.verifyAccessToken(token);

    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('collapses concurrent verifications of the same token', async () => {
    let resolveUser!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveUser = resolve;
    });
    const getUser = jest.fn().mockReturnValue(pending);
    const service = createService(getUser);
    const token = makeToken();

    const first = service.verifyAccessToken(token);
    const second = service.verifyAccessToken(token);

    resolveUser({ data: { user: { id: 'user-1' } }, error: null });

    const results: VerifyAccessTokenResult[] = await Promise.all([
      first,
      second,
    ]);

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.status)).toEqual(['valid', 'valid']);
  });

  it('retries after a failed verification instead of caching the failure', async () => {
    const getUser = jest
      .fn()
      .mockResolvedValueOnce({
        data: { user: null },
        error: {
          name: 'AuthRetryableFetchError',
          status: 0,
          message: 'fetch failed',
        },
      })
      .mockResolvedValueOnce({
        data: { user: { id: 'user-1' } },
        error: null,
      });
    const service = createService(getUser);
    const token = makeToken();

    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({
      status: 'unavailable',
    });
    await expect(service.verifyAccessToken(token)).resolves.toMatchObject({
      status: 'valid',
    });
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});
