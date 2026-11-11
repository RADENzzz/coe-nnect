import { IdpDeviceGuard } from '../src/modules/idp/idp-device.guard';

const DEVICE_KEY = 'test-device-key';

function buildContext(headers: Record<string, any> = {}, method = 'POST') {
  const req: any = { method, headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    req,
  } as any;
}

function expectIdpError(fn: () => unknown, code: string, pattern: RegExp) {
  try {
    fn();
    throw new Error('Expected an IdpError to be thrown.');
  } catch (err: any) {
    expect(err.getStatus()).toBe(401);
    const body = err.getResponse();
    expect(body.error.code).toBe(code);
    expect(body.error.message).toMatch(pattern);
  }
}

describe('IdpDeviceGuard', () => {
  let config: any;
  let guard: IdpDeviceGuard;

  beforeEach(() => {
    config = {
      get: jest.fn((key: string) =>
        key === 'IDP_DEVICE_API_KEY' ? DEVICE_KEY : undefined,
      ),
    };
    guard = new IdpDeviceGuard(config);
  });

  it('accepts the configured bearer key', () => {
    const ctx = buildContext({
      authorization: `Bearer ${DEVICE_KEY}`,
      'x-request-id': 'req-1',
      'x-idp-device-id': 'desk-7',
    });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(ctx.req.idpRequestId).toBe('req-1');
    expect(ctx.req.idpDeviceId).toBe('desk-7');
  });

  it('allows CORS preflight through', () => {
    expect(guard.canActivate(buildContext({}, 'OPTIONS'))).toBe(true);
  });

  it('rejects a missing Authorization header', () => {
    expectIdpError(
      () => guard.canActivate(buildContext({})),
      'unauthorized',
      /Missing Authorization/,
    );
  });

  it('rejects a non-bearer scheme', () => {
    expectIdpError(
      () => guard.canActivate(buildContext({ authorization: DEVICE_KEY })),
      'unauthorized',
      /Missing Authorization/,
    );
  });

  it('rejects an invalid device key', () => {
    expectIdpError(
      () => guard.canActivate(buildContext({ authorization: 'Bearer nope' })),
      'unauthorized',
      /Invalid IDP device API key/,
    );
  });

  it('fails closed when the device key is not configured', () => {
    config.get = jest.fn(() => undefined);

    expectIdpError(
      () =>
        guard.canActivate(
          buildContext({ authorization: `Bearer ${DEVICE_KEY}` }),
        ),
      'unauthorized',
      /not configured/,
    );
  });
});
