import { createHmac } from 'crypto';
import { IdpSignatureGuard } from '../src/modules/idp/idp-signature.guard';

const SECRET = 'test-webhook-secret';

function buildContext(opts: {
  body?: unknown;
  rawBody?: Buffer;
  signature?: string | null;
  timestamp?: string | null;
}) {
  const rawBody =
    opts.rawBody ??
    Buffer.from(JSON.stringify(opts.body ?? { hello: 'world' }), 'utf8');
  const req: any = {
    method: 'POST',
    rawBody,
    headers: {
      'x-idp-signature': opts.signature ?? undefined,
      'x-idp-timestamp': opts.timestamp ?? undefined,
    },
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    req,
  } as any;
}

function sign(body: Buffer, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function expectIdpError(
  fn: () => unknown,
  code: string,
  messagePattern: RegExp,
): void {
  try {
    fn();
    throw new Error('Expected an IdpError to be thrown.');
  } catch (err: any) {
    expect(err.getStatus()).toBe(401);
    const body = err.getResponse();
    expect(body.error.code).toBe(code);
    expect(body.error.message).toMatch(messagePattern);
  }
}

describe('IdpSignatureGuard', () => {
  const now = new Date('2026-11-08T10:00:00Z');

  let config: any;
  let guard: IdpSignatureGuard;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    config = {
      get: jest.fn((key: string) => {
        if (key === 'IDP_WEBHOOK_SECRET') return SECRET;
        if (key === 'IDP_WEBHOOK_TOLERANCE_MS') return '300000';
        return undefined;
      }),
    };
    guard = new IdpSignatureGuard(config);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts a valid signature within the timestamp window', () => {
    const body = Buffer.from(JSON.stringify({ event_id: 'evt-1' }), 'utf8');
    const ctx = buildContext({
      rawBody: body,
      signature: sign(body),
      timestamp: now.toISOString(),
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects a missing signature', () => {
    const ctx = buildContext({
      signature: null,
      timestamp: now.toISOString(),
    });

    expectIdpError(
      () => guard.canActivate(ctx),
      'unauthorized',
      /Missing X-IDP-Signature/,
    );
  });

  it('rejects a bad signature', () => {
    const body = Buffer.from(JSON.stringify({ event_id: 'evt-1' }), 'utf8');
    const ctx = buildContext({
      rawBody: body,
      signature: `sha256=${'0'.repeat(64)}`,
      timestamp: now.toISOString(),
    });

    expectIdpError(
      () => guard.canActivate(ctx),
      'unauthorized',
      /Invalid X-IDP-Signature/,
    );
  });

  it('rejects a timestamp outside the 5-minute tolerance', () => {
    const body = Buffer.from(JSON.stringify({ event_id: 'evt-1' }), 'utf8');
    const ctx = buildContext({
      rawBody: body,
      signature: sign(body),
      timestamp: new Date(now.getTime() - 6 * 60 * 1000).toISOString(),
    });

    expectIdpError(
      () => guard.canActivate(ctx),
      'unauthorized',
      /outside the allowed signing window/,
    );
  });

  it('fails closed when the webhook secret is not configured', () => {
    config.get = jest.fn((key: string) =>
      key === 'IDP_WEBHOOK_SECRET' ? undefined : '300000',
    );
    const body = Buffer.from('{}', 'utf8');
    const ctx = buildContext({
      rawBody: body,
      signature: sign(body),
      timestamp: now.toISOString(),
    });

    expectIdpError(
      () => guard.canActivate(ctx),
      'unauthorized',
      /not configured/,
    );
  });
});
