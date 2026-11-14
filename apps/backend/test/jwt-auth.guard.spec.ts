import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';

class TestController {}

function createContext(authorization?: string, handler?: () => void) {
  const req: any = {
    method: 'GET',
    headers: authorization ? { authorization } : {},
  };
  const ctx: any = {
    getType: () => 'http',
    getHandler: () => handler ?? TestController,
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => req }),
  };
  return { ctx, req };
}

function createGuard(
  verification: unknown,
  maintenance = { active: false, title: null, message: null },
) {
  const supabase = {
    verifyAccessToken: jest.fn().mockResolvedValue(verification),
  };
  const systemStatus = {
    getMaintenanceNotice: jest.fn().mockResolvedValue(maintenance),
  };
  return {
    guard: new JwtAuthGuard(
      supabase as any,
      systemStatus as any,
      new Reflector(),
    ),
    supabase,
    systemStatus,
  };
}

describe('JwtAuthGuard', () => {
  it('rejects a request without a bearer token', async () => {
    const { guard } = createGuard({ status: 'invalid', message: 'n/a' });
    const { ctx } = createContext();

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('returns 401 when the token itself is invalid', async () => {
    const { guard } = createGuard({
      status: 'invalid',
      message: 'invalid JWT',
    });
    const { ctx } = createContext('Bearer bad-token');

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('returns a retryable 503 when the auth provider is unavailable', async () => {
    const { guard } = createGuard({
      status: 'unavailable',
      message: 'fetch failed',
    });
    const { ctx } = createContext('Bearer token');

    expect.assertions(2);
    try {
      await guard.canActivate(ctx);
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as ServiceUnavailableException).getResponse()).toMatchObject({
        code: 'AUTH_PROVIDER_UNAVAILABLE',
      });
    }
  });

  it('does not attach a user when the provider is unavailable', async () => {
    const { guard } = createGuard({
      status: 'unavailable',
      message: 'fetch failed',
    });
    const { ctx, req } = createContext('Bearer token');

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(req.user).toBeUndefined();
  });

  it('accepts a valid token and attaches the user', async () => {
    const user = { id: 'user-1' };
    const { guard } = createGuard({ status: 'valid', user });
    const { ctx, req } = createContext('Bearer token');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toBe(user);
  });

  it('still blocks non-admins while maintenance mode is on', async () => {
    const supabase = {
      verifyAccessToken: jest
        .fn()
        .mockResolvedValue({ status: 'valid', user: { id: 'user-1' } }),
      getAdminClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { role: 'department_head' },
              }),
            }),
          }),
        }),
      }),
    };
    const systemStatus = {
      getMaintenanceNotice: jest.fn().mockResolvedValue({
        active: true,
        title: 'Maintenance',
        message: 'Down for upgrades',
      }),
    };
    const guard = new JwtAuthGuard(
      supabase as any,
      systemStatus as any,
      new Reflector(),
    );
    const { ctx } = createContext('Bearer token');

    expect.assertions(2);
    try {
      await guard.canActivate(ctx);
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as ServiceUnavailableException).getResponse()).toMatchObject({
        code: 'MAINTENANCE_MODE',
      });
    }
  });

  it('skips authentication for routes marked @Public()', async () => {
    const { guard, supabase } = createGuard({
      status: 'invalid',
      message: 'n/a',
    });
    function publicHandler() {}
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, publicHandler);
    const { ctx } = createContext(undefined, publicHandler);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(supabase.verifyAccessToken).not.toHaveBeenCalled();
  });
});
