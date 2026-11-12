import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CapService,
  deriveCapTokenKey,
} from '../src/modules/auth/cap.service';

const TOKEN_ID = 'a1b2c3d4e5f60718';
const TOKEN_SECRET = '0123456789abcdef0123456789abcdef';

function tokenKeyFor(secret: string): string {
  return `${TOKEN_ID}:${createHash('sha256').update(secret).digest('hex')}`;
}

function createService(query = jest.fn()) {
  const config = {
    get: jest.fn((key: string) =>
      key === 'CAP_SECRET' ? 'test-cap-secret-0123456789' : undefined,
    ),
  };
  const service = new CapService(config as any, { query } as any);
  service.onModuleInit();
  return { service, query };
}

describe('deriveCapTokenKey', () => {
  it('derives the same lookup key that Cap stores', () => {
    expect(deriveCapTokenKey(`${TOKEN_ID}:${TOKEN_SECRET}`)).toBe(
      tokenKeyFor(TOKEN_SECRET),
    );
  });

  it.each([
    '',
    'missing-separator',
    ':secret-only',
    'id-only:',
    'not-hex-id:secret',
    `${TOKEN_ID}:not-hex-secret`,
  ])('rejects malformed token %p', (token) => {
    expect(deriveCapTokenKey(token)).toBeNull();
  });
});

describe('CapService.consumeLoginToken', () => {
  it('consumes a live token returned by a DELETE as [rows, affected]', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const { service, query } = createService(
      jest.fn().mockResolvedValue([[{ expires_at: expiresAt }], 1]),
    );

    await expect(
      service.consumeLoginToken(`${TOKEN_ID}:${TOKEN_SECRET}`),
    ).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM public.cap_token'),
      [tokenKeyFor(TOKEN_SECRET)],
    );
  });

  it('also accepts a plain rows array', async () => {
    const { service } = createService(
      jest.fn().mockResolvedValue([
        { expires_at: new Date(Date.now() + 60_000) },
      ]),
    );

    await expect(
      service.consumeLoginToken(`${TOKEN_ID}:${TOKEN_SECRET}`),
    ).resolves.toBeUndefined();
  });

  it('rejects a token that was already consumed', async () => {
    const { service } = createService(jest.fn().mockResolvedValue([[], 0]));

    await expect(
      service.consumeLoginToken(`${TOKEN_ID}:${TOKEN_SECRET}`),
    ).rejects.toMatchObject({
      response: { code: 'CAPTCHA_FAILED' },
    });
  });

  it('rejects an expired token even though it was deleted', async () => {
    const { service } = createService(
      jest.fn().mockResolvedValue([
        [{ expires_at: new Date(Date.now() - 1_000) }],
        1,
      ]),
    );

    await expect(
      service.consumeLoginToken(`${TOKEN_ID}:${TOKEN_SECRET}`),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects malformed tokens before touching the database', async () => {
    const { service, query } = createService();

    await expect(service.consumeLoginToken('not-a-token')).rejects.toMatchObject(
      { response: { code: 'CAPTCHA_FAILED' } },
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('fails closed when the token store is unavailable', async () => {
    const { service } = createService(
      jest.fn().mockRejectedValue(new Error('connection refused')),
    );

    await expect(
      service.consumeLoginToken(`${TOKEN_ID}:${TOKEN_SECRET}`),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('CapService.cleanupExpired', () => {
  it('deletes expired nonces and tokens', async () => {
    const { service, query } = createService(
      jest.fn().mockResolvedValue([[], 0]),
    );

    await service.cleanupExpired();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM public.cap_nonce'),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM public.cap_token'),
    );
  });
});
